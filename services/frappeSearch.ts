/**
 * frappeSearch.ts — shared link-field lookups against Frappe.
 *
 * app/maintenance/create.tsx and app/maintenance/[id].tsx each carried their
 * own byte-identical copies of these searches (and each duplicated the
 * Approving Authority lookup twice internally, once for "authority" and once
 * for "sales executive"). They live here once so both screens stay in sync.
 *
 * Every function returns a SearchResult rather than throwing, so callers keep
 * the existing `setSearchError(...)` / `setResults([])` handling.
 */

import * as SecureStore from 'expo-secure-store';
import { apiUrl } from '@/constants/config';
import { apiGet } from '@/utils/api';

export interface Customer {
    name: string;
    customer_name: string;
    territory?: string;
    customer_primary_address?: string;
    customer_primary_contact?: string;
    customer_group?: string;
}

export interface Contact {
    name: string;
    first_name?: string;
    last_name?: string;
    email_id?: string;
    mobile_no?: string;
}

export interface Item {
    name: string;
    item_name: string;
    description?: string;
}

export interface Address {
    name: string;
    address_title?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
}

/** Shape returned by frappe.desk.search.search_link. */
export interface LinkOption {
    value: string;
    description?: string;
}

export type SearchResult<T> =
    | { ok: true; data: T[] }
    | { ok: false; error: string; data: [] };

const failure = (error: string): { ok: false; error: string; data: [] } =>
    ({ ok: false, error, data: [] });

/**
 * Escape the SQL LIKE wildcards `%` and `_` so a user typing them searches for
 * the literal character instead of silently widening the match.
 */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, c => `\\${c}`);

const session = () => SecureStore.getItemAsync('session_cookies');

/** Search customers by customer name OR customer ID. */
export async function searchCustomers(query: string): Promise<SearchResult<Customer>> {
    const trimmed = query.trim();
    if (!trimmed) return { ok: true, data: [] };

    try {
        const fields = ['name', 'customer_name', 'customer_group', 'territory', 'customer_primary_address', 'customer_primary_contact'];
        const orFilters = JSON.stringify([
            ['customer_name', 'like', `%${escapeLike(trimmed)}%`],
            ['name', 'like', `%${escapeLike(trimmed)}%`],
        ]);

        const res = await apiGet(apiUrl(
            `/api/resource/Customer?fields=${encodeURIComponent(JSON.stringify(fields))}` +
            `&or_filters=${encodeURIComponent(orFilters)}&limit_page_length=100`
        ), await session());

        if (!res.ok) return failure(`Server error (${res.status}). Please try again.`);
        return { ok: true, data: res.data?.data || res.data?.message || [] };
    } catch {
        return failure('Network error. Please check your connection.');
    }
}

/** Contacts linked to a customer, optionally narrowed by first name. */
export async function searchContacts(customerName: string, query = ''): Promise<SearchResult<Contact>> {
    if (!customerName) return { ok: true, data: [] };
    const trimmed = query.trim();

    try {
        const fields = ['name', 'first_name', 'last_name', 'email_id', 'mobile_no'];
        const filters: any[] = [
            ['Dynamic Link', 'link_name', '=', customerName],
            ['Dynamic Link', 'link_doctype', '=', 'Customer'],
        ];
        // NOTE: the old code wrapped this value in encodeURIComponent *before*
        // JSON.stringify, so searching for a contact called "A B" looked for
        // "A%20B" and never matched. The whole query string is encoded below.
        if (trimmed) filters.push(['first_name', 'like', `%${escapeLike(trimmed)}%`]);

        const res = await apiGet(apiUrl(
            `/api/method/frappe.client.get_list?doctype=Contact` +
            `&fields=${encodeURIComponent(JSON.stringify(fields))}` +
            `&filters=${encodeURIComponent(JSON.stringify(filters))}&limit_page_length=100`
        ), await session());

        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || res.data?.data || [] };
    } catch {
        return failure('Network error');
    }
}

/** Addresses linked to a customer. */
export async function searchAddresses(customerName: string): Promise<SearchResult<Address>> {
    if (!customerName) return { ok: true, data: [] };

    try {
        const filters = JSON.stringify([
            ['Dynamic Link', 'link_name', '=', customerName],
            ['Dynamic Link', 'link_doctype', '=', 'Customer'],
        ]);
        const fields = JSON.stringify(['name', 'address_title', 'address_line1', 'address_line2', 'city', 'state', 'pincode']);

        const res = await apiGet(apiUrl(
            `/api/method/frappe.client.get_list?doctype=Address` +
            `&filters=${encodeURIComponent(filters)}&fields=${encodeURIComponent(fields)}&limit_page_length=100`
        ), await session());

        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || res.data?.data || [] };
    } catch {
        return failure('Network error');
    }
}

/**
 * Approving Authority link search — backs both the "assigned to" and the
 * "sales executive" pickers, which previously had one copy of this each.
 */
export async function searchApprovingAuthorities(query = ''): Promise<SearchResult<LinkOption>> {
    try {
        const params = new URLSearchParams({
            doctype: 'Approving Authority',
            txt: query.trim(),
            ignore_user_permissions: '0',
        });

        const res = await apiGet(
            apiUrl(`/api/method/frappe.desk.search.search_link?${params.toString()}`),
            await session()
        );

        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.message || res.data?.results || [] };
    } catch {
        return failure('Network error');
    }
}

/** Active, non-template items matched on item code or item name. */
export async function searchItems(query = ''): Promise<SearchResult<Item>> {
    const trimmed = query.trim();

    try {
        const fields = ['name', 'item_name', 'description'];
        const filters = JSON.stringify([['disabled', '=', 0], ['has_variants', '=', 0]]);
        const orFilters = JSON.stringify([
            ['item_code', 'like', `%${escapeLike(trimmed)}%`],
            ['item_name', 'like', `%${escapeLike(trimmed)}%`],
        ]);

        const res = await apiGet(apiUrl(
            `/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(fields))}` +
            `&filters=${encodeURIComponent(filters)}` +
            (trimmed ? `&or_filters=${encodeURIComponent(orFilters)}` : '') +
            `&limit_page_length=100`
        ), await session());

        if (!res.ok) return failure(`Server error (${res.status})`);
        return { ok: true, data: res.data?.data || [] };
    } catch {
        return failure('Network error');
    }
}

/** Single address's formatted display string. */
export async function getAddressDisplay(addressName: string): Promise<string> {
    if (!addressName) return '';
    try {
        const res = await apiGet(
            apiUrl(`/api/resource/Address/${encodeURIComponent(addressName)}?fields=${encodeURIComponent('["display"]')}`),
            await session()
        );
        return res.ok ? (res.data?.data?.display || '') : '';
    } catch {
        return '';
    }
}

/** Single contact's name/email/mobile, pre-joined for display. */
export async function getContactDetails(contactName: string): Promise<{ fullName: string; email: string; mobile: string } | null> {
    if (!contactName) return null;
    try {
        const res = await apiGet(
            apiUrl(`/api/resource/Contact/${encodeURIComponent(contactName)}?fields=${encodeURIComponent('["first_name","last_name","email_id","mobile_no"]')}`),
            await session()
        );
        if (!res.ok) return null;

        const c = res.data?.data || {};
        return {
            fullName: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || '',
            email: c.email_id || '',
            mobile: c.mobile_no || '',
        };
    } catch {
        return null;
    }
}
