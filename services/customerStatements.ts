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
const PAID_RECEIPT_STATUS = ['Matched', 'Document Created'];

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

function esiList(customer: string, fields: string[], extra: any[], orderBy: string) {
    return getList('External Sales Invoice', {
        fields,
        filters: [['status', '!=', 'Cancelled'], ...extra],
        orFilters: [['customer', '=', customer], ['buyer_name', '=', customer]],
        orderBy,
    });
}

function receiptList(customer: string, fields: string[], extra: any[], orderBy: string) {
    return getList('External Payment Receipt', {
        fields,
        filters: [['customer', '=', customer], ['status', 'in', PAID_RECEIPT_STATUS], ...extra],
        orderBy,
    });
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

async function buildOutstanding(customer: string, fromIso: string, toIso: string): Promise<{ html: string; file: string } | string> {
    const [info, bills, receipts] = await Promise.all([
        customerInfo(customer),
        esiList(customer, ['name', 'invoice_number', 'invoice_date', 'invoice_total', 'sales_invoice_linked'],
            [['invoice_date', 'between', [fromIso, toIso]]], 'invoice_date asc, name asc'),
        receiptList(customer, ['sales_invoice', 'amount'], [['date', '<=', toIso]], 'date asc, name asc'),
    ]);

    const paidBy: Record<string, number> = {};
    receipts.forEach((r: any) => { if (r.sales_invoice) paidBy[r.sales_invoice] = (paidBy[r.sales_invoice] || 0) + Number(r.amount || 0); });

    const end = new Date(`${toIso}T00:00:00`).getTime();
    let totOpen = 0, totPend = 0;
    const rows: string[] = [];
    bills.forEach((b: any) => {
        const total = Number(b.invoice_total || 0);
        const paid = b.sales_invoice_linked ? (paidBy[b.sales_invoice_linked] || 0) : 0;
        const pend = Math.round((total - paid) * 100) / 100;
        if (pend <= 0.005) return;
        const late = Math.floor((end - new Date(`${b.invoice_date}T00:00:00`).getTime()) / 86400000);
        totOpen += total; totPend += pend;
        rows.push(`<tr><td class="b">${dmy(b.invoice_date)}</td><td>${esc(b.invoice_number || b.name)}</td>` +
            `<td class="r">${inr(total)} Dr</td><td class="r b">${inr(pend)} Dr</td><td>${dmy(b.invoice_date)}</td>` +
            `<td class="r i">${late > 0 ? late : ''}</td></tr>`);
    });
    if (!rows.length) return 'No pending bills for this customer in the selected period.';

    const html = page(
        header(info.name, 'Bill-wise Details', [], `${dmy(fromIso)} to ${dmy(toIso)}`, 'Pending Bills') +
        `<table><thead><tr><th>Date</th><th>Ref. No.</th><th class="r">Opening Amount</th><th class="r">Pending Amount</th><th>Due on</th><th class="r">Overdue by days</th></tr></thead>
         <tbody>${rows.join('')}
         <tr class="tot"><td></td><td></td><td class="r">${inr(totOpen)} Dr</td><td class="r">${inr(totPend)} Dr</td><td></td><td></td></tr></tbody></table>`
    );
    return { html, file: `Outstanding_${info.name.replace(/[^A-Za-z0-9]+/g, '_')}_${toIso}` };
}

async function buildLedger(customer: string, fromIso: string, toIso: string): Promise<{ html: string; file: string } | string> {
    const [info, openBills, openReceipts, bills, receipts] = await Promise.all([
        customerInfo(customer),
        esiList(customer, ['invoice_number', 'invoice_date', 'invoice_total'], [['invoice_date', '<', fromIso]], 'invoice_date asc'),
        receiptList(customer, ['amount', 'date'], [['date', '<', fromIso]], 'date asc'),
        esiList(customer, ['name', 'invoice_number', 'invoice_date', 'invoice_total', 'sales_invoice_linked'],
            [['invoice_date', 'between', [fromIso, toIso]]], 'invoice_date asc, name asc'),
        receiptList(customer, ['voucher_no', 'date', 'amount', 'received_in', 'reference'],
            [['date', 'between', [fromIso, toIso]]], 'date asc, name asc'),
    ]);

    let openDr = 0, openCr = 0;
    openBills.forEach((b: any) => { openDr += Number(b.invoice_total || 0); });
    openReceipts.forEach((r: any) => { openCr += Number(r.amount || 0); });

    type Row = { date: string; side: string; part: string; vtype: string; vno: string; dr: number; cr: number };
    const rows: Row[] = [];
    const openNet = Math.round((openDr - openCr) * 100) / 100;
    if (Math.abs(openNet) > 0.005) {
        rows.push({ date: '', side: openNet > 0 ? 'Dr' : 'Cr', part: 'Opening Balance', vtype: '', vno: '', dr: openNet > 0 ? openNet : 0, cr: openNet < 0 ? -openNet : 0 });
    }

    const entries: { date: string; dr: number; cr: number; part: string; vtype: string; vno: string; ord: number }[] = [];
    bills.forEach((b: any) => entries.push({ date: b.invoice_date, dr: Number(b.invoice_total || 0), cr: 0, part: 'Sales', vtype: 'GST Sales', vno: b.invoice_number || b.name, ord: 0 }));
    receipts.forEach((r: any) => entries.push({ date: r.date, dr: 0, cr: Number(r.amount || 0), part: r.received_in || 'Bank', vtype: 'Receipt', vno: r.voucher_no || r.reference || '', ord: 1 }));
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord));
    entries.forEach(e => rows.push({ date: dmy(e.date), side: e.dr > 0 ? 'Dr' : 'Cr', part: e.part, vtype: e.vtype, vno: e.vno, dr: e.dr, cr: e.cr }));

    if (!rows.length) return 'No ledger entries for this customer in the selected period.';

    let cumDr = 0, cumCr = 0;
    rows.forEach(r => { cumDr += r.dr; cumCr += r.cr; });
    const diff = Math.abs(cumDr - cumCr);
    const side = cumCr > cumDr ? 'Cr' : 'Dr';
    const grand = Math.max(cumDr, cumCr);

    const body = rows.map(r =>
        `<tr><td>${esc(r.date)}</td><td class="b">${r.side}&nbsp;&nbsp;${esc(r.part)}</td><td class="b">${esc(r.vtype)}</td>` +
        `<td class="r">${esc(r.vno)}</td><td class="r">${r.dr ? inr(r.dr) : ''}</td><td class="r">${r.cr ? inr(r.cr) : ''}</td></tr>`
    ).join('');

    const html = page(
        header(info.name, 'Ledger Account', info.address, `${dmy(fromIso)} to ${dmy(toIso)}`) +
        `<table><thead><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th class="r">Vch No.</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead>
         <tbody>${body}
         <tr class="tot"><td></td><td></td><td></td><td></td><td class="r">${inr(cumDr)}</td><td class="r">${inr(cumCr)}</td></tr>
         <tr><td></td><td class="b">${side}&nbsp;&nbsp;Closing Balance</td><td></td><td></td><td class="r">${side === 'Cr' ? inr(diff) : ''}</td><td class="r">${side === 'Dr' ? inr(diff) : ''}</td></tr>
         <tr class="tot"><td></td><td></td><td></td><td></td><td class="r">${inr(grand)}</td><td class="r">${inr(grand)}</td></tr></tbody></table>`
    );
    return { html, file: `Ledger_${info.name.replace(/[^A-Za-z0-9]+/g, '_')}_${toIso}` };
}

export type StatementDoc = { fileName: string; uri: string; base64: string };
export type BuildResult = { ok: true; doc: StatementDoc } | { ok: false; error: string };

/** Builds the statement PDF and reads it back for the in-app viewer. Dates are yyyy-mm-dd; a blank `fromIso` means FY start. */
export async function buildStatement(kind: StatementKind, customer: string, fromIso: string, toIso: string): Promise<BuildResult> {
    if (!customer) return { ok: false, error: 'Select a customer in the Customer filter first.' };
    const to = toIso || new Date().toISOString().slice(0, 10);
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
