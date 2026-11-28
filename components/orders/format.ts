/** 2026-11-28 -> 28-11-2026; anything else -> "". */
export const dmy = (iso?: string | null) =>
    (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('-') : '');

/** Rupees, grouped the Indian way: ₹1,25,000.50. */
export const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
