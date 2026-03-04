/**
 * api.ts — HTTP utility using XMLHttpRequest instead of fetch.
 *
 * React Native's fetch polyfill sends an `Expect: 100-continue` header
 * on some Android/iOS versions which Frappe/ERPNext rejects with HTTP 417.
 * XMLHttpRequest does NOT send that header, so it works reliably.
 */

interface ApiResponse<T = any> {
    ok: boolean;
    status: number;
    data: T | null;
    headers: { [key: string]: string };
}

/**
 * Perform a GET request using XMLHttpRequest.
 * @param url  Full URL to request
 * @param cookies  Optional session cookie string
 */
export function apiGet<T = any>(url: string, cookies?: string | null): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);

        if (cookies) {
            xhr.setRequestHeader('Cookie', cookies);
        }

        xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                console.warn(`[apiGet] ${xhr.status} response body:`, xhr.responseText?.substring(0, 500));
            }

            const headers: { [key: string]: string } = {};
            const headerString = xhr.getAllResponseHeaders();
            headerString.split('\r\n').forEach(line => {
                const parts = line.split(': ');
                if (parts.length > 1) headers[parts[0].toLowerCase()] = parts[1];
            });

            try {
                const data: T = JSON.parse(xhr.responseText);
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data, headers });
            } catch {
                resolve({ ok: false, status: xhr.status, data: null, headers });
            }
        };

        xhr.onerror = () => resolve({ ok: false, status: 0, data: null, headers: {} });
        xhr.ontimeout = () => resolve({ ok: false, status: 0, data: null, headers: {} });

        xhr.timeout = 15000;
        xhr.send();
    });
}

/**
 * Perform a POST request using XMLHttpRequest.
 * @param url  Full URL to request
 * @param body  JSON-serialisable body
 * @param cookies  Optional session cookie string
 */
export function apiPost<T = any>(url: string, body: unknown, cookies?: string | null): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);

        if (body instanceof URLSearchParams) {
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        } else {
            xhr.setRequestHeader('Content-Type', 'application/json');
        }

        if (cookies) {
            xhr.setRequestHeader('Cookie', cookies);
        }

        xhr.onload = () => {
            const headers: { [key: string]: string } = {};
            const headerString = xhr.getAllResponseHeaders();
            headerString.split('\r\n').forEach(line => {
                const parts = line.split(': ');
                if (parts.length > 1) headers[parts[0].toLowerCase()] = parts[1];
            });

            try {
                const data: T = JSON.parse(xhr.responseText);
                resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data, headers });
            } catch {
                resolve({ ok: false, status: xhr.status, data: null, headers });
            }
        };

        xhr.onerror = () => resolve({ ok: false, status: 0, data: null, headers: {} });
        xhr.ontimeout = () => resolve({ ok: false, status: 0, data: null, headers: {} });

        xhr.timeout = 15000;
        xhr.send(body instanceof URLSearchParams ? body.toString() : JSON.stringify(body));
    });
}
