/**
 * attachmentsApi.ts — SmartOps reads the files attached in this app.
 *
 * After a file is saved in ERPNext (a Customer PO's copy, a visit's bill photo) the app tells
 * SmartOps, which fetches it from ERPNext, reads it (OCR) and keeps what it said against the
 * record. The order and visit screens then show that, and for a Customer PO where it differs
 * from the order. Nothing is changed in ERPNext by this.
 */

import { smartopsAs } from '@/services/teamApi';

export type AttachmentRecord = 'Sales Order' | 'Maintenance Visit';

export interface ReadLine {
    description: string;
    qty: number | null;
    uom: string;
    rate: number | null;
    amount: number | null;
    item_code: string;
}

export interface FileRead {
    file_url: string;
    file_name: string;
    label: string;
    /** reading | read | nothing_read | unreadable | failed */
    state: 'reading' | 'read' | 'nothing_read' | 'unreadable' | 'failed';
    note: string;
    kind: string | null;
    party: string | null;
    ref: string | null;
    date: string | null;
    total: number | null;
    lines: ReadLine[];
    differences: string[];
}

/** Ask SmartOps to read a file just saved in ERPNext. Never throws; false if it was not taken
 *  (a Customer PO file is still picked up by SmartOps' own check a few minutes later). */
export async function readAttachment(doctype: AttachmentRecord, name: string, fileUrl: string, label = ''): Promise<boolean> {
    if (!name || !fileUrl) return false;
    try {
        const res = await smartopsAs.post<{ id: string }>('/bff/v1/attachments/read', { doctype, name, file_url: fileUrl, label });
        return res.ok;
    } catch {
        return false;
    }
}

/** What SmartOps read from each file on this record. null = SmartOps could not be asked. */
export async function attachmentReads(doctype: AttachmentRecord, name: string): Promise<FileRead[] | null> {
    try {
        const res = await smartopsAs.get<{ files: FileRead[] }>(
            `/bff/v1/attachments?doctype=${encodeURIComponent(doctype)}&name=${encodeURIComponent(name)}`);
        return res.ok ? res.data.files : null;
    } catch {
        return null;
    }
}

export const stillReading = (reads: FileRead[] | null) => !!reads?.some(r => r.state === 'reading');

export const rupees = (n: number | null | undefined) =>
    n === null || n === undefined ? '' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const dmyDate = (iso: string | null) => {
    const [y, m, d] = (iso || '').split('-');
    return y && m && d ? `${d}-${m}-${y}` : iso || '';
};
