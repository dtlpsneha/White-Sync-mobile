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

        if (!isFormData && body !== undefined) {
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

/** Perform a PUT request. */
export function apiPut<T = any>(url: string, body: unknown, cookies?: string | null) {
    return request<T>({ method: 'PUT', url, body, cookies });
}

/** Perform a PATCH request. */
export function apiPatch<T = any>(url: string, body: unknown, cookies?: string | null) {
    return request<T>({ method: 'PATCH', url, body, cookies });
}

/** Upload a file using FormData. */
export function uploadFile<T = any>(url: string, file: any, cookies?: string | null) {
    const formData = new FormData();

    // Frappe/ERPNext file upload API expects 'file' and optionally 'doctype', 'docname', 'fieldname'
    if (file?.uri) {
        formData.append('file', {
            uri: file.uri,
            name: file.uri.split('/').pop(),
            type: file.type || 'image/jpeg',
        } as any);
    }

    return request<T>({
        method: 'POST',
        url,
        body: formData,
        cookies,
        isFormData: true,
        timeoutMs: UPLOAD_TIMEOUT_MS,
    });
}
