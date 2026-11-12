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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';
import { FloatingNotifications } from '@/modules/floating-notifications';

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

const STYLE = `
  @page { margin: 14mm; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; color: #000; }
  .c { text-align: center; }
  .co { font-size: 14px; font-weight: bold; }
  .party { font-size: 12px; font-weight: bold; margin-top: 8px; }
  .gap { height: 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 4px; }
  td { padding: 2.5px 4px; vertical-align: top; }
  .r { text-align: right; }
  .b { font-weight: bold; }
  .i { font-style: italic; }
  .tot td { border-top: 1px solid #000; font-weight: bold; }
  .red { color: #C80000; }
  .green { color: #008000; }
`;

function header(party: string, title: string, address: string[], range: string, subtitle?: string) {
    return `
    <div class="c">
      <div class="co">${esc(COMPANY.name)}</div>
      ${COMPANY.lines.map(l => `<div>${esc(l)}</div>`).join('')}
      <div style="text-decoration:underline">${esc(COMPANY.contact)}</div>
      <div class="party">${esc(party.toUpperCase())}</div>
      <div>${esc(title)}</div>
      ${address.map(l => `<div>${esc(l)}</div>`).join('')}
      <div class="gap"></div>
      <div>${esc(range)}</div>
      ${subtitle ? `<div class="b">${esc(subtitle)}</div>` : ''}
    </div>`;
}

const page = (body: string) => `<html><head><meta charset="utf-8"/><style>${STYLE}</style></head><body>${body}</body></html>`;

/** Tally data saved in ERP as a Note: "Tally Customer Bills" or "Tally Customer Ledgers". */
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

async function buildOutstanding(customer: string, fromIso: string, toIso: string): Promise<{ html: string; file: string } | string> {
    const [info, bills] = await Promise.all([customerInfo(customer), tallyNote('Tally Customer Bills')]);
    const rec = pick(bills, customer, info.name);
    if (!rec) return 'No Tally pending bills found for this customer.';

    const rows: string[] = [];
    let opTot = 0, pendTot = 0;
    (rec.bills || []).forEach((b: any[]) => {
        // b = [date yyyy-mm-dd, ref, opening amount, pending amount, overdue days, due on]
        if (Math.abs(b[3]) < 1) return;
        opTot += b[2]; pendTot += b[3];
        rows.push(`<tr><td class="b">${dmy(b[0])}</td><td>${esc(b[1])}</td><td class="r">${inr(b[2])} Dr</td>` +
            `<td class="r b">${inr(b[3])} Dr</td><td class="r i">${b[4] ? esc(b[4]) : ''}</td></tr>`);
    });
    if (rows.length) {
        rows.push(`<tr class="tot"><td></td><td>Sub Total</td><td class="r">${inr(opTot)} Dr</td><td class="r">${inr(pendTot)} Dr</td><td></td></tr>`);
    }
    const diff = round2(Number(rec.diff || 0));
    const net = round2(pendTot + diff);
    if (diff <= -1) {
        rows.push(`<tr><td></td><td class="i">On Account (NOT ADJUSTED)</td><td></td><td class="r">${inr(-diff)} Cr</td><td></td></tr>`);
    } else if (diff >= 1) {
        rows.push(`<tr><td></td><td class="i">Balance not in bills</td><td class="r">${inr(diff)} Dr</td><td class="r">${inr(diff)} Dr</td><td></td></tr>`);
    }
    if (!rows.length) return 'No pending bills for this customer.';
    const netText = net >= 0 ? `${inr(net)} Dr` : `${inr(-net)} Cr`;
    rows.push(`<tr class="tot"><td></td><td>Net Balance (TO BE RECEIVED)</td><td></td>` +
        `<td class="r ${net >= 0 ? 'red' : 'green'}">${netText}</td><td></td></tr>`);

    const html = page(
        header(info.name, 'Bill-wise Details', [], `${dmy(fromIso)} to ${dmy(toIso)}`, 'Pending Bills') +
        `<table><thead><tr><th>Date</th><th>Ref. No.</th><th class="r">Opening Amount</th><th class="r">Pending Amount</th><th class="r">Overdue by days</th></tr></thead>
         <tbody>${rows.join('')}</tbody></table>`
    );
    return { html, file: `Outstanding_${info.name.replace(/[^A-Za-z0-9]+/g, '_')}_${toIso}` };
}

async function buildLedger(customer: string, fromIso: string, toIso: string): Promise<{ html: string; file: string } | string> {
    const [info, ledgers, bills] = await Promise.all([
        customerInfo(customer),
        tallyNote('Tally Customer Ledgers'),
        tallyNote('Tally Customer Bills'),
    ]);
    const rec = pick(ledgers, customer, info.name);
    if (!rec) return 'No Tally ledger found for this customer.';

    const fromD = fromIso.replace(/-/g, '');
    const toD = toIso.replace(/-/g, '');
    // Balance brought forward: Tally opening plus every entry before the period.
    // Tally signs: negative = Dr, positive = Cr.
    let bf: number = rec.open || 0;
    (rec.lines || []).forEach((l: any[]) => { if (l[0] < fromD) bf += l[3]; });
    // Bills below Re 1 are hidden in the outstanding statement, so they are left out of the balance too.
    const brec = pick(bills, customer, info.name);
    let hidden = 0;
    if (brec) (brec.bills || []).forEach((bl: any[]) => { if (Math.abs(bl[3]) < 1) hidden += bl[3]; });
    bf = round2(bf + hidden);

    // lines: [yyyymmdd, vch type, vch no, amount, particulars]
    const inRange = (rec.lines || []).filter((l: any[]) => l[0] >= fromD && l[0] <= toD && Math.abs(l[3]) >= 1);
    if (!inRange.length && Math.abs(bf) < 0.005) return 'No ledger entries for this customer in the selected period.';

    const money = (x: number) => inr(Math.abs(x));
    let dr = 0, cr = 0;
    const addAmt = (x: number) => { if (x < 0) dr += -x; else cr += x; };
    const body: string[] = [];

    if (Math.abs(bf) >= 1) {
        body.push(`<tr class="b"><td></td><td class="b">Opening Balance</td><td></td><td></td>` +
            `<td class="r">${bf < 0 ? money(bf) : ''}</td><td class="r">${bf > 0 ? money(bf) : ''}</td></tr>`);
        addAmt(bf);
    }
    inRange.forEach((l: any[]) => {
        const x = round2(l[3]);
        body.push(`<tr><td>${dmy(ymd(l[0]))}</td><td>${esc(l[4])}</td><td>${esc(l[1])}</td><td class="r">${esc(l[2])}</td>` +
            `<td class="r">${x < 0 ? money(x) : ''}</td><td class="r">${x > 0 ? money(x) : ''}</td></tr>`);
        addAmt(x);
    });

    const totDr = round2(dr), totCr = round2(cr);
    const diff = round2(totDr - totCr);
    body.push(`<tr class="tot"><td></td><td></td><td></td><td></td><td class="r">${inr(totDr)}</td><td class="r">${inr(totCr)}</td></tr>`);
    if (Math.abs(diff) >= 0.005) {
        // Dr total above Cr total: the customer owes money, so the closing sits on the Cr side in red.
        body.push(`<tr><td></td><td class="b">Closing Balance</td><td></td><td></td>` +
            `<td class="r green b">${diff < 0 ? inr(-diff) : ''}</td><td class="r red b">${diff > 0 ? inr(diff) : ''}</td></tr>`);
        const grand = Math.max(totDr, totCr);
        body.push(`<tr class="tot"><td></td><td></td><td></td><td></td><td class="r">${inr(grand)}</td><td class="r">${inr(grand)}</td></tr>`);
    }

    const html = page(
        header(info.name, 'Ledger Account', info.address, `${dmy(fromIso)} to ${dmy(toIso)}`) +
        `<table><thead><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th class="r">Vch No.</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead>
         <tbody>${body.join('')}</tbody></table>`
    );
    return { html, file: `Ledger_${info.name.replace(/[^A-Za-z0-9]+/g, '_')}_${toIso}` };
}

export type StatementDoc = { fileName: string; uri: string; base64: string };
export type BuildResult = { ok: true; doc: StatementDoc } | { ok: false; error: string };

/** Builds the statement PDF and reads it back for the in-app viewer. Dates are yyyy-mm-dd; a blank `fromIso` means FY start. */
export async function buildStatement(kind: StatementKind, customer: string, fromIso: string, toIso: string): Promise<BuildResult> {
    if (!customer) return { ok: false, error: 'Select a customer in the Customer filter first.' };
    const to = toIso || localTodayIso();
    const from = fromIso || fyStartIso(to);
    try {
        const built = kind === 'outstanding' ? await buildOutstanding(customer, from, to) : await buildLedger(customer, from, to);
        if (typeof built === 'string') return { ok: false, error: built };
        // Name the file the way ERP does (e.g. Outstanding_<customer>_<date>.pdf) rather than expo-print's random id.
        const printed = await Print.printToFileAsync({ html: built.html });
        const fileName = `${built.file}.pdf`;
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.deleteAsync(uri, { idempotent: true });
        await FileSystem.moveAsync({ from: printed.uri, to: uri });
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        return { ok: true, doc: { fileName, uri, base64 } };
    } catch (e: any) {
        return { ok: false, error: 'Could not build the PDF. You may not have permission to read the invoices or receipts for this customer.' };
    }
}

/** Saves the PDF into the phone's Downloads folder. Returns the saved location, or '' if it could not be saved. */
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
