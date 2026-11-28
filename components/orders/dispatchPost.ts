/**
 * Tells Team Chat that an invoice's goods have gone, after "Mark as Dispatched".
 *
 * The wording matters: SmartOps reads every post for a request. "dispatch", "despatch" or
 * "LR copy" anywhere in it would open a job asking somebody to send the goods again, so none
 * of those words is used. The first line is long on purpose, so that a customer's name falls
 * after the opening that SmartOps reads for who a post is for.
 */
import { inr } from '@/components/orders/format';
import { OrderRow, team } from '@/services/teamApi';

export const dispatchText = (row: OrderRow) => [
    'FYI - Goods sent out for the invoice below, no action needed.',
    `Invoice ${row.number}`,
    `Customer: ${row.customer_name || row.customer}`,
    `Amount: ${inr(row.amount)}`,
    row.po_no ? `Customer PO: ${row.po_no}` : '',
].filter(Boolean).join('\n');

/** Posts it and closes it (it informs, nobody has to do anything). False if it was not posted. */
export async function tellTeamDispatched(row: OrderRow): Promise<boolean> {
    try {
        const res = await team.post(dispatchText(row));
        if (!res.ok) return false;
        await team.done(res.data.job.id).catch(() => { }); // posted either way
        return true;
    } catch {
        return false;
    }
}

/**
 * Tells Team Chat that a dispatch was undone, so the earlier "Goods sent out" post is not
 * taken as true. Worded like the first post, and for the same reason: no "dispatch" word,
 * which SmartOps would read as a request to send the goods.
 */
export const undoText = (row: OrderRow) => [
    'FYI - Correction: the goods for the invoice below have not gone out yet. Please disregard the earlier message.',
    `Invoice ${row.number}`,
    `Customer: ${row.customer_name || row.customer}`,
    row.po_no ? `Customer PO: ${row.po_no}` : '',
].filter(Boolean).join('\n');

export async function tellTeamUndone(row: OrderRow): Promise<boolean> {
    try {
        const res = await team.post(undoText(row));
        if (!res.ok) return false;
        await team.done(res.data.job.id).catch(() => { });
        return true;
    } catch {
        return false;
    }
}
