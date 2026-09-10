/**
 * config.ts — single source of truth for backend connection details.
 *
 * Previously the host was hardcoded at 30+ call sites across 14 files, so
 * pointing the app at a different server meant a find-and-replace. Import
 * API_BASE_URL instead of writing the host inline.
 */

export const API_BASE_URL = 'http://194.238.18.59:8080';

/** Host used to resolve relative /files/... paths returned by Frappe. */
export const IMAGE_HOST = API_BASE_URL;

/** Build a full API URL from a path such as `/api/method/login`. */
export const apiUrl = (path: string) =>
    `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * SmartOps — a SEPARATE backend from ERPNext above, used only by the AI chat screen
 * (`app/ai-chat.tsx` via `services/smartopsApi.ts`). Different host port, different
 * auth model, different transport; nothing else in this app talks to it.
 *
 * Both services happen to run on the same box: ERPNext is published on :8080, while the
 * SmartOps API itself binds to 127.0.0.1:8100 there and is only reachable from outside
 * through nginx. :8200 is that nginx vhost — plaintext HTTP, and marked "temporary,
 * remove once TLS is up" in its own server config — so this is expected to become
 * `https://smartops.whitenco.net` once that domain is fully live. One constant to change.
 */
export const SMARTOPS_API_BASE_URL = 'http://194.238.18.59:8200';

/** Build a full SmartOps API URL from a path such as `/bff/v1/chat`. */
export const smartopsUrl = (path: string) =>
    `${SMARTOPS_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
