/**
 * What My Orders calls each status. SmartOps sends its own names ("Delivery Pending",
 * "Dispatched"); the app shows these instead:
 *
 *   delivery_pending  "Dispatched"  set by hand with the button on the invoice screen
 *   dispatched        "Delivered"   set when an LR copy is filed against the invoice
 */
import type { OrderStatus } from '@/services/teamApi';

const LABELS: Partial<Record<OrderStatus, string>> = {
    delivery_pending: 'Dispatched',
    dispatched: 'Delivered',
};

/** The app's name for a status, or the one SmartOps sent when the app has none of its own. */
export const orderLabel = (status: OrderStatus, fromServer: string) => LABELS[status] ?? fromServer;
