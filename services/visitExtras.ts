/**
 * visitExtras.ts — Customer Visit records saved on this phone and synced to ERP
 * (Maintenance Visit). Every save is kept on the phone first; it is then sent to
 * ERP, and anything that didn't reach ERP is retried when the Customer Visit tab opens.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiPost, apiPut } from '@/utils/api';
import { team } from '@/services/teamApi';

export type CompletionEntry = { customer: string; customer_id?: string; visited: 'yes' | 'no' | ''; types: string[] };

export type CustomerVisit = {
    id: string;
    executive: string;
    date_of_visit: string;
    along_with: string[];
    customer_planned: string[];
    /** ERP Customer ids for the planned customers that exist in ERP (in the same order as customer_planned). */
    customer_ids?: string[];
    completion?: CompletionEntry[];
    erp_name?: string;
    dirty?: boolean;
    sync_error?: string;
    /** The Team Chat post last made for this visit, so the same update is never posted twice. */
    team_posted?: string;
    /** Team Chat could not be reached: post it on the next sync. */
    team_pending?: boolean;
    saved_at: string;
};

const FILE = `${FileSystem.documentDirectory}customer_visits.json`;

async function readAll(): Promise<CustomerVisit[]> {
    try {
        return JSON.parse(await FileSystem.readAsStringAsync(FILE));
    } catch {
        return [];
    }
}

async function writeAll(all: CustomerVisit[]) {
    await FileSystem.writeAsStringAsync(FILE, JSON.stringify(all));
}

export async function loadVisits(): Promise<CustomerVisit[]> {
    return readAll();
}

export async function getVisit(id: string): Promise<CustomerVisit | null> {
    return (await readAll()).find(v => v.id === id) ?? null;
}

/** Adds the visit, or replaces the one with the same id. */
export async function saveVisit(visit: CustomerVisit) {
    const all = await readAll();
    const exists = all.some(v => v.id === visit.id);
    await writeAll(exists ? all.map(v => (v.id === visit.id ? visit : v)) : [visit, ...all]);
}

export async function updateVisit(id: string, patch: Partial<CustomerVisit>) {
    const all = await readAll();
    await writeAll(all.map(v => (v.id === id ? { ...v, ...patch } : v)));
}

const reportText = (entries: CompletionEntry[]) =>
    entries
        .map(e => {
            if (e.visited === 'yes') return `${e.customer}: Visited${e.types.length ? ' (' + e.types.join(', ') + ')' : ''}`;
            if (e.visited === 'no') return `${e.customer}: Not visited`;
            return `${e.customer}: Not answered`;
        })
        .join('\n');

function erpPayload(v: CustomerVisit) {
    return {
        customer: (v.customer_ids || [])[0],
        mntc_date: v.date_of_visit,
        maintenance_type: 'Unscheduled',
        company: 'White & Co.',
        status: 'Draft',
        completion_status: v.completion && v.completion.length && v.completion.every(e => e.visited === 'yes') ? 'Fully Completed' : 'Partially Completed',
        purposes: [{ item_code: '', item_name: '', description: 'Customer visit', work_done: '', service_person: '' }],
        along_with: v.along_with.join(', '),
        customer_planned: v.customer_planned.join(', '),
        completion_report: v.completion ? reportText(v.completion) : '',
    };
}

const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso);

/** What the team reads in Team Chat. "FYI" first: it informs, it asks nobody to do anything. */
export function teamText(v: CustomerVisit): string {
    const lines = [`FYI - Customer visit ${v.team_posted ? 'updated' : 'logged'}, ${dmy(v.date_of_visit)}`];
    // The completion report already names each customer; before it, list who was planned.
    if (v.completion && v.completion.length) lines.push(reportText(v.completion));
    else if (v.customer_planned.length) lines.push(`Customers: ${v.customer_planned.join(', ')}`);
    // Last, so a colleague named here is not read as the person this post is for.
    if (v.along_with.length) lines.push(`Along with: ${v.along_with.join(', ')}`);
    return lines.join('\n');
}

/** Same visit, same words: what makes one post. */
const teamSignature = (v: CustomerVisit) =>
    JSON.stringify([v.date_of_visit, v.customer_planned, v.along_with, v.completion ?? null]);

/**
 * Tells the team about the visit: one Team Chat post, in the feed everyone reads. Posted when
 * the visit is saved and again when its details change; an unchanged visit is not posted twice.
 * If Team Chat cannot be reached the visit is left to be posted on the next sync.
 */
export async function tellTeam(v: CustomerVisit): Promise<CustomerVisit> {
    const signature = teamSignature(v);
    if (v.team_posted === signature) return v;
    try {
        const res = await team.post(teamText(v));
        return res.ok ? { ...v, team_posted: signature, team_pending: undefined } : { ...v, team_pending: true };
    } catch {
        return { ...v, team_pending: true };
    }
}

/**
 * Sends the visit to ERP (creates it, or updates it if it is already there).
 * Returns the visit with its ERP name, or with the reason it could not be sent.
 */
export async function syncVisitToErp(v: CustomerVisit): Promise<CustomerVisit> {
    if (!(v.customer_ids || []).length) {
        return { ...v, dirty: true, sync_error: 'Pick at least one existing customer to send this visit to ERP.' };
    }
    const cookies = await SecureStore.getItemAsync('session_cookies');
    try {
        const body = erpPayload(v);
        const res = v.erp_name
            ? await apiPut(apiUrl(`/api/resource/Maintenance%20Visit/${encodeURIComponent(v.erp_name)}`), body, cookies)
            : await apiPost(apiUrl('/api/resource/Maintenance%20Visit'), body, cookies);
        if (!res.ok) {
            return { ...v, dirty: true, sync_error: 'ERP rejected the visit. It will be retried.' };
        }
        const name = v.erp_name || (res.data as any)?.data?.name;
        return { ...v, erp_name: name, dirty: false, sync_error: undefined };
    } catch {
        return { ...v, dirty: true, sync_error: 'No connection. It will be sent when you are online.' };
    }
}

/** Sends every visit that is waiting to reach ERP. */
export async function syncPendingVisits(): Promise<void> {
    const all = await readAll();
    const pending = all.filter(v => v.dirty || v.team_pending);
    if (!pending.length) return;
    const updated: CustomerVisit[] = [];
    for (const v of all) {
        let next = v.dirty ? await syncVisitToErp(v) : v;
        if (next.team_pending) next = await tellTeam(next);
        updated.push(next);
    }
    await writeAll(updated);
}
