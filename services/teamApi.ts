/**
 * teamApi.ts — the Team chat's connection to SmartOps (jobs, photo reading, ERPNext drafts).
 *
 * Separate from `smartopsApi.ts` (the AI assistant) on purpose: the assistant runs as an
 * anonymous staff caller, but a job must know WHO posted it and whom it is for, so Team
 * signs in per person.
 *
 * Signing in: this app is already signed in to ERPNext (`session_cookies` in SecureStore).
 * SmartOps asks ERPNext whose session that is and hands back its own token, kept as
 * `smartops_token`. When a call comes back 401 the token is fetched again once, from the
 * same ERPNext session, so an expired SmartOps token never shows as an error.
 *
 * Every call sends `X-Client: mobile` and the bearer token -- SmartOps's mobile path, which
 * needs no cookies and no CSRF token.
 */

import * as SecureStore from 'expo-secure-store';
import { smartopsUrl } from '@/constants/config';
import { apiGet, apiPost, apiPostForm } from '@/utils/api';

const TOKEN_KEY = 'smartops_token';

// ─────────────────────────── shapes (mirror app/bff/team.py) ───────────────────────────

/** SmartOps' own colour and icon, for the posts it writes (a customer's payment, for one). */
export const SMARTOPS_TINT = '#059669';
export const SMARTOPS_ICON = 'cash-outline';

export type JobKind = 'proforma' | 'place_order' | 'quotation' | 'dispatch' | 'payment' | 'general';
export type JobStatus = 'open' | 'done' | 'cancelled';
export type JobAction = 'quotation' | 'order_ref' | 'dispatch' | 'payment' | 'none';
export type JobView = 'mine' | 'open' | 'feed' | 'sent';

export interface Person { id: string; name: string }

export interface Attachment {
    document_id: string;
    filename?: string | null;
    mime?: string | null;
    kind?: string | null;
    status?: string | null;
    ref?: string | null;
    party?: string | null;
    /** The read ENDED with nothing read — not "still reading". `team.reread` tries again.
     * Absent from an older SmartOps, which is treated as "not failed". */
    read_failed?: boolean;
    file_url: string;
    /** How the person who posted it filed it ("customer_po", ...). Absent while not filed, and
     * from an older SmartOps. */
    doc_type?: string | null;
    doc_type_label?: string | null;
    doc_details?: Record<string, string> | null;
}

// ─────────────────────────── files filed by type ───────────────────────────

export type DocFieldType = 'text' | 'longtext' | 'amount' | 'date' | 'customer' | 'supplier' | 'invoices';

/** One field a document type asks for. A customer / supplier field also carries the ERPNext
 * id it was picked as, under "<key>_id". */
export interface DocField { key: string; label: string; type: DocFieldType; required: boolean }

/** What a file can be filed as. The list comes from SmartOps, so a new type needs no app build. */
export interface DocType { key: string; label: string; icon: string; fields: DocField[] }

/** What the person said the file is. */
export interface Filing { doc_type: string; details: Record<string, string> }

/** A file in the Documents list: filed or not. */
export interface TeamFile {
    job_id: string;
    reply_id?: string | null;
    document_id: string;
    filename?: string | null;
    mime?: string | null;
    file_url: string;
    posted_by?: Person | null;
    posted_at: string;
    message: string;
    doc_type?: string | null;
    doc_type_label?: string | null;
    doc_details?: Record<string, string> | null;
    party?: string | null;
    ref?: string | null;
    doc_date?: string | null;
    amount?: number | null;
    filed_by?: string | null;
    read_party?: string | null;
    read_ref?: string | null;
}

export interface TeamFiles { files: TeamFile[]; counts: Record<string, number>; next_before?: string | null }

// ─────────────────────────── My Orders ───────────────────────────

export type OrderStatus = 'so_pending' | 'invoice_pending' | 'invoice_generated' | 'delivery_pending' | 'dispatched';

/** One order or invoice, and where it stands (SmartOps app/web/my_orders.py). */
export interface OrderRow {
    kind: 'order' | 'invoice';
    name: string;
    /** What people call it: the Tally invoice no., or the Sales Order name. */
    number: string;
    customer: string;
    customer_name: string;
    date?: string | null;
    amount: number;
    status: OrderStatus;
    status_label: string;
    po_no: string;
    /** An invoice's Sales Order, when the customer's PO number matched one. */
    order: string;
    lr_count: number;
    /** Paid / Unpaid / Overdue, as ERPNext has it. */
    paid: string;
}

export interface MyOrders {
    rows: OrderRow[];
    counts: Record<string, number>;
    statuses: { key: OrderStatus; label: string }[];
    scope: 'mine' | 'all';
    can_see_all: boolean;
    since: string;
}

/** One LR filed for an invoice in Team Chat. */
export interface LrEntry {
    lr_no: string;
    transporter: string;
    lr_date?: string | null;
    invoices: string[];
    filename?: string | null;
    mime?: string | null;
    file_url: string;
    job_id: string;
    filed_by?: string | null;
    filed_at: string;
}

export interface InvoiceDetail { row: OrderRow; lrs: LrEntry[] }

export const ORDER_COLORS: Record<OrderStatus, string> = {
    so_pending: '#64748B',
    invoice_pending: '#F59E0B',
    invoice_generated: '#2563EB',
    delivery_pending: '#8B5CF6',
    dispatched: '#16A34A',
};

export const ORDER_ICONS: Record<OrderStatus, string> = {
    so_pending: 'create-outline',
    invoice_pending: 'hourglass-outline',
    invoice_generated: 'receipt-outline',
    delivery_pending: 'cube-outline',
    dispatched: 'car-outline',
};

/** A voice note: the recording (play it via `team.voiceSource`), what it says in English
 * (also the post's text), and the words as spoken. `text` is null when it could not be
 * written out -- the recording still plays. */
export interface Voice { url: string; text?: string | null; said?: string | null; tamil?: string | null }

/** A recording made in the app, waiting to be sent. */
export interface PickedVoice { uri: string; seconds: number }

export interface Job {
    id: string;
    body: string;
    kind: JobKind;
    kind_label: string;
    kind_suggested: boolean;
    kind_why: string;
    status: JobStatus;
    author: Person;
    assignee?: Person | null;
    done_by?: Person | null;
    principal?: string | null;
    customer_hint?: string | null;
    transporter?: string | null;
    attachment?: Attachment | null;
    erpnext_doctype?: string | null;
    erpnext_name?: string | null;
    action: JobAction;
    brand?: string | null;
    customer_name?: string | null;
    reference?: string | null;
    reference_date?: string | null;
    erpnext_missing: boolean;
    /** Written by SmartOps itself (e.g. "Payment received: ..."), not by a person. Absent
     * from an older SmartOps, which is treated as false. */
    by_smartops?: boolean;
    created_at: string;
    done_at?: string | null;
    age_minutes: number;
    replies: number;
    last_reply_at?: string | null;
    voice?: Voice | null;
    /** Deleted: `body` reads "Message deleted"; no attachment, no voice note. */
    deleted?: boolean;
}

export interface Reply {
    id: string;
    body: string;
    author?: Person | null;   // null = SmartOps itself
    closed_job: boolean;
    attachment?: Attachment | null;
    created_at: string;
    voice?: Voice | null;
    deleted?: boolean;
}

export interface JobDetail { job: Job; thread: Reply[] }
export interface Jobs { view: JobView; jobs: Job[]; next_before?: string | null }
export interface People { me: Person; people: Person[]; kinds: { kind: JobKind; label: string }[] }

export interface PlanLine {
    line_no: number; description: string; qty?: number | null; rate?: number | null; item_code?: string | null;
    /** The closest ERPNext item as SmartOps ranks it -- offered with a "Use" button, never filled in. */
    suggested_item_code?: string | null; suggested_item_name?: string | null; suggested_how?: string | null;
    /** 'photo': a line of the customer's PO; 'message': read from a typed request's words. */
    source?: 'photo' | 'message'; uom?: string | null;
}
export interface Plan {
    action: JobAction;
    kind: JobKind;
    quote_type?: string | null;
    brand?: string | null;
    brands: { brand: string; label: string }[];
    series?: string | null;
    print_format?: string | null;
    customer_query?: string | null;
    customers: { name: string; customer_name: string }[];
    lines: PlanLine[];
    document_id?: string | null;
    payment?: { utr?: string | null; amount?: number | null } | null;
    linked_doctype?: string | null;
    linked_name?: string | null;
    note: string;
}

export interface Receipt {
    name: string; voucher_no: string; date: string; customer: string; amount: number;
    narration: string; sales_invoice: string; why: string;
}
export interface Payments { facts: { utr?: string | null; amount?: number | null }; candidates: Receipt[]; note: string }

export interface QuoteLineIn { item_code: string; qty: number; rate?: number | null; description?: string | null }

/** A picked photo or PDF, as expo-image-picker / expo-document-picker describe it. */
export interface PickedFile { uri: string; name?: string | null; mimeType?: string | null }

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

// ─────────────────────────── signing in ───────────────────────────

/** The ERPNext session this phone holds right now (`sid=...`), or null when logged out. */
export const erpSession = () => SecureStore.getItemAsync('session_cookies');

/**
 * The SmartOps token is kept together with the ERPNext session it came from. This app
 * clears that session in several places (logout, expired session on Home or at start), so
 * rather than every one of them remembering to forget the Team token too, a token whose
 * session is no longer the current one is simply never used: whoever logs in next gets
 * their own.
 */
async function keptToken(): Promise<string | null> {
    const [raw, sid] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), erpSession()]);
    if (!raw || !sid) return null;
    try {
        const kept = JSON.parse(raw) as { sid?: string; token?: string };
        return kept.sid === sid && kept.token ? kept.token : null;
    } catch {
        return null; // an older plain-string token: sign in again
    }
}

async function signIn(): Promise<string | null> {
    const sid = await erpSession();
    if (!sid) return null;
    const res = await apiPost<{ session_token?: string }>(
        smartopsUrl('/bff/v1/login/erpnext'), { sid }, null, { 'X-Client': 'mobile' });
    const token = res.ok ? res.data?.session_token : null;
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify({ sid, token }));
    // Why sign-in failed is what the person needs to see ("x@y is not linked to a SmartOps
    // staff member yet"), not the 401 of the call that triggered it.
    signInRefusal = token ? null : { status: res.status, error: why(res.status, res.data) };
    return token ?? null;
}

let signInRefusal: { status: number; error: string } | null = null;

let signingIn: Promise<string | null> | null = null;

async function token(fresh = false): Promise<string | null> {
    if (!fresh) {
        const kept = await keptToken();
        if (kept) return kept;
    }
    // One sign-in at a time: the list, the people and the badge all ask at app start.
    signingIn = signingIn ?? signIn().finally(() => { signingIn = null; });
    return signingIn;
}

export async function authHeaders(): Promise<Record<string, string>> {
    const t = await token();
    return t ? { 'X-Client': 'mobile', Authorization: `Bearer ${t}` } : { 'X-Client': 'mobile' };
}

/** Forget the SmartOps token -- called on logout alongside the ERPNext session. */
export async function forgetSmartOps(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
}

function why(status: number, data: any): string {
    const detail = data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    if (status === 0) return 'Cannot reach SmartOps — check the internet connection.';
    if (status === 401) return 'Not signed in to SmartOps.';
    if (status === 403) return 'Your ERPNext login is not linked to SmartOps yet — ask the admin.';
    return `SmartOps answered ${status}`;
}

async function call<T>(send: (headers: Record<string, string>) => Promise<{ ok: boolean; status: number; data: any }>): Promise<Result<T>> {
    let res = await send(await authHeaders());
    if (res.status === 401) {
        const t = await token(true);
        if (t) res = await send({ 'X-Client': 'mobile', Authorization: `Bearer ${t}` });
        else if (signInRefusal) return { ok: false, ...signInRefusal };
    }
    return res.ok ? { ok: true, data: res.data as T } : { ok: false, status: res.status, error: why(res.status, res.data) };
}

const get = <T>(path: string) => call<T>(h => apiGet(smartopsUrl(path), null, h));
const post = <T>(path: string, body: unknown = {}) => call<T>(h => apiPost(smartopsUrl(path), body, null, h));

function form(body: string, file?: PickedFile | null, voice?: PickedVoice | null, filing?: Filing | null): FormData {
    const f = new FormData();
    f.append('body', body);
    if (file?.uri && filing) {
        f.append('doc_type', filing.doc_type);
        f.append('doc_details', JSON.stringify(filing.details));
    }
    if (voice?.uri) {
        f.append('voice', { uri: voice.uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
    }
    if (file?.uri) {
        const name = file.name || file.uri.split('/').pop() || 'photo.jpg';
        f.append('file', { uri: file.uri, name, type: file.mimeType || 'image/jpeg' } as any);
    }
    return f;
}

// ─────────────────────────── the Team calls ───────────────────────────

let docTypes: DocType[] | null = null;

export const team = {
    people: () => get<People>('/bff/v1/team/people'),
    jobs: (view: JobView, before?: string | null) =>
        get<Jobs>(`/bff/v1/team/jobs?view=${view}${before ? `&before=${encodeURIComponent(before)}` : ''}`),
    job: (id: string) => get<JobDetail>(`/bff/v1/team/jobs/${id}`),
    post: (body: string, file?: PickedFile | null, voice?: PickedVoice | null, filing?: Filing | null) =>
        call<JobDetail>(h => apiPostForm(smartopsUrl('/bff/v1/team/jobs'), form(body, file, voice, filing), h)),
    reply: (id: string, body: string, file?: PickedFile | null, voice?: PickedVoice | null, filing?: Filing | null) =>
        call<JobDetail>(h => apiPostForm(smartopsUrl(`/bff/v1/team/jobs/${id}/replies`), form(body, file, voice, filing), h)),
    /** What a file can be filed as. Kept after the first answer; an older SmartOps answers 404,
     * and then files are simply posted without a type. */
    documentTypes: async (): Promise<DocType[]> => {
        if (docTypes) return docTypes;
        try {
            const r = await get<{ types: DocType[] }>('/bff/v1/team/document-types');
            if (r.ok) docTypes = r.data.types;
            return r.ok ? r.data.types : [];
        } catch {
            return [];   // no sign-in, no network: the sheet falls back to its preview list
        }
    },
    /** Every file in the chat, newest first: by type ("unfiled" for the ones nobody filed) and any word. */
    files: (p: { type?: string | null; q?: string; before?: string | null } = {}) => {
        const qs = [
            p.type ? `type=${encodeURIComponent(p.type)}` : '',
            p.q?.trim() ? `q=${encodeURIComponent(p.q.trim())}` : '',
            p.before ? `before=${encodeURIComponent(p.before)}` : '',
        ].filter(Boolean).join('&');
        return get<TeamFiles>(`/bff/v1/team/files${qs ? `?${qs}` : ''}`);
    },
    /** My Orders: orders and invoices of my customers (or everybody's, for the desk). */
    myOrders: (p: { status?: OrderStatus | null; q?: string; scope?: 'mine' | 'all' | null } = {}) => {
        const qs = [
            p.status ? `status=${p.status}` : '',
            p.q?.trim() ? `q=${encodeURIComponent(p.q.trim())}` : '',
            p.scope ? `scope=${p.scope}` : '',
        ].filter(Boolean).join('&');
        return get<MyOrders>(`/bff/v1/my-orders${qs ? `?${qs}` : ''}`);
    },
    invoice: (name: string) => get<InvoiceDetail>(`/bff/v1/my-orders/invoices/${encodeURIComponent(name)}`),
    /** "Ready to dispatch" (Delivery Pending), or back. */
    readyToDispatch: (name: string, ready: boolean) =>
        post<InvoiceDetail>(`/bff/v1/my-orders/invoices/${encodeURIComponent(name)}/ready`, { ready }),
    /** File (or re-file) a file already in the chat. */
    fileAttachment: (jobId: string, replyId: string | null | undefined, filing: Filing) =>
        post<JobDetail>('/bff/v1/team/files', { job_id: jobId, reply_id: replyId ?? null, ...filing }),
    done: (id: string) => post<JobDetail>(`/bff/v1/team/jobs/${id}/done`),
    /** Read a photo/PDF on this job again, after a read that failed. */
    reread: (id: string, documentId: string) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/reread`, { document_id: documentId }),
    reopen: (id: string) => post<JobDetail>(`/bff/v1/team/jobs/${id}/reopen`),
    cancel: (id: string) => post<JobDetail>(`/bff/v1/team/jobs/${id}/cancel`),
    /** Delete my post or reply: it stays in the thread as "Message deleted". */
    deletePost: (id: string) => post<JobDetail>(`/bff/v1/team/jobs/${id}/delete`),
    deleteReply: (id: string, replyId: string) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/replies/${replyId}/delete`),
    correct: (id: string, change: { kind?: JobKind; assignee_id?: string }) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/correct`, change),
    plan: (id: string) => get<Plan>(`/bff/v1/team/jobs/${id}/erpnext`),
    quotation: (id: string, body: { customer: string; brand: string; lines: QuoteLineIn[]; kind?: JobKind }) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/quotation`, body),
    orderRef: (id: string, reference: string) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/order-ref`, { reference }),
    dispatch: (id: string, reference: string, transporter?: string) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/dispatch`, { reference, transporter: transporter || null }),
    payments: (id: string) => get<Payments>(`/bff/v1/team/jobs/${id}/payments`),
    confirmPayment: (id: string, receipt: string) =>
        post<JobDetail>(`/bff/v1/team/jobs/${id}/payment`, { receipt }),
    lastRate: (customer: string, itemCode: string) =>
        get<{ rate?: number | null; quotation?: string | null; date?: string | null }>(
            `/bff/v1/team/last-rate?customer=${encodeURIComponent(customer)}&item_code=${encodeURIComponent(itemCode)}`),
    /** The attachment, as an image source with the headers SmartOps needs. */
    fileSource: async (a: Attachment) => ({ uri: smartopsUrl(a.file_url), headers: await authHeaders() }),
    voiceSource: async (v: Voice) => ({ uri: smartopsUrl(v.url), headers: await authHeaders() }),
    /** Speak instead of typing: the recording written out, for the message box. Nothing is
     * posted and the recording is not kept. */
    transcribe: (voice: PickedVoice) => {
        const f = new FormData();
        f.append('voice', { uri: voice.uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
        return call<{ text: string; tamil: string; said: string }>(
            h => apiPostForm(smartopsUrl('/bff/v1/team/transcribe'), f, h));
    },
};

/** Shown only while SmartOps is too old to give its own list (nothing is saved from them). */
const PREVIEW_TYPES: DocType[] = [
    { key: 'customer_po', label: 'Customer PO', icon: 'cart-outline', fields: [
        { key: 'customer', label: 'Customer', type: 'customer', required: true },
        { key: 'po_no', label: 'PO no', type: 'text', required: false },
        { key: 'po_date', label: 'PO date', type: 'date', required: false },
        { key: 'amount', label: 'Amount', type: 'amount', required: false }] },
    { key: 'principal_invoice', label: 'Principal invoice', icon: 'receipt-outline', fields: [
        { key: 'supplier', label: 'Supplier', type: 'supplier', required: true },
        { key: 'invoice_no', label: 'Invoice no', type: 'text', required: false },
        { key: 'invoice_date', label: 'Invoice date', type: 'date', required: false },
        { key: 'amount', label: 'Amount', type: 'amount', required: false }] },
    { key: 'quotation', label: 'Quotation / PI', icon: 'pricetag-outline', fields: [
        { key: 'customer', label: 'Customer', type: 'customer', required: true },
        { key: 'quotation_no', label: 'Quotation no', type: 'text', required: false },
        { key: 'date', label: 'Date', type: 'date', required: false },
        { key: 'amount', label: 'Amount', type: 'amount', required: false }] },
    { key: 'payment_proof', label: 'Payment proof', icon: 'cash-outline', fields: [
        { key: 'customer', label: 'Customer', type: 'customer', required: true },
        { key: 'amount', label: 'Amount', type: 'amount', required: false },
        { key: 'utr', label: 'UTR / Cheque no', type: 'text', required: false },
        { key: 'payment_date', label: 'Payment date', type: 'date', required: false }] },
    { key: 'dispatch_lr', label: 'Dispatch / LR', icon: 'car-outline', fields: [
        { key: 'invoices', label: 'Sales Invoices', type: 'invoices', required: true },
        { key: 'transporter', label: 'Transporter', type: 'text', required: false },
        { key: 'lr_no', label: 'LR no', type: 'text', required: false },
        { key: 'lr_date', label: 'LR date', type: 'date', required: false }] },
    { key: 'delivery_challan', label: 'Delivery challan', icon: 'clipboard-outline', fields: [
        { key: 'customer', label: 'Customer', type: 'customer', required: true },
        { key: 'dc_no', label: 'DC no', type: 'text', required: false },
        { key: 'date', label: 'Date', type: 'date', required: false }] },
    { key: 'other', label: 'Other', icon: 'document-outline', fields: [
        { key: 'description', label: 'Description', type: 'longtext', required: true }] },
];

/** The types for the attach sheet. `supported` is false while SmartOps is too old to store
 * them: the sheet still shows (so it can be seen), says so, and the post goes without them. */
export async function documentTypeChoices(): Promise<{ types: DocType[]; supported: boolean }> {
    const types = await team.documentTypes();
    return types.length ? { types, supported: true } : { types: PREVIEW_TYPES, supported: false };
}

// ─────────────────────────── small display helpers ───────────────────────────

export const KIND_COLORS: Record<JobKind, string> = {
    proforma: '#2563EB',
    place_order: '#0D9488',
    quotation: '#F59E0B',
    dispatch: '#8B5CF6',
    payment: '#16A34A',
    general: '#64748B',
};

export const KIND_ICONS: Record<JobKind, string> = {
    proforma: 'document-text-outline',
    place_order: 'cart-outline',
    quotation: 'pricetag-outline',
    dispatch: 'car-outline',
    payment: 'cash-outline',
    general: 'chatbubble-ellipses-outline',
};

/** "12 min", "3 h", "2 days" -- how long a job has waited. */
export function age(minutes: number): string {
    if (minutes < 60) return `${Math.max(1, minutes)} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
}

export function shortTime(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return sameDay ? `${hh}:${mm}` : `${d.getDate()}/${d.getMonth() + 1} ${hh}:${mm}`;
}
