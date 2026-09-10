/**
 * dailySalesReportApi.ts — client for the ERPNext "Daily Sales Report" dashboard.
 *
 * On the desktop, "Daily Sales Report" is a Single DocType whose Form is
 * rendered entirely by a Client Script that calls these same whitelisted
 * methods via frappe.call(). They're plain GET-callable with just the
 * session cookie, exactly like the rest of this app's API calls, so no
 * server-side changes were needed to bring this into the mobile app.
 */

import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';

export interface FiscalYear {
    name: string;
    year_start_date: string;
    year_end_date: string;
}

export interface SalesExecutive {
    id: string;
    name: string;
}

export interface DailySummaryRow {
    brand: string;
    sales_as_on: number;
    sales_mtd: number;
    sales_fytd: number;
    collection_as_on: number;
    collection_mtd: number;
    collection_fytd: number;
    payment_pending: number;
}

export interface DailySummaryTotals {
    sales_as_on: number;
    sales_mtd: number;
    sales_fytd: number;
    collection_as_on: number;
    collection_mtd: number;
    collection_fytd: number;
    payment_pending: number;
}

export interface DailySummaryMeta {
    as_on: string;
    month_start: string;
    fy_start: string;
    fy_end: string;
    fy_out_of_range: boolean;
    sales_executive_name: string | null;
}

export interface DailySummary {
    rows: DailySummaryRow[];
    totals: DailySummaryTotals;
    meta: DailySummaryMeta;
}

export interface InvoiceHistoryRow {
    invoice_no: string;
    date: string;
    brand: string;
    customer: string;
    sales_executive: string;
    description: string;
    qty: number;
    unit_price: number;
    total_value: number;
    invoice_total_value: number;
    payment_status: string;
    profit: number;
    margin: number;
    discount_percentage: number;
}

export interface InvoiceHistoryMeta {
    to_date?: string;
    fy_start?: string;
    fy_end?: string;
    fy_out_of_range?: boolean;
    sales_executive_name?: string | null;
}

export interface InvoiceHistory {
    rows: InvoiceHistoryRow[];
    meta: InvoiceHistoryMeta;
    truncated: boolean;
    total_count: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const failure = (error: string): { ok: false; error: string } => ({ ok: false, error });

const session = () => SecureStore.getItemAsync('session_cookies');

/**
 * These four accounts are restricted server-side (in the "Get Daily Report
 * Summary" / "Get Sales Invoice History Data" Server Scripts) to only ever
 * see their own data, regardless of what Sales Executive filter is
 * requested — that's the real enforcement, not this. This mirror exists so
 * the mobile UI can pre-fill their own name and hide the picker for them,
 * since letting them "choose" another executive would visibly do nothing.
 */
export const RESTRICTED_EXECUTIVE_NAMES: Record<string, string> = {
    'sales1@whitenco.net': 'N.Purushothaman',
    'sales2@whitenco.net': 'V.Nagaraj',
    'sales3@whitenco.net': 'S.P.Pandiyan',
    'sales4@whitenco.net': 'S.Manikandan',
};

/** Returns the logged-in user's own Approving Authority display name if they're one of the four restricted executives, else null. */
export async function getOwnRestrictedExecutiveName(): Promise<string | null> {
    const userId = await SecureStore.getItemAsync('user_id');
    if (!userId) return null;
    return RESTRICTED_EXECUTIVE_NAMES[userId] || null;
}

/**
 * Server brand value -> display label. Mirrors BRAND_LABELS in the ERPNext
 * "Daily Sales Report" Client Script so the mobile view matches the desktop
 * dashboard exactly (most brand codes are already human-readable and pass
 * through unchanged).
 */
export const BRAND_LABELS: Record<string, string> = {
    'WHITE & CO': 'White & Co',
    'INSPIRON': 'InspirOn',
    'PRECITEX': 'Precitex',
    'SUPREME': 'Supreme',
    'Habasit': 'Habasit',
};

export const brandLabel = (brand: string) => BRAND_LABELS[brand] || brand;

/** Alphabetical by label, "Unassigned" always last — same rule as the web dashboard. */
export function sortSummaryRows(rows: DailySummaryRow[]): DailySummaryRow[] {
    return [...rows].sort((a, b) => {
        if (a.brand === 'Unassigned') return 1;
        if (b.brand === 'Unassigned') return -1;
        return brandLabel(a.brand).localeCompare(brandLabel(b.brand));
    });
}

export async function getFiscalYears(): Promise<ApiResult<FiscalYear[]>> {
    try {
        const fields = JSON.stringify(['name', 'year_start_date', 'year_end_date']);
        const res = await apiGet(apiUrl(
            `/api/method/frappe.client.get_list?doctype=Fiscal Year` +
            `&fields=${encodeURIComponent(fields)}` +
            `&order_by=${encodeURIComponent('year_start_date desc')}&limit_page_length=20`
        ), await session());
        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || [] };
    } catch {
        return failure('Network error');
    }
}

export async function getSalesExecutives(): Promise<ApiResult<SalesExecutive[]>> {
    try {
        const res = await apiGet(apiUrl('/api/method/get_daily_report_sales_executives'), await session());
        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || [] };
    } catch {
        return failure('Network error');
    }
}

export async function getUsedBrands(): Promise<ApiResult<string[]>> {
    try {
        const res = await apiGet(apiUrl('/api/method/get_used_brands'), await session());
        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || [] };
    } catch {
        return failure('Network error');
    }
}

export async function getDailySummary(params: {
    fiscalYear: string;
    month: string;
    date: string;
    salesExecutive?: string;
}): Promise<ApiResult<DailySummary>> {
    try {
        const qs = new URLSearchParams({
            fiscal_year: params.fiscalYear,
            month: params.month,
            date: params.date,
            sales_executive: params.salesExecutive || '',
        });
        const res = await apiGet(apiUrl(`/api/method/get_daily_report_summary?${qs.toString()}`), await session());
        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message };
    } catch {
        return failure('Network error');
    }
}

export async function getSalesInvoiceHistory(params: {
    fiscalYear: string;
    month: string;
    fromDate: string;
    toDate: string;
    salesExecutive?: string;
    brand?: string;
    customer?: string;
    item?: string;
    paymentStatus?: string;
}): Promise<ApiResult<InvoiceHistory>> {
    try {
        const qs = new URLSearchParams({
            fiscal_year: params.fiscalYear,
            month: params.month,
            from_date: params.fromDate,
            to_date: params.toDate,
            sales_executive: params.salesExecutive || '',
            brand: params.brand || '',
            customer: params.customer || '',
            item: params.item || '',
            payment_status: params.paymentStatus || '',
        });
        const res = await apiGet(apiUrl(`/api/method/get_sales_invoice_history_data?${qs.toString()}`), await session());
        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message };
    } catch {
        return failure('Network error');
    }
}
