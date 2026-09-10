/**
 * smartopsApi.ts — client for SmartOps (the AI assistant and its customer lookups).
 *
 * This is the ONLY file in the app that talks to SmartOps. Every other service here
 * talks to ERPNext/Frappe through `utils/api.ts` with a `sid=` session cookie; SmartOps
 * is a different backend entirely, so it gets its own thin client rather than being
 * bolted onto that one:
 *
 *   - `fetch()`, not `utils/api.ts`'s XMLHttpRequest. That wrapper exists because Frappe
 *     rejects fetch's `Expect: 100-continue` with a 417; FastAPI does not, and fetch
 *     gives real streaming-free JSON handling with less ceremony.
 *   - No cookie. See the auth note on `smartopsFetch()` below.
 *
 * Ported from the SmartOps mobile client at `C:\DTLP\Expo Mobile App\lib\api.ts`
 * and its `lib/types.ts`. Those in turn mirror `apps/api/app/bff/chat.py` and
 * `bff/reception.py`'s Pydantic models by hand — keep in step manually if
 * the backend contract changes; there is no codegen step.
 */

import { smartopsUrl } from '@/constants/config';

// ─────────────────────────── contracts ───────────────────────────
// Mirrors apps/api/app/bff/chat.py. Only the fields this screen reads are typed.

export interface ActiveCustomer {
    id: string;
    name: string;
    source: string | null;
}

export interface ChatSessionSummary {
    id: string;
    title: string;
    started_at: string;
    last_at: string;
    channel: string;
    messages: number;
    active_customer: ActiveCustomer | null;
}

export interface QuoteSummary {
    ref: string;
    status: string;
    date: string | null;
    /** An ALREADY-DIVIDED rupee float, not paise — a backend quirk. See `money()`. */
    total: number | null;
}

export interface InvoiceSummary {
    ref: string;
    status: string;
    due_date: string | null;
    /** An ALREADY-DIVIDED rupee float, not paise — a backend quirk. See `money()`. */
    outstanding: number | null;
}

/** A tool's own structured result, when the tool is one of the `crm.customer.*` reads.
 * Other tools carry other shapes in `detail`; only the ones the chat screen renders as
 * real cards are typed. */
export interface ChatStepDetail {
    quotes?: QuoteSummary[];
    invoices?: InvoiceSummary[];
    resolved_customer?: { id: string; name: string; source: string | null };
}

export interface ChatStep {
    ordinal: number;
    tool: string;
    verdict: string;
    ok: boolean;
    ms: number | null;
    detail: ChatStepDetail;
}

export interface ChatMessage {
    id: string;
    /** `"person"` is the caller's own message, `"system"` is SmartOps itself; an agent
     * reply carries an `agent_id` that indexes into `ChatOut.speakers`. NOT `"user"` —
     * see the note in `app/ai-chat.tsx`'s Bubble. */
    role: string;
    body: string;
    agent_id: string | null;
    trace_id: string | null;
    created_at: string;
    steps: ChatStep[];
}

export interface ChatCaller {
    name: string;
    profile: string;
    signed_in: boolean;
    may_approve: boolean;
    note: string;
}

export interface ChatOut {
    /** False when the SmartOps database is unreachable — the server answered, it just
     * cannot serve data. Distinct from `SmartOpsUnreachableError`. */
    live: boolean;
    sessions: ChatSessionSummary[];
    active_session_id: string | null;
    messages: ChatMessage[];
    speakers: Record<string, string>;
    /** False when no LLM API key is configured server-side. The agent still accepts
     * messages; it just answers with a system error instead of a real reply. */
    model_ok: boolean;
    model_why: string;
    extractor: string | null;
    me: ChatCaller;
    active_customer: ActiveCustomer | null;
}

export interface ChatSendOut {
    session_id: string;
}

export interface ChatClearOut {
    removed: number;
}

export interface ChatRenameOut {
    ok: boolean;
}

// ─────────────────────────── errors ───────────────────────────

/** The request never reached the server at all (no network, API down). Distinct from a
 * successful response describing `live: false`, which is data, not a failure. */
export class SmartOpsUnreachableError extends Error {
    constructor(cause: unknown) {
        super('Could not reach the SmartOps API.');
        this.cause = cause;
    }
}

/** The server answered, just not with a 2xx. `detail` is FastAPI's own error body. */
export class SmartOpsApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
        super(detail);
        this.status = status;
        this.detail = detail;
    }
}

async function toApiError(response: Response): Promise<SmartOpsApiError> {
    let detail = response.statusText || `Request failed (${response.status})`;
    try {
        const body = (await response.json()) as { detail?: unknown };
        if (typeof body.detail === 'string') detail = body.detail;
    } catch {
        // Body wasn't JSON — keep the status text.
    }
    return new SmartOpsApiError(response.status, detail);
}

/** Turns any thrown value into something showable in a banner. */
export function chatErrorMessage(err: unknown): string {
    if (err instanceof SmartOpsApiError) return err.detail;
    if (err instanceof SmartOpsUnreachableError) return err.message;
    if (err instanceof Error) return err.message;
    return 'Something went wrong.';
}

// ─────────────────────────── transport ───────────────────────────

/**
 * No `Authorization` header, deliberately.
 *
 * The chat routes do not 401 on a missing caller — they fall back to an anonymous STAFF
 * caller, which is what `ChatOut.me` reports back (`signed_in: false`, `profile: "staff"`,
 * and a `note` saying staff cannot approve anything). So this screen works with no
 * SmartOps sign-in at all, and the app avoids asking for a SECOND set of credentials on
 * top of the ERPNext login it already has.
 *
 * That also means chat history is not per-person here: sessions are scoped to whoever the
 * backend resolved, so every anonymous caller shares one history. If per-user history or
 * approval rights are ever needed, the fix is to sign in against SmartOps' own
 * `/bff/v1/login` with the existing ERPNext credentials and send the returned token as a
 * bearer here — not to build a separate SmartOps login screen.
 *
 * `X-Client: mobile` is what tells the API to skip CSRF for this transport (CSRF defends
 * an ambient browser-attached cookie, which this has none of).
 */
async function smartopsFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
        'X-Client': 'mobile',
        ...((init?.headers as Record<string, string>) ?? {}),
    };
    try {
        return await fetch(smartopsUrl(path), { ...init, headers });
    } catch (cause) {
        throw new SmartOpsUnreachableError(cause);
    }
}

async function smartopsGet<T>(path: string): Promise<T> {
    const response = await smartopsFetch(path);
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as T;
}

async function smartopsPost<T>(path: string, body?: unknown): Promise<T> {
    const response = await smartopsFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
    });
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as T;
}

// ─────────────────────────── endpoints ───────────────────────────

/** The whole conversation plus the session list. Called after every send, since a send
 * returns only the session id. */
export const fetchChat = (session?: string) =>
    smartopsGet<ChatOut>(`/bff/v1/chat${session ? `?session=${encodeURIComponent(session)}` : ''}`);

/**
 * Genuinely blocking — the API runs the entire orchestrator loop server-side before it
 * responds, which can take ~20 seconds. Callers MUST disable the composer for the full
 * duration rather than assuming this returns promptly.
 *
 * Pass `''` as the session to start a new conversation.
 */
export const sendChatMessage = (message: string, session: string) =>
    smartopsPost<ChatSendOut>('/bff/v1/chat/send', { message, session });

export const clearChat = (session: string) =>
    smartopsPost<ChatClearOut>('/bff/v1/chat/clear', { session });

export const renameChat = (session: string, title: string) =>
    smartopsPost<ChatRenameOut>('/bff/v1/chat/rename', { session, title });

// ─────────────────────── customers (app/bff/reception.py) ───────────────────────
// Smart Customer Resolution lives SERVER-side (`repo.customer_candidates()`): exact →
// partial → disambiguation, matching on name, phone, email and contact records alike.
// Nothing here re-implements any of that; these calls list what comes back and let the
// person pick. Nothing is ever auto-selected, and disabled accounts stay visible.

export interface CustomerSearchResult {
    party_id: string;
    name: string;
    /** ERPNext's own wording, "Enabled"/"Disabled". Display-only — never used to hide a row. */
    status: string | null;
    territory: string | null;
    source: string;
    /** Which contact/field this row matched on — all null for a plain name match. */
    matched_contact_name: string | null;
    matched_contact_phone: string | null;
    matched_contact_email: string | null;
}

export interface CustomerSearchOut {
    live: boolean;
    /** Set when SmartOps reached its database but could not reach ERPNext behind it —
     * a configuration problem, NOT an empty result. Must be surfaced as an error. */
    erp_error: string | null;
    results: CustomerSearchResult[];
}

export interface CustomerProfile {
    id: string;
    name: string;
    status: string | null;
    territory: string | null;
    mobile_no: string | null;
    email_id: string | null;
    /** One joined display line from the first linked Address record. */
    address: string | null;
    /** Real PAISE, unlike the rupee floats on quotes/invoices. */
    credit_limit_paise: number | null;
}

export interface SalesAssignment {
    salesperson: string | null;
    manager: string | null;
    as_of: string | null;
}

/** Every section of a lookup answers the same way: `available` plus either the payload
 * or a `message` saying why not. A section being unavailable is normal, not an error. */
export interface CustomerLookupOut {
    live: boolean;
    erp_error: string | null;
    profile: { available: boolean; source: string | null; profile: CustomerProfile | null; message: string | null };
    quotes: { available: boolean; source: string | null; quotes: QuoteSummary[]; message: string | null };
    invoices: { available: boolean; source: string | null; invoices: InvoiceSummary[]; message: string | null };
    assigned_to: { available: boolean; source: string | null; assignment: SalesAssignment | null; message: string | null };
}

export interface SetCustomerOut {
    session_id: string;
}

/** Multi-way search — name, phone, email, contact records. Two characters minimum;
 * below that the server short-circuits and this shouldn't be called. */
export const searchCustomers = (q: string) =>
    smartopsGet<CustomerSearchOut>(`/bff/v1/reception/customers/search?q=${encodeURIComponent(q)}`);

/** The full Customer 360 payload — profile, quotes, invoices, assigned salesperson.
 * The ownership rule is enforced server-side; this just renders what comes back.
 *
 * Data boundary: no score, tier, margin, profit, health or recommendation fields exist
 * in this response, so there is nothing of that kind to accidentally render. */
export const lookupCustomer = (customer: string) =>
    smartopsGet<CustomerLookupOut>(
        `/bff/v1/reception/customer/lookup?customer=${encodeURIComponent(customer)}`);

/**
 * Points a chat session at a customer directly, rather than hoping the model infers one
 * from the prose. Pass `''` as the session to get a NEW session scoped to this customer —
 * which is what "Ask AI about this customer" wants, so one customer's conversation never
 * re-points an existing thread about somebody else.
 */
export const setChatCustomer = (id: string, name: string, source: string | null, session: string) =>
    smartopsPost<SetCustomerOut>('/bff/v1/chat/customer', { id, name, source, session });
