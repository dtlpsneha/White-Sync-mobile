/**
 * tallyData.ts — the "Tally Stock List" and "Payment Details" tabs of ERPNext's
 * Daily Sales Report, ported to the phone. Same sources as the ERP tabs: the
 * Tally snapshot / lots / bank-debit records saved in ERP as Notes, plus the
 * Item, Bin, Customer and Approving Authority master data.
 */

import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';

export const STOCK_BRANDS = ['Precitex', 'Habasit', 'Inspiron', 'Supreme', 'Sterling', 'Velplast', 'Aristo', 'Brite', 'Borgosesia'];
export const STOCK_TARGET_WAREHOUSE = 'Stores - W&C';
export const PAY_BANK_NAME = 'ICICI BANK - 47963';

export type StockItem = { item_code: string; item_name: string; brand: string; stock_uom: string };
export type StockBin = { item_code: string; warehouse: string; actual_qty: number };
export type StockData = {
    items: StockItem[];
    binsByItem: Record<string, StockBin[]>;
    tally: Record<string, number>;
    lots: Record<string, { lots: [string, string, string, number, number][] }>;
};

const session = () => SecureStore.getItemAsync('session_cookies');

async function listDocs(doctype: string, fields: string[], filters: any[] = []): Promise<any[]> {
    const qs =
        `fields=${encodeURIComponent(JSON.stringify(fields))}` +
        (filters.length ? `&filters=${encodeURIComponent(JSON.stringify(filters))}` : '') +
        `&limit_page_length=0`;
    const res = await apiGet(apiUrl(`/api/resource/${encodeURIComponent(doctype)}?${qs}`), await session());
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    return (res.data as any)?.data || [];
}

/** The JSON saved in an ERP Note with this title, or {} if it is missing. */
async function noteJson(title: string): Promise<any> {
    try {
        const rows = await listDocs('Note', ['content'], [['title', '=', title]]);
        return rows[0]?.content ? JSON.parse(rows[0].content) : {};
    } catch {
        return {};
    }
}

export const stockBrandOf = (it: { brand?: string | null }): string | null => {
    const b = String(it.brand || '').trim().toLowerCase();
    return STOCK_BRANDS.find(x => x.toLowerCase() === b) || null;
};

export async function loadStockData(): Promise<StockData> {
    const [items, bins, snapshot, lots] = await Promise.all([
        listDocs('Item', ['item_code', 'item_name', 'brand', 'stock_uom']),
        listDocs('Bin', ['item_code', 'warehouse', 'actual_qty', 'reserved_qty', 'projected_qty']),
        noteJson('Tally Stock Snapshot'),
        noteJson('Tally Stock Lots'),
    ]);
    const binsByItem: Record<string, StockBin[]> = {};
    bins.forEach((b: StockBin) => {
        (binsByItem[b.item_code] = binsByItem[b.item_code] || []).push(b);
    });
    // Only items that exist in Tally and belong to one of the stock-tab brands
    const shown = (items as StockItem[]).filter(it => Object.prototype.hasOwnProperty.call(snapshot, it.item_code) && stockBrandOf(it));
    return { items: shown, binsByItem, tally: snapshot, lots };
}

/** Tally quantity for an item, across all warehouses. */
export const stockTotal = (data: StockData, code: string) => Number(data.tally[code] || 0);

/** Stores - W&C: Tally total less the quantities in the other warehouses in ERP. */
export function storesQty(data: StockData, code: string) {
    const bins = data.binsByItem[code] || [];
    const other = bins.reduce((s, b) => (b.warehouse === STOCK_TARGET_WAREHOUSE ? s : s + Number(b.actual_qty || 0)), 0);
    return stockTotal(data, code) - other;
}

/** Stock on hand valued from the latest purchase lots backwards, as the ERP tab does. */
export function lotsBreakdown(data: StockData, code: string) {
    const d = data.lots[code];
    const qty = stockTotal(data, code);
    if (!d || !d.lots || !d.lots.length || !(qty > 0)) return null;
    let need = qty;
    let value = 0;
    const used: { date: string; source: string; voucher: string; qty: number; rate: number; value: number }[] = [];
    for (let i = d.lots.length - 1; i >= 0 && need > 0.0005; i--) {
        const [date, source, voucher, lotQty, rate] = d.lots[i];
        const take = Math.min(need, Number(lotQty || 0));
        if (take <= 0) continue;
        used.unshift({ date, source, voucher, qty: take, rate: Number(rate || 0), value: take * Number(rate || 0) });
        value += take * Number(rate || 0);
        need -= take;
    }
    const rates = new Set(used.map(u => u.rate.toFixed(2)));
    return {
        qty,
        used,
        value,
        average: qty > 0 ? value / qty : 0,
        rateCount: rates.size,
        untraced: need > 0.0005 ? need : 0,
    };
}

// ---------- Payment Details (ICICI bank book receipts) ----------

export type BankLine = [string, string, string, string, number]; // yyyymmdd, vch type, vch no, particulars, amount

export async function loadBankLines(ymd: string): Promise<BankLine[]> {
    const all = await noteJson('Tally Bank Debits');
    const lines: BankLine[] = (all[PAY_BANK_NAME] || []) as BankLine[];
    return lines.filter(r => r[0] === ymd);
}

/** Customer / sales-executive lookup used for the Executive column (matches the ERP tab). */
export async function loadExecutiveMap(): Promise<Record<string, string>> {
    try {
        const [authorities, customers] = await Promise.all([
            listDocs('Approving Authority', ['name', 'approving_authority']),
            listDocs('Customer', ['name', 'customer_name', 'sales_executive']),
        ]);
        const names: Record<string, string> = {};
        authorities.forEach((a: any) => { names[a.name] = a.approving_authority || a.name; });
        const map: Record<string, string> = {};
        customers.forEach((c: any) => {
            const ex = c.sales_executive ? (names[c.sales_executive] || c.sales_executive) : '';
            [c.name, c.customer_name].forEach((n: string) => {
                const k = normKey(n);
                if (k && !(k in map)) map[k] = ex;
            });
        });
        return map;
    } catch {
        return {};
    }
}

export const normKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Executive for a receipt: the first customer on it that has one. */
export function executiveFor(line: BankLine, map: Record<string, string>) {
    for (const n of String(line[3] || '').split(', ')) {
        const ex = map[normKey(n)];
        if (ex) return ex;
    }
    return '';
}

/** yyyymmdd -> yyyy-mm-dd */
export const ymdToIso = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

export function bankBookHtml(ymd: string, lines: BankLine[]) {
    const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dmy = (y: string) => {
        const d = new Date(`${ymdToIso(y)}T00:00:00`);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
    };
    const total = lines.reduce((s, r) => s + r[4], 0);
    const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = lines.map(r => `<tr><td>${dmy(r[0])}</td><td>${esc(r[3])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td class="r">${money(r[4])}</td></tr>`).join('');
    return `<html><head><meta charset="utf-8"/><style>
  @page { margin: 14mm; }
  body { font-family: Helvetica, Arial, sans-serif; font-size: 10px; }
  .c { text-align: center; } .co { font-size: 14px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 4px; }
  td { padding: 2.5px 4px; } .r { text-align: right; } .tot td { border-top: 1px solid #000; font-weight: bold; }
</style></head><body>
<div class="c">
  <div class="co">White &amp; Co</div>
  <div>130 RAMALINGAM ROAD</div><div>R.S.PURAM</div><div>COIMBATORE - 641 002.</div>
  <div>MSME : UDYAM/TN-03-0011357</div><div>Contact : 0422-2470625,0422-2470280</div>
  <div style="font-weight:bold;margin-top:14px;">${esc(PAY_BANK_NAME)}  Book</div>
  <div>For ${dmy(ymd)}</div>
</div>
<table><thead><tr><th>Date</th><th>Particulars</th><th>Vch Type</th><th>Vch No.</th><th class="r">Debit</th></tr></thead>
<tbody>${rows}<tr class="tot"><td></td><td>Total</td><td></td><td></td><td class="r">${money(total)}</td></tr></tbody></table>
</body></html>`;
}
