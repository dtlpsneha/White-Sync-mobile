/**
 * reconApi.ts — Payment Matching from SmartOps: which bill each customer payment most likely
 * settles, for payments ERPNext could not match by itself.
 *
 * Approving or rejecting records the person's decision in SmartOps ONLY. Nothing is written to
 * ERPNext or Tally: applying a match there stays a person's act. Not for salespeople -- SmartOps
 * refuses them (403) and the app does not offer it.
 */

import { smartopsAs } from '@/services/teamApi';

export type Confidence = 'strong' | 'likely' | 'weak';

export interface Allocation { invoice: string; voucher_number: string; amount: number; url: string }

export interface Decision {
    decision: 'approved' | 'rejected';
    decided_by: string;
    decided_at: string;
    note: string | null;
    /** false when the proposal changed since it was decided */
    current: boolean;
}

export interface Match {
    receipt: string;
    receipt_url: string;
    date: string;
    amount: number;
    printed_customer: string;
    reference: string;
    narration: string;
    customer: string;
    customer_name: string;
    confidence: Confidence;
    rule: string;
    why: string;
    signature: string;
    allocations: Allocation[];
    decision: Decision | null;
}

export interface Count { key: string; label: string; count: number; amount: number }

export interface Reconciliation {
    fetched_at: string;
    receipts: number;
    open_by_confidence: Count[];
    decided: Count[];
    no_match: Count[];
    matches: Match[];
}

export type ReconResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

// The last list, so a receipt opens at once.
let last: Reconciliation | null = null;
export const lastRecon = () => last;
export const findMatch = (receipt: string) => last?.matches.find(m => m.receipt === receipt) ?? null;

/** Every proposal, open and decided (the list filters on the phone). */
export async function loadRecon(fresh = false): Promise<ReconResult<Reconciliation>> {
    // "Read ERPNext again now": a few seconds, writes nothing.
    if (fresh) await smartopsAs.post('/bff/v1/payments/refresh');
    const r = await smartopsAs.get<Reconciliation>('/bff/v1/payments/reconciliation?show=all&limit=1000');
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    last = r.data;
    return { ok: true, data: r.data };
}

export async function decide(m: Match, decision: 'approved' | 'rejected', note: string): Promise<ReconResult<Match>> {
    const r = await smartopsAs.post<Match>(`/bff/v1/payments/reconciliation/${encodeURIComponent(m.receipt)}/decide`, {
        decision, signature: m.signature, note: note.trim() || null,
    });
    if (!r.ok) return { ok: false, error: r.error, status: r.status };
    // Keep the list in step, so going back shows the decision.
    if (last) last = { ...last, matches: last.matches.map(x => (x.receipt === r.data.receipt ? r.data : x)) };
    return { ok: true, data: r.data };
}

export const CONFIDENCE: Record<Confidence, { label: string; hex: string; hint: string }> = {
    strong: { label: 'Strong', hex: '#2F7D5B', hint: 'An exact bill or amount' },
    likely: { label: 'Likely', hex: '#D99A14', hint: 'Exact, but with a name fix or several similar bills' },
    weak: { label: 'Weak', hex: '#C8423B', hint: 'Nothing adds up; set against the oldest bills' },
};

/** How a proposal was reached, in plain words. */
export const RULE_LABEL: Record<string, string> = {
    bill_exact: 'Bill named on the receipt',
    bill_no_year: 'Bill named, year added',
    bill_other_customer: 'Bill filed under another customer',
    exact_amount: 'Exactly one bill’s amount',
    oldest_bills_sum: 'Oldest bills add up exactly',
    bills_sum: 'A few bills add up exactly',
    oldest_first: 'Oldest bills first (a guess)',
    name_only: 'Customer recognised by name',
};
