/**
 * Files attached to Customer POs (ERPNext Sales Orders).
 *
 * The New Customer PO screen uploads each chosen file as its own ERPNext File attached
 * to the order; it never fills the order's single `attach` field. So an order's files
 * are read from File records, plus `attach` when an older order has one there.
 */

import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';

export type OrderFile = { name: string; fileName: string; url: string; isPdf: boolean };

/** Orders per request (keeps the GET URL short). */
const CHUNK = 100;

const toFile = (r: any): OrderFile => {
    const url = String(r.file_url || '');
    const fileName = String(r.file_name || url.split('/').pop() || 'attachment');
    return { name: String(r.name || url), fileName, url, isPdf: /\.pdf$/i.test(fileName || url) };
};

async function listFiles(orderNames: string[]): Promise<any[] | null> {
    const cookies = await SecureStore.getItemAsync('session_cookies');
    const fields = JSON.stringify(['name', 'file_name', 'file_url', 'attached_to_name', 'creation']);
    const out: any[] = [];
    for (let i = 0; i < orderNames.length; i += CHUNK) {
        const part = orderNames.slice(i, i + CHUNK);
        const filters = JSON.stringify([
            ['attached_to_doctype', '=', 'Sales Order'],
            ['attached_to_name', 'in', part],
            ['is_folder', '=', 0],
        ]);
        const res = await apiGet(apiUrl(
            `/api/resource/File?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}` +
            `&order_by=${encodeURIComponent('creation asc')}&limit_page_length=0`
        ), cookies);
        if (!res.ok) return null;
        out.push(...((res.data as any)?.data || []));
    }
    return out;
}

/** Every file on one order, oldest first; `attach` (if set and not already listed) comes first. */
export async function getOrderFiles(orderName: string, attach?: string | null): Promise<OrderFile[] | null> {
    try {
        const rows = await listFiles([orderName]);
        if (!rows) return null;
        const files = rows.map(toFile).filter(f => f.url);
        if (attach && !files.some(f => f.url === attach)) {
            files.unshift(toFile({ name: attach, file_url: attach }));
        }
        return files;
    } catch {
        return null;
    }
}

/** Number of files on each order (orders with none are left out). */
export async function getOrderFileCounts(orders: { name: string; attach?: string | null }[]): Promise<Map<string, number> | null> {
    if (!orders.length) return new Map();
    try {
        const rows = await listFiles(orders.map(o => o.name));
        if (!rows) return null;
        const urls = new Map<string, Set<string>>();
        for (const r of rows) {
            const key = String(r.attached_to_name);
            if (!urls.has(key)) urls.set(key, new Set());
            urls.get(key)!.add(String(r.file_url || r.name));
        }
        const counts = new Map<string, number>();
        for (const o of orders) {
            const set = urls.get(o.name) ?? new Set<string>();
            const n = rows.filter(r => r.attached_to_name === o.name).length + (o.attach && !set.has(o.attach) ? 1 : 0);
            if (n) counts.set(o.name, n);
        }
        return counts;
    } catch {
        return null;
    }
}
