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
 * (`app/ai-chat.tsx` via `services/smartopsApi.ts`). Different host, different auth
 * model, different transport; nothing else in this app talks to it.
 *
 * Now served over real HTTPS at its own domain (2026-09-11), which also carries the
 * SmartOps web dashboard at the same host — this replaced the old plaintext
 * `http://194.238.18.59:8200` (a temporary nginx vhost, same box as ERPNext, port-based
 * only, no TLS). That old address also depended on a firewall rule scoped to one IP
 * range, which is why it only worked over office Wi-Fi and never over mobile data — the
 * domain isn't affected by that (fixed server-side, but the previous URL is best
 * retired anyway now that a real domain exists).
 */
export const SMARTOPS_API_BASE_URL = 'https://smartops.dtlp.tech';

/** Build a full SmartOps API URL from a path such as `/bff/v1/chat`. */
export const smartopsUrl = (path: string) =>
    `${SMARTOPS_API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
