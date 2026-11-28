/**
 * What the app keeps in memory for the person signed in right now, so screens can
 * draw at once when you come back to them (Home especially, which other screens
 * reopen with router.replace and so mount from scratch).
 *
 * It must never outlive the person: clearSessionCaches() runs on every sign-in and
 * sign-out, and when ERPNext says the session has ended.
 */

export type HomeSnapshot = {
    userName: string | null;
    isManager: boolean;
    /** True only once real figures arrived from ERPNext (not the placeholders). */
    statsLoaded: boolean;
    statsMap: Record<string, any>;
    summaryStats: { totalValue: string; totalQuotes: number; totalCustomers: number; conversionRate: string; avgQuoteValue: string };
    lastUpdated: string;
};

export const sessionCache: { home: HomeSnapshot | null } = { home: null };

/** Forget everything kept for the current person. */
export function clearSessionCaches() {
    sessionCache.home = null;
}
