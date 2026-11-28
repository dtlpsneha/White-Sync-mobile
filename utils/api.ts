/**
 * api.ts — HTTP utility using XMLHttpRequest instead of fetch.
 *
 * React Native's fetch polyfill sends an `Expect: 100-continue` header
 * on some Android/iOS versions which Frappe/ERPNext rejects with HTTP 417.
 * XMLHttpRequest does NOT send that header, so it works reliably.
 *
 * Every verb shares one `request()` implementation. Previously each of the
 * five exports carried its own copy of the XHR/header/parse boilerplate, so
 * a fix in one (such as the header-splitting bug below) had to be made five
 * times to take effect.
 */

import { refusedPart, showAccessAlert } from '@/utils/accessAlert';

interface ApiResponse<T = any> {
    ok: boolean;
    status: number;
    data: T | null;
    headers: { [key: string]: string };
}

const DEFAULT_TIMEOUT_MS = 15000;
const UPLOAD_TIMEOUT_MS = 60000;

/**
 * Parse a raw header block into a lookup.
 *
 * Splits on the FIRST colon only. The previous implementation split on every
 * `': '` and kept index 1, so any header whose value contained a colon-space
 * (Set-Cookie with an `expires=` date, for instance) was silently truncated.
 */
function parseHeaders(raw: string): { [key: string]: string } {
    const headers: { [key: string]: string } = {};

    raw.split('\r\n').forEach(line => {
        const separator = line.indexOf(':');
        if (separator === -1) return;
        headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    });

    return headers;
}

interface RequestOptions {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH';
    url: string;
    body?: unknown;
    cookies?: string | null;
    customHeaders?: Record<string, string>;
    timeoutMs?: number;
    /** Skip Content-Type so the engine can set the FormData multipart boundary. */
    isFormData?: boolean;
}

/** 401, or ERPNext's own "session expired / not logged in" answer. A plain 403 can be a
 *  real permission refusal for one record, so it does not count. */
function sessionExpired(status: number, text: string): boolean {
    if (status === 401) return true;
    if (status !== 403) return false;
    return /"exc_type"\s*:\s*"(SessionExpired|AuthenticationError)"/.test(text || '');
}

let onSessionExpired: (() => void) | null = null;
let expiredFired = false;

/** The app registers what to do when the session ends (sign out, go to login). */
export function setSessionExpiredHandler(fn: (() => void) | null) {
    onSessionExpired = fn;
    expiredFired = false;
}

function notifySessionExpired() {
    if (expiredFired || !onSessionExpired) return; // many requests fail together; act once
    expiredFired = true;
    try { onSessionExpired(); } catch { /* ignore */ }
}

/** A new sign-in re-arms the handler. */
export function resetSessionExpired() {
    expiredFired = false;
}

function request<T = any>({
    method,
    url,
    body,
    cookies,
    customHeaders,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    isFormData = false,
}: RequestOptions): Promise<ApiResponse<T>> {
    return new Promise(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);

        // A FormData body sets its own multipart boundary; labelling it JSON breaks the
        // upload, so FormData is recognised here even when the caller did not say so.
        const callerSetsType = Object.keys(customHeaders ?? {}).some(k => k.toLowerCase() === 'content-type');
        if (!callerSetsType && !isFormData && !(body instanceof FormData) && body !== undefined) {
            xhr.setRequestHeader(
                'Content-Type',
                body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json'
            );
        }

        if (cookies) {
            xhr.setRequestHeader('Cookie', cookies);
        }

        if (customHeaders) {
            Object.keys(customHeaders).forEach(key => xhr.setRequestHeader(key, customHeaders[key]));
        }

        xhr.onload = () => {
            const ok = xhr.status >= 200 && xhr.status < 300;

            // The phone sent a session and ERPNext says it is no longer valid.
            if (cookies && sessionExpired(xhr.status, xhr.responseText)) notifySessionExpired();
            // Signed in, but this ERPNext login may not open this: say so.
            else if (cookies && xhr.status === 403 && /"exc_type"\s*:\s*"PermissionError"/.test(xhr.responseText || '')) {
                showAccessAlert(refusedPart(url));
            }

            if (!ok) {
                console.warn(`[api ${method}] ${xhr.status} response body:`, xhr.responseText?.substring(0, 500));
            }

            let data: T | null = null;
            try {
                data = JSON.parse(xhr.responseText);
            } catch {
                // A 2xx with an empty or non-JSON body is still a success — the
                // old code reported ok:false here, so successful PUTs that
                // returned no body were treated as failures.
                data = null;
            }

            resolve({ ok, status: xhr.status, data, headers: parseHeaders(xhr.getAllResponseHeaders()) });
        };

        xhr.onerror = () => resolve({ ok: false, status: 0, data: null, headers: {} });
        xhr.ontimeout = () => resolve({ ok: false, status: 0, data: null, headers: {} });

        xhr.timeout = timeoutMs;

        if (body === undefined) {
            xhr.send();
        } else if (isFormData || body instanceof FormData) {
            xhr.send(body as any);
        } else {
            xhr.send(body instanceof URLSearchParams ? body.toString() : JSON.stringify(body));
        }
    });
}

/** Perform a GET request. */
export function apiGet<T = any>(url: string, cookies?: string | null, customHeaders?: Record<string, string>) {
    return request<T>({ method: 'GET', url, cookies, customHeaders });
}

/** Perform a POST request. A URLSearchParams body is sent form-encoded. */
export function apiPost<T = any>(url: string, body: unknown, cookies?: string | null, customHeaders?: Record<string, string>) {
    return request<T>({ method: 'POST', url, body, cookies, customHeaders });
}

/** POST a multipart form (a photo plus fields) with the longer upload timeout. */
export function apiPostForm<T = any>(url: string, form: FormData, customHeaders?: Record<string, string>) {
    return request<T>({
        method: 'POST', url, body: form, customHeaders, isFormData: true, timeoutMs: UPLOAD_TIMEOUT_MS,
    });
}

/** Perform a PUT request. */
export function apiPut<T = any>(url: string, body: unknown, cookies?: string | null) {
    return request<T>({ method: 'PUT', url, body, cookies });
}

/** Perform a PATCH request. */
export function apiPatch<T = any>(url: string, body: unknown, cookies?: string | null) {
    return request<T>({ method: 'PATCH', url, body, cookies });
}

/** Upload a file using FormData. */
export function uploadFile<T = any>(url: string, file: any, cookies?: string | null, fields?: Record<string, string>) {
    const formData = new FormData();

    // Frappe/ERPNext file upload API expects 'file' and optionally 'doctype', 'docname', 'fieldname'
    if (file?.uri) {
        formData.append('file', {
            uri: file.uri,
            name: file.name || file.uri.split('/').pop(),
            type: file.type || 'image/jpeg',
        } as any);
    }
    // Extra form fields, e.g. doctype/docname to attach the file to a document
    Object.entries(fields || {}).forEach(([k, v]) => formData.append(k, v));

    return request<T>({
        method: 'POST',
        url,
        body: formData,
        cookies,
        isFormData: true,
        timeoutMs: UPLOAD_TIMEOUT_MS,
    });
}
