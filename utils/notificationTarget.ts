/**
 * Where tapping a notification should go.
 *
 * Most alerts in this app are about a quotation and carry its name as `data.id`. Team chat
 * alerts carry `data.teamJobId` instead (and no `id`), and open that job. Every place that
 * opens a notification — the system tray tap, the in-app modal, the Notifications list —
 * asks here, so a Team alert never lands on an empty quotation screen.
 */

type Target =
    | { pathname: '/team/[id]'; params: { id: string } }
    | { pathname: '/quotations/[id]'; params: { id: string } };

export function isTeamAlert(data: unknown): boolean {
    return typeof (data as { teamJobId?: unknown } | null)?.teamJobId === 'string';
}

export function notificationTarget(data: unknown): Target | null {
    const d = (data ?? {}) as { teamJobId?: unknown; id?: unknown };
    if (typeof d.teamJobId === 'string' && d.teamJobId) {
        return { pathname: '/team/[id]', params: { id: d.teamJobId } };
    }
    if (typeof d.id === 'string' && d.id) {
        return { pathname: '/quotations/[id]', params: { id: d.id } };
    }
    return null;
}
