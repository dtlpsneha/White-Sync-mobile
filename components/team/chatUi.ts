/**
 * Small display rules shared by the Team chat screens: a steady colour per person (so a
 * name is recognisable at a glance, as in a WhatsApp group), initials, and day labels.
 */

const PERSON_COLORS = ['#E11D48', '#7C3AED', '#0891B2', '#D97706', '#059669', '#2563EB', '#C026D3', '#EA580C'];

/** SmartOps' own posts: deep green, as in the Figma Team Chat frame. */
export const SMARTOPS_GREEN = '#2F5D50';

/** One Ember colour per job kind (proforma, order, quotation, dispatch, payment, general). */
const KIND_TINT: Record<string, string> = {
    proforma: '#3E7CB1',
    place_order: '#2F5D50',
    quotation: '#D99A14',
    dispatch: '#8E5BB5',
    payment: '#2F7D5B',
    general: '#8C8173',
};

export function kindTint(kind: string | null | undefined, bySmartops = false): string {
    if (bySmartops) return SMARTOPS_GREEN;
    return KIND_TINT[kind || 'general'] ?? KIND_TINT.general;
}

/** One Ember colour per document type; amber for a file nobody has filed yet. */
const DOC_TINT: Record<string, string> = {
    customer_po: '#E4572E',
    principal_invoice: '#3E7CB1',
    quotation: '#D99A14',
    payment_proof: '#2F5D50',
    dispatch_lr: '#2F7D5B',
    delivery_challan: '#8E5BB5',
    other: '#8C8173',
};

export function docTint(docType: string | null | undefined): string {
    if (!docType) return '#D99A14';
    return DOC_TINT[docType] ?? '#8C8173';
}

export function personColor(name: string | null | undefined): string {
    const s = (name || '?').toLowerCase();
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return PERSON_COLORS[h % PERSON_COLORS.length];
}

/** "Ravi K" -> "RK"; an email -> its first two letters. */
export function initials(name: string | null | undefined): string {
    const clean = (name || '?').split('@')[0].replace(/[._-]+/g, ' ').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
}

/** A person's name as the chat shows it: an email login reads as its first part. */
export function displayName(name: string | null | undefined): string {
    if (!name) return 'Someone';
    if (!name.includes('@')) return name;
    const local = name.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+$/, '').trim();
    return local.replace(/^dtlp/i, '').replace(/\b\w/g, c => c.toUpperCase()).trim() || name;
}

/** 12-hour clock: "3:05 pm", "12:30 am". */
export function clock12(d: Date): string {
    const h = d.getHours();
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${d.getMinutes().toString().padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

export function timeOnly(iso: string): string {
    return clock12(new Date(iso));
}

export function sameDay(a: string, b: string): boolean {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

/** "Today", "Yesterday", "Mon 24 Nov". */
export function dayLabel(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const year = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`;
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}${year}`;
}

export function isImageAttachment(mime?: string | null, filename?: string | null): boolean {
    const m = (mime || '').toLowerCase();
    if (m.startsWith('image/')) return true;
    if (m.includes('pdf')) return false;
    return /\.(jpe?g|png|webp|heic)$/i.test(filename || '');
}
