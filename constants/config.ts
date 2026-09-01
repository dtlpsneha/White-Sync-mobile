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
