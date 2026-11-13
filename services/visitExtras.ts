/**
 * visitExtras.ts — Customer Visit records saved on this phone and synced to ERP
 * (Maintenance Visit). Every save is kept on the phone first; it is then sent to
 * ERP, and anything that didn't reach ERP is retried when the Customer Visit tab opens.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiPost, apiPut } from '@/utils/api';

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
    const pending = all.filter(v => v.dirty);
    if (!pending.length) return;
    const updated: CustomerVisit[] = [];
    for (const v of all) {
        updated.push(v.dirty ? await syncVisitToErp(v) : v);
    }
    await writeAll(updated);
}
