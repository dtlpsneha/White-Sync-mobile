# Reception Chat → White Sync Integration Plan

**Written:** 2026-09-09
**Source to port from:** `C:\DTLP\Expo Mobile App` (the "reception-mobile" Expo app, SmartOps' own mobile client — see its `PLAN.md`/`CLAUDE.md` for how it was built)
**Target:** `C:\DTLP\White-Sync-mobile` (this repo — ERPNext-backed sales/maintenance app)

## 0. The one fact that shapes everything below

**These two apps talk to two entirely different backends, with two entirely different auth mechanisms.** This isn't a copy-paste job — it's wiring a second backend connection into an app that only knows about one today.

| | White-Sync (this app, today) | Reception Mobile (source to port) |
|---|---|---|
| **Backend** | ERPNext/Frappe directly, `http://194.238.18.59:8080` | SmartOps FastAPI (`/bff/v1/*`) |
| **Auth** | Frappe session cookie (`sid=...`), stored as `session_cookies` in SecureStore | Bearer token, stored as `smartops.session_token` in SecureStore |
| **Transport** | `XMLHttpRequest` (`utils/api.ts`) — Frappe rejects fetch's `Expect: 100-continue` header | `fetch()` (`lib/api.ts`) |
| **Nav pattern** | Plain `<Stack>`, `FloatingNav.tsx` floating tab bar, manual `SecureStore` session check per screen | Auth-gated `<Stack>` via `AuthProvider`/`useAuth()`, real tab bar |
| **Theme** | `constants/theme.ts` → `Colors.light/dark`, `useColorScheme` from `hooks/` | `constants/Colors.ts` + `constants/Fonts.ts` (Space Grotesk/Manrope), `useColorScheme` from `components/` |

So this plan is **additive**: White-Sync keeps its existing ERPNext connection exactly as-is, and gains a *second*, independent connection to the SmartOps API purely for the chat feature. Nothing in `utils/api.ts` or the existing screens changes.

## 1. Where the SmartOps backend actually lives

Both ERPNext and SmartOps run on the **same production box**, `194.238.18.59` (confirmed live 2026-09-09):

- ERPNext (what White-Sync already uses): `194.238.18.59:8080`
- SmartOps API: bound to `127.0.0.1:8100` on that box — **not directly reachable**. Public access is only through nginx:
  - `http://194.238.18.59:8200` — temporary plaintext HTTP vhost (`smartops-local`), proxies `/bff/*` and `/api/*` to the backend, `/` to the Next.js web app. Marked "remove once TLS is up" in its own nginx comment, but it's the only option that works today from a physical device without a domain.
  - `https://smartops.whitenco.net` — the real domain, once DNS/TLS is fully live for it.

**Decision needed:** point the mobile app's `SMARTOPS_API_BASE_URL` at `http://194.238.18.59:8200` for now, matching what the Reception Mobile app's own README documents as the pattern (`EXPO_PUBLIC_API_BASE_URL` env override). Switch to `smartops.whitenco.net` later with zero code changes — same one-constant pattern White-Sync already uses in `constants/config.ts` for its ERPNext URL.

## 2. Auth strategy — recommend starting with none

The source app's own `auth-context.tsx` comment is the key fact:

> None of the reception/chat routes this app calls actually 401 on a missing/invalid caller — they fall back to an anonymous STAFF caller... So "signed in" here means "the login screen doesn't need to be shown", not a server-confirmed claim.

That means the chat backend **works today with no SmartOps auth at all** — every call just gets treated as anonymous staff. Given White-Sync already has its own separate ERPNext login, forcing a *second* login screen for SmartOps would be bad UX for no functional gain in v1.

**Recommendation:** skip porting `AuthProvider`/`login()`/`token-store.ts` in phase 1. Call the chat endpoints with no `Authorization` header, same as `lib/api.ts`'s `apiFetch` does when `loadToken()` returns null. Revisit later if/when the roadmap needs real per-user attribution in the chat trace (e.g. distinguishing which White-Sync salesperson asked what) — at that point, the cleanest path is reusing the *existing* White-Sync Frappe login against `/bff/v1/login` too (SmartOps' unified login already accepts username/password the same way), not building a separate SmartOps-specific sign-in flow.

## 3. Files to port, and what changes in each

All paths below are relative to `C:\DTLP\Expo Mobile App\` (source) → `C:\DTLP\White-Sync-mobile\` (destination).

### 3a. New API client — `lib/smartops-api.ts` (new file, don't touch `utils/api.ts`)

Port from `lib/api.ts`, keep only the chat section (skip auth/login, skip `searchCustomers`/`lookupCustomer`/`createLead`/`fetchLeadHistory` — those are reception-specific screens White-Sync isn't getting in phase 1):

```ts
export const SMARTOPS_API_BASE_URL = 'http://194.238.18.59:8200'; // → constants/config.ts, same pattern as API_BASE_URL

// keep: ApiUnreachableError, ApiError, toApiError, apiFetch, apiGet, apiPost
// apiFetch: drop the Authorization/token logic per §2 — send only X-Client: mobile
export const fetchChat = (session?: string) => apiGet<ChatOut>(`/bff/v1/chat${...}`);
export const sendChatMessage = (message: string, session: string) => apiPost<ChatSendOut>('/bff/v1/chat/send', ...);
export const clearChat = (session: string) => apiPost<ChatClearOut>('/bff/v1/chat/clear', ...);
export const renameChat = (session: string, title: string) => apiPost<ChatRenameOut>('/bff/v1/chat/rename', ...);
```

Drop `setChatCustomer` too — that exists to link the chat session to a *customer selected from the reception Customer 360 screen*, which White-Sync has no equivalent of. A White-Sync user just gets a general-purpose chat, no customer-context linking, in phase 1.

### 3b. Types — `lib/smartops-types.ts` (new file)

Port the **chat-only** subset of `lib/types.ts`: `ChatMessage`, `ChatStep`, `ChatSession`, `ChatOut`, `ChatSendOut`, `ChatClearOut`, `ChatRenameOut`. Skip `LoginOut`, `LeadIn/Out`, `CustomerSearchResult/Out`, `CustomerProfile*`, `QuoteSummary`/`InvoiceSummary` **unless** you also want the invoice/quote result cards (`ToolResultCard` in `ai.tsx`) — recommend keeping those, they're generic chat-result rendering, not reception-specific, and White-Sync already has its own quotation/invoice domain where this data will feel native.

### 3c. Screen — `app/ai-chat.tsx` (new file, ported from `app/(tabs)/ai.tsx`)

This is the bulk of the work. Port `AiScreen` wholesale, then:

- **Delete** everything gated on `selectedCustomer` / `useSelectedCustomer()` — the `useEffect` that calls `setChatCustomer`, the customer chip in the header, `lastSyncedCustomerId`. White-Sync has no `selected-customer-context.tsx` equivalent and phase 1 doesn't need one.
- **Delete** the `QUICK_PROMPTS` array's customer-lookup prompts (`"Show customer profile"`, `"Who's handling this customer?"`) — replace with prompts relevant to what this chat can actually still do without a linked customer (general Q&A). Keep or adapt `"Show pending invoices"` / `"Show recent quotes"` only if the underlying `crm.customer.*` tools still resolve *something* useful for an anonymous caller — verify against a live test (§5) before deciding wording.
- **Swap every styling import:**
  - `@/components/Themed` → White-Sync doesn't have this; use plain `View`/`Text` from `react-native` + `Colors[theme]` from `@/constants/theme` directly, matching how `app/home.tsx` already does it.
  - `@/constants/Colors` → `@/constants/theme`'s `Colors`
  - `@/constants/Fonts` → White-Sync has no `Fonts` constant; either add one (SpaceGrotesk/Manrope aren't loaded in this app's `_layout.tsx` — would need adding those font packages + `useFonts` calls) or just drop the `fontFamily` overrides and use the system font White-Sync already uses everywhere else. **Recommend dropping** — matching this app's existing type system is more consistent than importing the source app's.
  - `@/components/useColorScheme` → `@/hooks/use-color-scheme` (White-Sync's own path)
- **`SafeAreaView`/`KeyboardAvoidingView` wrapper** — keep as-is, same library (`react-native-safe-area-context`), already a White-Sync dependency.

### 3d. Component — `components/ChatHistorySheet.tsx` (new file, 193 lines)

Port with the same import swaps as 3c (`Colors`, `Fonts`, `useColorScheme`). This is otherwise self-contained (a modal bottom-sheet listing/renaming past sessions) — no customer-context dependency, ports cleanly.

### 3e. Component — `components/Badge.tsx` (new file)

Small, ports as-is with the same import swaps. Only needs `Colors[theme]` to expose `greenSoft/green/redSoft/red/amberSoft/amber/accentSoft/accentInk/border/muted` tokens — **check `constants/theme.ts` has equivalents** (it has `success`/`danger`/`warning`/`info`/`surfaceVariant` etc. per what was read — map Badge's tone colors onto those rather than inventing new ones).

### 3f. Icons — pull only what's used, don't port `icons.tsx` wholesale

`ai.tsx` and `ChatHistorySheet.tsx` together use: `ClockIcon`, `SendIcon`, `SparkleIcon`, `CloseIcon`, `PencilIcon`, `CheckIcon`. White-Sync already uses `@expo/vector-icons` (Ionicons) everywhere (`app/index.tsx`, `app/home.tsx`) instead of hand-drawn SVG icon components — **recommend using Ionicons equivalents** (`time-outline`, `send`, `sparkles`, `close`, `pencil`, `checkmark`) instead of porting the source app's custom SVG icon file, for consistency with the rest of this codebase.

## 4. Wiring into navigation

White-Sync uses a flat `<Stack>` (`app/_layout.tsx`) with `FloatingNav.tsx` as the persistent bottom nav (see `app/home.tsx`'s usage) — not Expo Router tabs like the source app. Two options:

- **Option A (recommended for v1):** Add `ai-chat` as a new stack route (`app/ai-chat.tsx`), and add an entry/icon to `FloatingNav.tsx` alongside whatever's already there (Home, Quotations, Sales Orders, etc. — check that component's current item list before adding).
- **Option B:** A floating action button (chat bubble) on `home.tsx` that pushes `router.push('/ai-chat')`, if a permanent nav-bar slot isn't wanted.

Either way, no auth gate needed at the route level (per §2) — the screen works whether or not the user is signed into ERPNext.

## 5. Verification before writing any UI code

Before porting `ai.tsx`, confirm the backend path actually works from outside the SmartOps mobile app, since White-Sync will be a different `X-Client`/caller shape hitting the same endpoints:

```bash
curl -X POST http://194.238.18.59:8200/bff/v1/chat/send \
  -H "Content-Type: application/json" -H "X-Client: mobile" \
  -d '{"message": "hello", "session": ""}'
```

Expect a `ChatSendOut` JSON body with a `session_id`. If this 401s or errors, the anonymous-fallback assumption in §2 needs rechecking against the current `apps/api/app/tenancy/session.py` / `bff/chat.py` before building further — that behavior is described as of the CLAUDE.md snapshot referenced above and could have changed.

## 6. Suggested build order

1. `constants/config.ts` — add `SMARTOPS_API_BASE_URL` alongside the existing `API_BASE_URL`
2. `lib/smartops-types.ts` — chat types only (§3b)
3. `lib/smartops-api.ts` — chat client, no-auth `apiFetch` (§3a)
4. Manual `curl` check (§5) — confirm live before writing UI
5. `components/Badge.tsx` (§3e) — smallest, no dependencies on the others
6. `components/ChatHistorySheet.tsx` (§3d)
7. `app/ai-chat.tsx` (§3c) — the screen itself, last because it depends on everything above
8. `components/FloatingNav.tsx` — add the nav entry (§4)
9. On-device test: send a message, reopen chat history, rename a session, clear a session — the four things `smartops-api.ts` exposes

## 7. Explicitly out of scope for phase 1 (revisit later if needed)

- SmartOps login / bearer-token auth (§2)
- Customer-context linking (`setChatCustomer`, the "ask about this customer" chip) — needs a `selected-customer-context.tsx` equivalent and a Customer 360 screen White-Sync doesn't have
- Reception-specific screens (customer search, lead capture, lead history) — `ai.tsx`'s chat is the only piece being ported, not the reception module as a whole
- Push notifications for new chat activity (White-Sync's `usePushNotifications.ts`/`NotificationService.ts` are for a different, ERPNext-driven notification stream today — wiring chat into that is a separate task)
