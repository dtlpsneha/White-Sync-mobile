/**
 * My Orders status colours (Midnight x Ember): the coloured edge of a row, and the
 * text / wash of its status pill. Kept here, next to the screens that use them.
 */
import type { OrderStatus } from '@/services/teamApi';

type Tone = { edge: string; text: string; soft: string };

const TONES: Record<OrderStatus, Tone> = {
    so_pending: { edge: '#8C8173', text: '#7A6F62', soft: '#EFEBE5' },
    invoice_pending: { edge: '#D99A14', text: '#8A5A00', soft: '#FCEFD2' },
    invoice_generated: { edge: '#3E7CB1', text: '#2C5E8A', soft: '#E1ECF6' },
    delivery_pending: { edge: '#8E5BB5', text: '#6B3D8E', soft: '#EFE4F6' },
    dispatched: { edge: '#2F7D5B', text: '#2F7D5B', soft: '#DCEFE6' },
};

/** The tone for a status; on dark screens the pill is a wash of the edge colour instead. */
export function orderTone(status: OrderStatus, theme: 'light' | 'dark' = 'light'): Tone {
    const t = TONES[status] ?? TONES.so_pending;
    return theme === 'dark' ? { edge: t.edge, text: t.edge, soft: `${t.edge}2E` } : t;
}
