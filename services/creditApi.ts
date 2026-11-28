/**
 * creditApi.ts — Credit Control from SmartOps: who owes what, and a reminder to copy.
 *
 * SmartOps works it out from ERPNext (app/agents/payments). A salesperson gets their own
 * customers only; managers and the desk get everyone's. Nothing here changes anything: the
 * reminder is text for a person to copy or share, never sent by the app.
 */

import { smartopsAs } from '@/services/teamApi';

export interface Ageing {
    customer: string;
    customer_name: string;
    invoices: number;
    outstanding: number;
    not_due: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90_plus: number;
    overdue: number;
    /** Money received but not set against a bill (advances, on-account receipts). */
    unallocated_receipts: number;
    /** Overdue minus that money: what the customer really still owes. */
    net_overdue: number;
    oldest_days_overdue: number;
}

export interface Credit {
    fetched_at: string;
    as_of: string;
    customers: number;
    totals: Ageing;
    rows: Ageing[];
    /** "mine": this person's customers only; "all": everyone's. */
    scope: 'mine' | 'all';
}

export interface ChaserInvoice {
    invoice: string;
    voucher_number: string;
    posting_date: string;
    due_date: string | null;
    outstanding: number;
    days_overdue: number;
}

export interface Chaser {
    customer: string;
    customer_name: string;
    text: string;
    invoices: ChaserInvoice[];
}

export type CreditResult<T> = { ok: true; data: T } | { ok: false; error: string };

// The last list, so a customer's page opens at once with its figures.
let last: Credit | null = null;
export const lastCredit = () => last;

export async function loadCredit(fresh = false): Promise<CreditResult<Credit>> {
    // "Read ERPNext again now": a few seconds, writes nothing.
    if (fresh) await smartopsAs.post('/bff/v1/payments/refresh');
    const r = await smartopsAs.get<Credit>('/bff/v1/payments/credit');
    if (!r.ok) return { ok: false, error: r.error };
    last = r.data;
    return { ok: true, data: r.data };
}

export async function loadChaser(customer: string): Promise<CreditResult<Chaser>> {
    const r = await smartopsAs.get<Chaser>(`/bff/v1/payments/credit/${encodeURIComponent(customer)}/chaser`);
    return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

/** Ageing groups in order, with the label and the tone each is drawn in (hex, Ember palette). */
export const BUCKETS = [
    { key: 'not_due', label: 'Not due', hex: '#2F7D5B' },
    { key: 'd1_30', label: '1–30 days late', hex: '#D99A14' },
    { key: 'd31_60', label: '31–60 days late', hex: '#E4572E' },
    { key: 'd61_90', label: '61–90 days late', hex: '#C8423B' },
    { key: 'd90_plus', label: 'Over 90 days late', hex: '#8C2A25' },
] as const;
