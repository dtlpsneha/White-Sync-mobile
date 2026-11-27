/**
 * quotationRequest.ts — creates a Draft Quotation in ERP from the phone (Quotation or Proforma).
 * The rate comes from ERP's Standard Selling price list, as ERP fills it.
 */

import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiGet, apiPost } from '@/utils/api';

export type RequestType = 'quotation' | 'proforma';

export const REQUEST_BRANDS = ['HABASIT', 'PRECITEX', 'INSPIRON', 'SUPREME', 'STERLING', 'WHITENCO', 'RMP'];

/** ERP naming series per brand, as the ERP Quotation form offers them. */
const SERIES: Record<string, Record<RequestType, string>> = {
    HABASIT: { quotation: 'HAB/WC/2026-27/Q-', proforma: 'HAB/WC/2026-27/P-' },
    PRECITEX: { quotation: 'PRE/WC/2026-27/', proforma: 'PRE/WC/2026-27/-P' },
    INSPIRON: { quotation: 'INSP/WC/2026-27/', proforma: 'SAL-PRF-.YYYY.-' },
    SUPREME: { quotation: 'SUP/WC/LET/2026-2027/', proforma: 'SUP/WC/LET/2026-2027/P-' },
    STERLING: { quotation: 'SEI/QTN/2026-27/', proforma: 'SEI/Proforma/2026-27/' },
    WHITENCO: { quotation: 'WC/2026-27/-', proforma: 'SAL-PRF-.YYYY.-' },
    RMP: { quotation: 'RMP/WC/2026-27/', proforma: 'SAL-PRF-.YYYY.-' },
};

/** Naming series for "From White & Co" Quotations and Proformas (as shown in ERP's White & Co chooser). */
const WHITE_CO_SERIES = 'WC/2026-27/-';

/** ERP print formats for White & Co Quotation and Proforma (first entry in ERP's picker for each). */
export const WHITE_CO_PRINT = { quotation: 'Precitex', proforma: 'Proforma Invoice Precitex' };

export type RequestItem ={ item_code: string; item_name: string; stock_uom: string };

const session = () => SecureStore.getItemAsync('session_cookies');

/** Items of one brand, matched on code or name. */
export async function searchItemsByBrand(brand: string, query: string): Promise<RequestItem[]> {
    const q = query.trim();
    // Only this brand's items; a blank query lists the brand's items in name order.
    const filters: any[] = [['brand', '=', brand], ['disabled', '=', 0], ['has_variants', '=', 0]];
    if (q) filters.push(['item_name', 'like', `%${q}%`]);
    const qs =
        `fields=${encodeURIComponent(JSON.stringify(['item_code', 'item_name', 'stock_uom']))}` +
        `&filters=${encodeURIComponent(JSON.stringify(filters))}` +
        `&order_by=${encodeURIComponent('item_name asc')}` +
        `&limit_page_length=200`;
    const res = await apiGet(apiUrl(`/api/resource/Item?${qs}`), await session());
    if (!res.ok) return [];
    return ((res.data as any)?.data || []) as RequestItem[];
}

/** Frappe puts errors in _server_messages (a JSON-encoded list of JSON messages). Pull out readable text. */
function erpErrorText(data: any): string {
    try {
        const raw = data?._server_messages;
        if (raw) {
            const list: string[] = JSON.parse(raw);
            const texts = list.map(m => { try { return JSON.parse(m).message; } catch { return m; } });
            return texts.join(' ').replace(/<[^>]+>/g, '').slice(0, 300);
        }
        if (data?.exception) return String(data.exception).split('\n').pop()!.slice(0, 300);
    } catch { /* fall through */ }
    return '';
}

/** Creates the request as a Draft Quotation in ERP. Returns the ERP name, or throws with the reason. */
export async function createRequestDraft(p: {
    type: RequestType;
    brand: string;
    customerId: string;
    lines: { item: RequestItem; qty: number }[];
    /** "From White & Co" uses one series for both Quotation and Proforma, as ERP does. */
    whiteCoSeries?: boolean;
    /** Logged-in user's email, saved as the Quotation Approver (an ERP User). */
    approverEmail?: string;
    /** Saved as the ERP Quotation's Special Instructions. */
    specialInstructions?: string;
}): Promise<string> {
    const today = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const validTill = new Date(today);
    validTill.setDate(validTill.getDate() + 30);

    const body = {
        quotation_to: 'Customer',
        party_name: p.customerId,
        transaction_date: iso(today),
        valid_till: iso(validTill),
        order_type: 'Sales',
        company: 'White & Co.',
        currency: 'INR',
        selling_price_list: 'Standard Selling',
        naming_series: p.whiteCoSeries ? WHITE_CO_SERIES : SERIES[p.brand][p.type],
        // "From White & Co" drafts get ERP's White & Co print formats (the same ones ERP's picker offers).
        ...(p.whiteCoSeries ? { print_format: p.type === 'quotation' ? WHITE_CO_PRINT.quotation : WHITE_CO_PRINT.proforma } : {}),
        brand: p.brand,
        status: 'Draft',
        ...(p.approverEmail ? { quotation_approver: p.approverEmail } : {}),
        // A draft with no items needs zero totals, or ERP's payment schedule cannot be worked out.
        ...(p.lines.length === 0 ? { total: 0, net_total: 0, grand_total: 0, base_total: 0, base_net_total: 0, base_grand_total: 0, rounded_total: 0, base_rounded_total: 0, total_taxes_and_charges: 0, base_total_taxes_and_charges: 0 } : {}),
        ...(p.specialInstructions ? { custom_special_instructions: p.specialInstructions } : {}),
        items: p.lines.map(l => ({ item_code: l.item.item_code, item_name: l.item.item_name, qty: l.qty, uom: l.item.stock_uom, brand: p.brand })),
    };
    const res = await apiPost(apiUrl('/api/resource/Quotation'), body, await session());
    const name = (res.data as any)?.data?.name;
    if (!res.ok || !name) {
        throw new Error(erpErrorText(res.data) || 'ERP did not accept the request.');
    }
    return name;
}

/** Brand name as written in mail subjects (ERP codes such as WHITENCO are shown as they are called in the business). */
const BRAND_LABELS: Record<string, string> = { WHITENCO: 'White & Co', RMP: 'RMP' };
export const brandLabel = (brand: string) =>
    BRAND_LABELS[brand] || brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();

/** Address that receives every mobile quotation request. */
export const HOS_EMAIL = 'hos@whitenco.net';

/**
 * Emails a saved Draft to the HOS address, using ERP's own mail sender and
 * the outgoing account ERP has set up. The mobile user's email goes in as the sender.
 * Throws with the reason if ERP does not send it.
 */
export async function emailQuotationToSales(p: {
    name: string;
    /** Running number of this phone's requests, shown in the subject. */
    requestNo: number;
    senderEmail: string;
    senderName: string;
    typeLabel: string;
    brand: string;
    /** "From White & Co" or "Direct Supplier", shown in the subject. */
    sourceLabel: string;
    customerLabel: string;
    lines: { item: RequestItem; qty: number }[];
    specialInstructions?: string;
}): Promise<void> {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const now = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const date = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;
    const itemRows = p.lines
        .map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.item.item_name)}</td><td style="text-align:right">${l.qty}</td></tr>`)
        .join('');
    const content =
        `<p>Dear Sir/Madam,</p>` +
        `<p>Please send a ${p.typeLabel === 'Proforma' ? 'proforma' : 'quotation'}${p.lines.length ? ' for the following item(s)' : ''}.</p>` +
        (p.lines.length
            ? `<table border="1" cellpadding="4" style="border-collapse:collapse"><tr><th>S.No</th><th>Item</th><th>Qty</th></tr>${itemRows}</table>`
            : '') +
        `<p>Customer: <b>${esc(p.customerLabel)}</b><br>Date: ${date}</p>` +
        (p.specialInstructions
            ? `<p><b>Special Instructions:</b><br>${esc(p.specialInstructions).replace(/\n/g, '<br>')}</p>`
            : '') +
        `<p>Regards,<br>${esc(p.senderName || p.senderEmail)}</p>`;

    const body = {
        doctype: 'Quotation',
        name: p.name,
        recipients: HOS_EMAIL,
        sender: p.senderEmail,
        sender_full_name: p.senderName || p.senderEmail,
        subject: `${brandLabel(p.brand)} ${p.typeLabel} Request ${p.requestNo} (${p.sourceLabel}) on ${date} from ${p.senderName || p.senderEmail}`,
        content,
        communication_medium: 'Email',
        send_email: 1,
        send_me_a_copy: 0,
    };
    const res = await apiPost(apiUrl('/api/method/frappe.core.doctype.communication.email.make'), body, await session());
    const ok = res.ok && !!(res.data as any)?.message;
    if (!ok) {
        throw new Error(erpErrorText(res.data) || 'ERP did not send the email.');
    }
}
