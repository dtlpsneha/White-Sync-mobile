/**
 * customerStatements.ts — "Outstanding bills" and "Ledger account" PDF
 * statements for one customer, ported from the ERPNext "Daily Sales Report"
 * client script (Sales Invoice History tab: the Outstanding / Ledger PDF
 * buttons). Same data and same layout: bills come from External Sales Invoice,
 * payments from External Payment Receipt (counted as paid only when Matched
 * or Document Created). The PDF is rendered from HTML with expo-print, shown
 * in an in-app viewer, and can be shared or saved to Downloads.
 */

import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';
import { FloatingNotifications } from '@/modules/floating-notifications';
import { ERP_PDF_CORE } from '@/services/erpPdfCore';

const COMPANY = {
    name: 'White & Co',
    lines: ['130 RAMALINGAM ROAD', 'R.S.PURAM', 'COIMBATORE - 641 002.', 'MSME : UDYAM/TN-03-0011357'],
    contact: 'Contact : 0422-2470625,0422-2470280',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type StatementKind = 'outstanding' | 'ledger';
export type StatementResult = { ok: true } | { ok: false; error: string };

const session = () => SecureStore.getItemAsync('session_cookies');

const inr = (n: number | string | undefined) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** yyyy-mm-dd -> 5-Nov-2026 */
const dmy = (iso?: string) => {
    if (!iso) return '';
    const p = String(iso).slice(0, 10).split('-');
    return `${parseInt(p[2], 10)}-${MONTHS[parseInt(p[1], 10) - 1]}-${p[0]}`;
};

const esc = (v: unknown) =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Today's date on the phone (local time), as yyyy-mm-dd. */
export function localTodayIso() {
    const d = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Financial year start (1 April) for the year containing `toIso`. */
export function fyStartIso(toIso: string) {
    const d = new Date(`${toIso}T00:00:00`);
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}-04-01`;
}

async function getList(doctype: string, params: {
    fields: string[];
    filters?: any[];
    orFilters?: any[];
    orderBy?: string;
    limit?: number;
}): Promise<any[]> {
    const qs =
        `fields=${encodeURIComponent(JSON.stringify(params.fields))}` +
        (params.filters ? `&filters=${encodeURIComponent(JSON.stringify(params.filters))}` : '') +
        (params.orFilters ? `&or_filters=${encodeURIComponent(JSON.stringify(params.orFilters))}` : '') +
        (params.orderBy ? `&order_by=${encodeURIComponent(params.orderBy)}` : '') +
        `&limit_page_length=${params.limit ?? 100000}`;
    const res = await apiGet(apiUrl(`/api/resource/${encodeURIComponent(doctype)}?${qs}`), await session());
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    return res.data?.data || [];
}

/** Customer name + first linked postal address. Falls back to the id on any failure. */
async function customerInfo(customer: string): Promise<{ name: string; address: string[] }> {
    const info = { name: customer, address: [] as string[] };
    try {
        const res = await apiGet(apiUrl(
            `/api/method/frappe.client.get_value?doctype=Customer` +
            `&filters=${encodeURIComponent(JSON.stringify({ name: customer }))}&fieldname=customer_name`
        ), await session());
        const n = res.ok ? (res.data as any)?.message?.customer_name : null;
        if (n) info.name = n;
    } catch { /* keep id */ }
    try {
        const rows = await getList('Address', {
            fields: ['address_line1', 'address_line2', 'city', 'state', 'pincode'],
            filters: [['Dynamic Link', 'link_doctype', '=', 'Customer'], ['Dynamic Link', 'link_name', '=', customer]],
            limit: 1,
        });
        const a = rows[0];
        if (a) {
            [a.address_line1, a.address_line2, a.city, [a.state, a.pincode].filter(Boolean).join(' - ')].forEach(l => {
                if (l && String(l).trim()) info.address.push(String(l).trim().toUpperCase());
            });
        }
    } catch { /* no address */ }
    return info;
}

type TallyRecord = Record<string, any>;
async function tallyNote(title: string): Promise<TallyRecord> {
    try {
        const rows = await getList('Note', { fields: ['content'], filters: [['title', '=', title]], limit: 1 });
        return rows[0]?.content ? JSON.parse(rows[0].content) : {};
    } catch {
        return {};
    }
}

const normKey = (v: string) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pick = (all: TallyRecord, customer: string, name: string) => all[normKey(customer)] || all[normKey(name)];
const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type StatementDoc = { fileName: string; uri: string; base64: string };
export type BuildResult = { ok: true; doc: StatementDoc } | { ok: false; error: string };

/** Builds the statement PDF and reads it back for the in-app viewer. Dates are yyyy-mm-dd; a blank `fromIso` means FY start. */
export type StatementJob = { fileName: string; html: string };
export type PrepareResult = { ok: true; job: StatementJob } | { ok: false; error: string };

/** Builds the page that runs ERP's own PDF code for one customer; the screen runs it in a hidden WebView. */
export async function prepareStatement(kind: StatementKind, customer: string, fromIso: string, toIso: string): Promise<PrepareResult> {
    if (!customer) return { ok: false, error: 'Select a customer in the Customer filter first.' };
    const to = toIso || localTodayIso();
    const from = fromIso || fyStartIso(to);
    try {
        const info = await customerInfo(customer);
        const [ledgers, bills] = await Promise.all([tallyNote('Tally Customer Ledgers'), tallyNote('Tally Customer Bills')]);
        const keys = [normKey(customer), normKey(info.name)];
        const subset = (all: TallyRecord): TallyRecord =>
            Object.fromEntries(keys.filter(k => all[k]).map(k => [k, all[k]]));
        const payload = {
            kind,
            customer,
            info,
            all: kind === 'outstanding' ? subset(bills) : subset(ledgers),
            bills: subset(bills),
            from,
            to,
        };
        const prefix = kind === 'outstanding' ? 'Outstanding' : 'Ledger';
        const fileName = `${prefix}_${String(info.name).replace(/[^A-Za-z0-9]+/g, '_')}_${to}.pdf`;
        return { ok: true, job: { fileName, html: jobHtml(payload) } };
    } catch {
        return { ok: false, error: 'Could not read the Tally data for this customer.' };
    }
}

function jobHtml(payload: object) {
    const data = JSON.stringify(payload).replace(/</g, '\u003c');
    return `<!doctype html><html><head><meta charset="utf-8"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
</head><body><script>${ERP_PDF_CORE}
(function () {
  var p = ${data};
  var out;
  try {
    out = p.kind === 'outstanding'
      ? erpOutstanding(p.customer, p.info, p.all, p.from, p.to)
      : erpLedger(p.customer, p.info, p.all, p.bills, p.from, p.to);
  } catch (e) { out = { error: String((e && e.message) || e) }; }
  window.ReactNativeWebView.postMessage(JSON.stringify(out || { error: 'Could not build the statement.' }));
})();
</script></body></html>`;
}

/** Saves the PDF the page produced (a data URI) into the cache, ready for the viewer, share and download. */
export async function writeStatementPdf(fileName: string, dataUri: string): Promise<StatementDoc> {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    return { fileName, uri, base64 };
}

export function saveStatementToDownloads(doc: StatementDoc): string {
    return FloatingNotifications.saveToDownloads(doc.uri.replace(/^file:\/\//, ''), doc.fileName);
}

/** Opens the phone's share sheet with the PDF (fallback when saving to Downloads is not possible). */
export async function shareStatement(doc: StatementDoc): Promise<boolean> {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(doc.uri, { mimeType: 'application/pdf', dialogTitle: doc.fileName, UTI: 'com.adobe.pdf' });
    return true;
}

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/** Draws every page of a PDF (passed as base64) onto canvases, so it shows inside the app without a PDF viewer app. */
export function pdfViewerHtml(base64: string) {
    return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
<style>
  html, body { margin: 0; padding: 0; background: #E5E7EB; }
  #pages { padding: 8px 0 12px; }
  canvas { display: block; width: 100%; height: auto; margin: 0 auto 8px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
  #msg { font: 14px sans-serif; color: #374151; padding: 28px; text-align: center; }
</style></head><body>
<div id="msg">Rendering statement&hellip;</div>
<div id="pages"></div>
<script src="${PDFJS_BASE}/pdf.min.js"></script>
<script>
(async function () {
  var msg = document.getElementById('msg');
  try {
    if (!window.pdfjsLib) throw new Error('PDF library could not be loaded. Check your internet connection.');
    var code = await (await fetch('${PDFJS_BASE}/pdf.worker.min.js')).text();
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    var bin = atob('${base64}');
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    msg.style.display = 'none';
    var holder = document.getElementById('pages');
    var dpr = Math.min(window.devicePixelRatio || 2, 3);
    var cssW = document.documentElement.clientWidth || window.innerWidth;
    for (var n = 1; n <= pdf.numPages; n++) {
      var page = await pdf.getPage(n);
      var base = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: (cssW / base.width) * dpr * 1.5 });
      var canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      holder.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) {
    msg.style.display = 'block';
    msg.textContent = 'Could not display the statement: ' + ((e && e.message) || e);
  }
})();
</script></body></html>`;
}
