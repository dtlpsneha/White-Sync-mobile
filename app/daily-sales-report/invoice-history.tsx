import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { Customer, Item, getCustomersByNames, getItemsByCodes, searchCustomers, searchItems } from '@/services/frappeSearch';
import {
    FiscalYear,
    InvoiceHistory,
    InvoiceHistoryRow,
    SalesExecutive,
    brandLabel,
    getFiscalYears,
    getOwnRestrictedExecutiveName,
    getSalesExecutives,
    getSalesInvoiceHistory,
    getUsedBrands,
    getUsedCustomers,
    getUsedItems,
} from '@/services/dailySalesReportApi';

/**
 * Unlike the Daily Sales Report summary (anchored on "yesterday"), this
 * screen mirrors the "Sales Invoice History" tab of the ERPNext Client
 * Script, which anchors on "today" and offers all 12 months unbounded —
 * kept as a direct port of that verified logic, not a redesign.
 */
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function today() { return toIso(new Date()); }
function ddmm(iso: string) { const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}` : iso; }
/** ISO "YYYY-MM-DD" -> "DD-MM-YYYY" — matches the ERP dashboard's date column format. */
function ddmmyyyy(iso: string) { const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso; }

function monthFromDate(dateStr: string) {
    return CAL_MONTHS[new Date(`${dateStr}T00:00:00Z`).getUTCMonth()];
}
function findFy(list: FiscalYear[], name: string) {
    return list.find(f => f.name === name);
}
function findCurrentFy(list: FiscalYear[], anchor: string) {
    const anchorDate = new Date(`${anchor}T00:00:00Z`);
    return list.find(fy => new Date(`${fy.year_start_date}T00:00:00Z`) <= anchorDate);
}
function monthStartDate(fy: FiscalYear | undefined, month: string, cap: string): string {
    if (!fy) return cap;
    const fyStartYear = new Date(`${fy.year_start_date}T00:00:00Z`).getUTCFullYear();
    const calIdx = CAL_MONTHS.indexOf(month);
    if (calIdx === -1) return cap;
    const year = calIdx >= 3 ? fyStartYear : fyStartYear + 1;
    let target = new Date(Date.UTC(year, calIdx, 1));
    const capDate = new Date(`${cap}T00:00:00Z`);
    if (target > capDate) target = capDate;
    return toIso(target);
}
function monthEndDate(fy: FiscalYear | undefined, month: string, cap: string): string {
    if (!fy) return cap;
    const fyStartYear = new Date(`${fy.year_start_date}T00:00:00Z`).getUTCFullYear();
    const calIdx = CAL_MONTHS.indexOf(month);
    if (calIdx === -1) return cap;
    const year = calIdx >= 3 ? fyStartYear : fyStartYear + 1;
    const lastDay = new Date(Date.UTC(year, calIdx + 1, 0)).getUTCDate();
    let target = new Date(Date.UTC(year, calIdx, lastDay));
    const capDate = new Date(`${cap}T00:00:00Z`);
    if (target > capDate) target = capDate;
    return toIso(target);
}

function formatPlain(value: number | undefined) {
    return (value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const NAVY = '#0E1E3B';
const DANGER = '#DC3545';
const SUCCESS = '#16A34A';

type PickerOption = { label: string; value: string };
type PickerState = { visible: boolean; title: string; options: PickerOption[]; selectedValue: string; onSelect: (v: string) => void };
const EMPTY_PICKER: PickerState = { visible: false, title: '', options: [], selectedValue: '', onSelect: () => {} };

const FieldBlock = ({ label, value, onPress, colors, styles }: any) => (
    <TouchableOpacity style={styles.fieldBlock} onPress={onPress}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={[styles.selectBox, { borderColor: colors.border }]}>
            <Text style={[styles.selectValue, { color: colors.text }]}>{value}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.textSecondary} />
        </View>
    </TouchableOpacity>
);

/**
 * Reuses the existing Frappe link-field search (searchCustomers / searchItems)
 * — no new search logic, just a compact field+dropdown wrapper.
 *
 * Redesigned to match `components/CustomerSearch.tsx`'s proven approach: the
 * results panel is a normal, in-flow View directly below the field — NOT
 * absolutely positioned. An earlier version anchored the dropdown with
 * `position: 'absolute'` inside a header section pinned ABOVE a separately
 * scrolling invoice list, with its own zIndex/elevation stacking and a
 * tap-outside overlay to fight the resulting touch/scroll conflicts. That
 * still broke once the keyboard opened: Android resizes the whole window to
 * fit above the keyboard (`adjustResize`), and a pinned, non-scrolling
 * header doesn't shrink to follow — anything the absolute dropdown extended
 * past the new, shorter window edge became genuinely unreachable, not just
 * badly laid out. Putting this field inside the SAME ScrollView as the rest
 * of the page (see the screen body below) sidesteps the whole class of bug:
 * the page's own scroll reveals whatever the resized window doesn't fit,
 * exactly like it already does for `components/CustomerSearch.tsx` elsewhere
 * in this app.
 */
function LinkSearchField({ placeholder, value, onSelect, onClear, search, showCode, open, setOpen, colors, styles }: {
    placeholder: string;
    value: string;
    onSelect: (item: any) => void;
    onClear: () => void;
    search: (query: string) => Promise<{ ok: boolean; data: any[] }>;
    showCode?: boolean;
    open: boolean;
    setOpen: (v: boolean) => void;
    colors: any;
    styles: any;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryTick, setRetryTick] = useState(0);
    // Shows only the first 10 by default; "Show all N" reveals the rest.
    // Resets whenever the query changes so a new search starts collapsed.
    const [showAll, setShowAll] = useState(false);

    const updateOpen = setOpen;

    // Runs on focus too (not just while typing), with no debounce for the
    // blank-query case — matches the ERP dashboard, which shows the current
    // "used" list as soon as the field is tapped, before anything is typed.
    // Distinguishes a failed fetch from a genuinely empty result so "no
    // matches" and "couldn't load" aren't shown identically.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setShowAll(false);
        const handle = setTimeout(async () => {
            const res = await search(query);
            if (cancelled) return;
            if (res.ok) {
                setResults(res.data);
            } else {
                setResults([]);
                setError((res as any).error || 'Could not load');
            }
            setLoading(false);
        }, query.trim() ? 300 : 0);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [query, open, retryTick, search]);

    if (value && !open) {
        return (
            <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.searchFieldRow}>
                    <Text style={[styles.searchFieldValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
                    <TouchableOpacity onPress={onClear}><Ionicons name="close-circle" size={16} color={colors.textSecondary} /></TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.searchFieldRow}>
                <Ionicons name="search" size={14} color={colors.textSecondary} />
                <TextInput
                    style={[styles.searchFieldInput, { color: colors.text }]}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textSecondary}
                    value={query}
                    onChangeText={t => { setQuery(t); updateOpen(true); }}
                    onFocus={() => updateOpen(true)}
                />
                {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')}>
                        <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
                {/* Closes this field's own dropdown without touching the other field's —
                  * mirrors CustomerSearch.tsx, which has no open/close state at all
                  * beyond the query itself, but this field also shows a "used" list on
                  * an empty query (see the effect above), so it needs an explicit close. */}
                {open && (
                    <TouchableOpacity onPress={() => updateOpen(false)} hitSlop={8}>
                        <Ionicons name="chevron-up" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
            </View>
            {open && (
                <View style={[styles.searchDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {loading ? (
                        <ActivityIndicator size="small" color={NAVY} style={{ padding: 10 }} />
                    ) : error ? (
                        <TouchableOpacity style={{ padding: 10 }} onPress={() => setRetryTick(t => t + 1)}>
                            <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700' }}>{error} — tap to retry</Text>
                        </TouchableOpacity>
                    ) : results.length === 0 ? (
                        <Text style={{ padding: 10, color: colors.textSecondary, fontSize: 12 }}>
                            {query.trim() ? 'No matches' : 'No options for the current filters'}
                        </Text>
                    ) : (
                        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {(showAll ? results : results.slice(0, 10)).map((r, idx) => (
                                <TouchableOpacity
                                    key={r.name || idx}
                                    style={[styles.searchResultRow, { borderBottomColor: colors.border }]}
                                    onPress={() => { onSelect(r); setQuery(''); updateOpen(false); }}
                                >
                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                                        {r.customer_name || r.item_name || r.name}
                                    </Text>
                                    {showCode && !!r.item_name && (
                                        <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                                            {r.name}
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                            {!showAll && results.length > 10 && (
                                <TouchableOpacity style={{ padding: 10 }} onPress={() => setShowAll(true)}>
                                    <Text style={{ color: NAVY, fontSize: 12, fontWeight: '700' }}>
                                        Show all {results.length} results
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    )}
                </View>
            )}
        </View>
    );
}

/**
 * With a full fiscal year or a wide date range, the server can return
 * thousands of rows (backend cap is 5000 — see the "truncated" banner
 * below). Mounting that many heavy card views in one synchronous React
 * pass is what actually caused the lag: the JS thread blocks right when
 * the data arrives, so the screen looks frozen/stuck rather than the
 * network being slow. Rendering rows in capped batches — more revealed as
 * the user scrolls near the bottom — keeps each render pass small.
 */
const PAGE_SIZE = 30;

const MASK = '••••';

const InvoiceCard = React.memo(function InvoiceCard({ item, revealed, colors, styles }: { item: InvoiceHistoryRow; revealed: boolean; colors: any; styles: any }) {
    const paid = item.payment_status === 'Payment Paid';
    return (
        <View style={[styles.invoiceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.invoiceHead}>
                <Text style={[styles.invoiceNo, { color: colors.text }]} numberOfLines={1}>{item.invoice_no}</Text>
                <View style={[styles.statusPill, { backgroundColor: (paid ? SUCCESS : DANGER) + '1F' }]}>
                    <Text style={{ color: paid ? SUCCESS : DANGER, fontSize: 10.5, fontWeight: '800' }}>{item.payment_status}</Text>
                </View>
            </View>
            <Text style={[styles.invoiceSub, { color: colors.textSecondary }]}>
                {ddmmyyyy(item.date)} · {brandLabel(item.brand).toUpperCase()} · {item.customer}
            </Text>
            {!!item.description && <Text style={[styles.invoiceDesc, { color: colors.text }]} numberOfLines={2}>{item.description}</Text>}
            <View style={[styles.metricGrid, { borderTopColor: colors.border }]}>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Qty</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.qty)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Unit Price</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.unit_price)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Basic Value</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.total_value)}</Text></View>
            </View>
            <View style={styles.metricGridNoBorder}>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Invoice Total</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.invoice_total_value)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>LP26</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.list_price)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>DIS%</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.discount_percentage)}</Text></View>
            </View>
            <View style={styles.metricGridNoBorder}>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Profit</Text><Text style={[styles.mValue, { color: colors.text }]}>{revealed ? formatPlain(item.profit) : MASK}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Margin %</Text><Text style={[styles.mValue, { color: colors.text }]}>{revealed ? formatPlain(item.margin) : MASK}</Text></View>
            </View>
            <View style={styles.invoiceFoot}>
                <Ionicons name="person-circle-outline" size={13} color={colors.textSecondary} />
                <Text style={[styles.invoiceFootText, { color: colors.textSecondary }]}>{item.sales_executive ? item.sales_executive.toUpperCase() : '—'}</Text>
            </View>
        </View>
    );
});

export default function InvoiceHistoryScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = useMemo(() => getStyles({ s, vs, ms }), [s, vs, ms]);

    const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
    const [executives, setExecutives] = useState<SalesExecutive[]>([]);
    const [brands, setBrands] = useState<string[]>([]);
    const [ready, setReady] = useState(false);
    // Non-null only for the four restricted executives — their own name,
    // pre-filled and locked (see the real enforcement server-side).
    const [ownExecutiveName, setOwnExecutiveName] = useState<string | null>(null);

    const [fiscalYear, setFiscalYear] = useState('');
    const [month, setMonth] = useState('April');
    const [fromDate, setFromDate] = useState(today().slice(0, 8) + '01');
    const [toDate, setToDate] = useState(today());
    const [salesExecutive, setSalesExecutive] = useState('');
    const [brand, setBrand] = useState('');
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [item, setItem] = useState<Item | null>(null);
    const [paymentStatus, setPaymentStatus] = useState('');

    const [draftFiscalYear, setDraftFiscalYear] = useState('');
    const [draftMonth, setDraftMonth] = useState('April');
    const [draftFromDate, setDraftFromDate] = useState('');
    const [draftToDate, setDraftToDate] = useState('');
    const [draftSalesExecutive, setDraftSalesExecutive] = useState('');
    const [draftBrand, setDraftBrand] = useState('');
    const [draftPaymentStatus, setDraftPaymentStatus] = useState('');

    const [history, setHistory] = useState<InvoiceHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [picker, setPicker] = useState<PickerState>(EMPTY_PICKER);

    // Single toggle for the whole list — matches the ERP dashboard's header
    // eye icon, which reveals/hides Profit and Margin % for every row at
    // once rather than one at a time. LP26/DIS% are not masked.
    const [profitRevealed, setProfitRevealed] = useState(false);

    // How many rows are actually mounted right now — see the PAGE_SIZE note
    // above InvoiceCard. Reset to the first page whenever a new result set
    // comes in.
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [history]);

    // Narrows the Customer/Item search to names that actually appear in the
    // currently filtered invoices — mirrors the ERP dashboard's own
    // get_used_customers/get_used_items narrowing, so picking a customer or
    // item can't land on a selection with zero rows for these filters. null
    // means "not loaded yet" and leaves search unrestricted, same as ERP.
    const [validCustomerNames, setValidCustomerNames] = useState<string[] | null>(null);
    const [validItemCodes, setValidItemCodes] = useState<string[] | null>(null);
    useEffect(() => {
        if (!ready) return;
        (async () => {
            const [custRes, itemRes] = await Promise.all([
                getUsedCustomers({ brand, fromDate, toDate }),
                getUsedItems({ brand, fromDate, toDate }),
            ]);
            setValidCustomerNames(custRes.ok ? custRes.data : null);
            setValidItemCodes(itemRes.ok ? itemRes.data : null);
        })();
    }, [ready, brand, fromDate, toDate]);

    // Controlled (not local state inside LinkSearchField) only so the two fields can
    // be kept mutually exclusive below — opening one closes the other, since both now
    // render in-flow in the same page and having both open at once would just be two
    // stacked panels competing for attention.
    const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
    const [itemDropdownOpen, setItemDropdownOpen] = useState(false);

    // A blank query means the field was just tapped, not typed into — show
    // the "used" list right away (matching the ERP dashboard's on-focus
    // dropdown) instead of the empty result plain search returns for "".
    // While validCustomerNames/validItemCodes is still null (the background
    // getUsedCustomers/getUsedItems fetch hasn't resolved yet), report a
    // "still loading" failure rather than a false empty result — otherwise
    // tapping the field right as the screen opens (or right after changing
    // brand/date) permanently shows "no options" if that tap wins the race
    // against the fetch. Memoized with useCallback so LinkSearchField's own
    // effect can safely depend on `search` and re-run once the real list
    // arrives, instead of only re-fetching on the next keystroke.
    const customerSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            if (validCustomerNames === null) return { ok: false as const, error: 'Still loading', data: [] };
            if (!validCustomerNames.length) return { ok: true as const, data: [] };
            return await getCustomersByNames(validCustomerNames);
        }
        const res = await searchCustomers(query);
        if (!res.ok || validCustomerNames === null) return res;
        return { ok: true as const, data: res.data.filter(c => validCustomerNames.includes(c.name)) };
    }, [validCustomerNames]);

    const itemSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            if (validItemCodes === null) return { ok: false as const, error: 'Still loading', data: [] };
            if (!validItemCodes.length) return { ok: true as const, data: [] };
            return await getItemsByCodes(validItemCodes);
        }
        const res = await searchItems(query);
        if (!res.ok || validItemCodes === null) return res;
        return { ok: true as const, data: res.data.filter(i => validItemCodes.includes(i.name)) };
    }, [validItemCodes]);

    useEffect(() => {
        (async () => {
            const [fyRes, execRes, brandRes, ownName] = await Promise.all([getFiscalYears(), getSalesExecutives(), getUsedBrands(), getOwnRestrictedExecutiveName()]);
            const list = fyRes.ok ? fyRes.data : [];
            const execList = execRes.ok ? execRes.data : [];
            setFiscalYears(list);
            setExecutives(execList);
            if (brandRes.ok) setBrands(brandRes.data);

            const t = today();
            const currentFy = findCurrentFy(list, t) || list[0];
            setFiscalYear(currentFy?.name || '');
            setMonth(monthFromDate(t));
            setFromDate(t.slice(0, 8) + '01');
            setToDate(t);

            if (ownName) {
                setOwnExecutiveName(ownName);
                const ownId = execList.find(e => e.name === ownName)?.id || '';
                setSalesExecutive(ownId);
                setDraftSalesExecutive(ownId);
            }

            setReady(true);
        })();
    }, []);

    useEffect(() => {
        if (!ready) return;
        fetchHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, fiscalYear, month, fromDate, toDate, salesExecutive, brand, customer, item, paymentStatus]);

    // Guards against out-of-order responses: if filters change again before an
    // in-flight request resolves, its response is discarded rather than
    // overwriting the newer, correct one when it arrives later.
    const requestIdRef = useRef(0);

    const fetchHistory = async (isRefresh = false) => {
        const requestId = ++requestIdRef.current;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setFetchError(null);
        const res = await getSalesInvoiceHistory({
            fiscalYear, month, fromDate, toDate, salesExecutive, brand,
            customer: customer?.name, item: item?.name, paymentStatus,
        });
        if (requestId !== requestIdRef.current) return;
        // On failure, clear the stale list rather than leaving the previous
        // filter's rows on screen looking as if the new filter had applied.
        if (res.ok) {
            setHistory(res.data);
        } else {
            setHistory(null);
            setFetchError(res.error || 'Could not load invoice history.');
        }
        setLoading(false);
        setRefreshing(false);
    };

    const openFiltersSheet = () => {
        setDraftFiscalYear(fiscalYear);
        setDraftMonth(month);
        setDraftFromDate(fromDate);
        setDraftToDate(toDate);
        setDraftSalesExecutive(salesExecutive);
        setDraftBrand(brand);
        setDraftPaymentStatus(paymentStatus);
        setShowFromPicker(false);
        setShowToPicker(false);
        setFiltersSheetVisible(true);
    };
    const closeFiltersSheet = () => { setShowFromPicker(false); setShowToPicker(false); setFiltersSheetVisible(false); };
    const applyFilters = () => {
        setFiscalYear(draftFiscalYear);
        setMonth(draftMonth);
        setFromDate(draftFromDate);
        setToDate(draftToDate);
        setSalesExecutive(draftSalesExecutive);
        setBrand(draftBrand);
        setPaymentStatus(draftPaymentStatus);
        setShowFromPicker(false);
        setShowToPicker(false);
        setFiltersSheetVisible(false);
    };

    const onSelectDraftFy = (fyName: string) => {
        const fy = findFy(fiscalYears, fyName);
        const t = today();
        setDraftFiscalYear(fyName);
        setDraftFromDate(monthStartDate(fy, draftMonth, t));
        setDraftToDate(monthEndDate(fy, draftMonth, t));
    };
    const applyFromDate = (selected: Date) => setDraftFromDate(toIso(selected));
    const applyToDate = (selected: Date) => {
        const t = today();
        let iso = toIso(selected);
        if (iso > t) iso = t;
        setDraftToDate(iso);
        setDraftMonth(monthFromDate(iso));
    };

    // A separate native Dialog for the date picker — whether the JSX
    // <DateTimePicker display="default"> or the imperative
    // DateTimePickerAndroid.open() — conflicts with the Filters sheet's own
    // Modal on Android: the first crashed the app outright, the second left
    // the sheet's Modal unable to reopen (both symptoms of two native
    // dialog windows fighting over the same Activity). Rendering the picker
    // INLINE (embedded content, not a dialog) inside the sheet avoids a
    // second native window entirely — there's only ever the one Modal.
    const onChangeDraftFromDate = (_e: any, selected?: Date) => {
        if (selected) applyFromDate(selected);
        if (Platform.OS !== 'ios') setShowFromPicker(false);
    };
    const onChangeDraftToDate = (_e: any, selected?: Date) => {
        if (selected) applyToDate(selected);
        if (Platform.OS !== 'ios') setShowToPicker(false);
    };

    const openFyPicker = () => setPicker({ visible: true, title: 'Fiscal Year', options: fiscalYears.map(fy => ({ label: fy.name, value: fy.name })), selectedValue: draftFiscalYear, onSelect: onSelectDraftFy });
    const openExecPicker = () => setPicker({ visible: true, title: 'Sales Executive', options: [{ label: 'All', value: '' }, ...executives.map(e => ({ label: e.name.toUpperCase(), value: e.id }))], selectedValue: draftSalesExecutive, onSelect: setDraftSalesExecutive });
    const openBrandPicker = () => setPicker({ visible: true, title: 'Brand', options: [{ label: 'All', value: '' }, ...brands.map(b => ({ label: brandLabel(b).toUpperCase(), value: b }))], selectedValue: draftBrand, onSelect: setDraftBrand });
    const openPaymentStatusPicker = () => setPicker({ visible: true, title: 'Payment Status', options: [{ label: 'All', value: '' }, { label: 'Payment Paid', value: 'Payment Paid' }, { label: 'Payment Pending', value: 'Payment Pending' }], selectedValue: draftPaymentStatus, onSelect: setDraftPaymentStatus });

    // Display only — matches the ERP dashboard's uppercase Sales Executive
    // rendering. The underlying id/name used for filtering is untouched.
    const execLabel = (id: string) => (executives.find(e => e.id === id)?.name || 'All').toUpperCase();
    const brandLabelFor = (b: string) => (b ? brandLabel(b).toUpperCase() : 'All');
    const paymentStatusLabelFor = (p: string) => (p ? p : 'All');

    const rows = useMemo(() => history?.rows || [], [history]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ backgroundColor: colors.surface }} edges={['top']}>
                <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.topbarTitle, { color: colors.text }]}>Sales Invoice History</Text>
                    <TouchableOpacity
                        style={{ width: 30, alignItems: 'flex-end' }}
                        onPress={() => setProfitRevealed(v => !v)}
                        accessibilityLabel={profitRevealed ? 'Hide Profit & Margin %' : 'Show Profit & Margin %'}
                    >
                        <Ionicons name={profitRevealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text} />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>

            {/*
              * Filters, chips, and search fields now live INSIDE this same
              * ScrollView, as ordinary in-flow content — not pinned above it in a
              * separate non-scrolling section. See the note on LinkSearchField
              * above for why: a pinned header can't shrink when the keyboard
              * opens and resizes the window, so anything a dropdown grew past
              * the new edge became unreachable. Being part of the normal page
              * flow means the page's own scroll (and the OS's keyboard-resize
              * handling) reveals it instead, the same way it already works for
              * `components/CustomerSearch.tsx` elsewhere in this app.
              */}
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchHistory(true)} tintColor={colors.text} />}
                onScroll={({ nativeEvent }) => {
                    const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
                    const nearBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 400;
                    if (nearBottom) setVisibleCount(c => Math.min(c + PAGE_SIZE, rows.length));
                }}
                scrollEventThrottle={200}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.filtersRow}>
                    <TouchableOpacity style={[styles.filtersBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={openFiltersSheet}>
                        <Ionicons name="options-outline" size={15} color={colors.text} />
                        <Text style={[styles.filtersBtnText, { color: colors.text }]}>Filters</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={{ gap: 8, paddingRight: s(18) }}>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: NAVY }]} onPress={openFiltersSheet}><Text style={styles.chipTextActive}>FY {fiscalYear}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{ddmm(fromDate)} – {ddmm(toDate)}</Text></TouchableOpacity>
                    {ownExecutiveName ? (
                        <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{ownExecutiveName.toUpperCase()}</Text></View>
                    ) : (
                        <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{execLabel(salesExecutive)}</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{brandLabelFor(brand)}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: paymentStatus ? NAVY : colors.surfaceSecondary }]} onPress={openFiltersSheet}>
                        <Text style={paymentStatus ? styles.chipTextActive : [styles.chipText, { color: colors.textSecondary }]}>{paymentStatusLabelFor(paymentStatus)}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.searchGrid}>
                    <LinkSearchField
                        placeholder="All Customers"
                        value={customer?.customer_name || ''}
                        onSelect={(c: Customer) => setCustomer(c)}
                        onClear={() => setCustomer(null)}
                        search={customerSearch}
                        open={customerDropdownOpen}
                        setOpen={(v) => { setCustomerDropdownOpen(v); if (v) setItemDropdownOpen(false); }}
                        colors={colors}
                        styles={styles}
                    />
                    <LinkSearchField
                        placeholder="All Items"
                        value={item?.item_name || ''}
                        onSelect={(i: Item) => setItem(i)}
                        onClear={() => setItem(null)}
                        search={itemSearch}
                        showCode
                        open={itemDropdownOpen}
                        setOpen={(v) => { setItemDropdownOpen(v); if (v) setCustomerDropdownOpen(false); }}
                        colors={colors}
                        styles={styles}
                    />
                </View>

                <View style={styles.countRow}>
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>Line Items</Text>
                    {history && <Text style={[styles.countNum, { color: NAVY }]}>{history.total_count}{history.truncated ? '+' : ''} rows</Text>}
                </View>

                {history?.truncated && (
                    <View style={[styles.truncBanner, { backgroundColor: DANGER + '18' }]}>
                        <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700' }}>
                            Showing the first {history.total_count} rows — narrow the date range or filters to see the rest.
                        </Text>
                    </View>
                )}

                {loading && !history ? (
                    <ActivityIndicator size="large" color={NAVY} style={{ marginTop: 30, marginBottom: 10 }} />
                ) : fetchError ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{fetchError}</Text>
                        <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary, marginTop: 12 }]} onPress={() => fetchHistory()}>
                            <Text style={[styles.chipText, { color: colors.textSecondary }]}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : rows.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="receipt-outline" size={40} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No invoices found for these filters</Text>
                    </View>
                ) : (
                    <>
                        {rows.slice(0, visibleCount).map((row, idx) => <InvoiceCard key={`${row.invoice_no}-${idx}`} item={row} revealed={profitRevealed} colors={colors} styles={styles} />)}
                        {visibleCount < rows.length && (
                            <ActivityIndicator size="small" color={NAVY} style={{ marginTop: vs(16) }} />
                        )}
                    </>
                )}
            </ScrollView>

            <Modal visible={filtersSheetVisible} transparent animationType="slide" onRequestClose={closeFiltersSheet}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeFiltersSheet}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(10,15,25,0.55)' }} />
                    </Pressable>
                    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
                        <View style={[styles.handle, { backgroundColor: colors.border }]} />
                        <View style={styles.sheetHead}>
                            <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
                            <TouchableOpacity onPress={closeFiltersSheet}><Ionicons name="close" size={22} color={colors.textSecondary} /></TouchableOpacity>
                        </View>
                        <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.fieldGrid}>
                            <FieldBlock label="Fiscal Year" value={draftFiscalYear || '—'} onPress={openFyPicker} colors={colors} styles={styles} />
                            <FieldBlock label="From Date" value={draftFromDate} onPress={() => { setShowToPicker(false); setShowFromPicker(v => !v); }} colors={colors} styles={styles} />
                            <FieldBlock label="To Date" value={draftToDate} onPress={() => { setShowFromPicker(false); setShowToPicker(v => !v); }} colors={colors} styles={styles} />
                            {ownExecutiveName ? (
                                <View style={styles.fieldBlock}>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Sales Executive</Text>
                                    <View style={[styles.selectBox, { borderColor: colors.border }]}>
                                        <Text style={[styles.selectValue, { color: colors.text }]}>{ownExecutiveName.toUpperCase()}</Text>
                                        <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                                    </View>
                                </View>
                            ) : (
                                <FieldBlock label="Sales Executive" value={execLabel(draftSalesExecutive)} onPress={openExecPicker} colors={colors} styles={styles} />
                            )}
                            <FieldBlock label="Brand" value={brandLabelFor(draftBrand)} onPress={openBrandPicker} colors={colors} styles={styles} />
                            <FieldBlock label="Payment Status" value={paymentStatusLabelFor(draftPaymentStatus)} onPress={openPaymentStatusPicker} colors={colors} styles={styles} />
                        </View>

                        {/*
                          * Inline (embedded, non-dialog) picker — see the note
                          * above onChangeDraftFromDate for why this replaced a
                          * separate native Dialog.
                          */}
                        {showFromPicker && (
                            <DateTimePicker
                                value={new Date(`${draftFromDate}T00:00:00`)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                                maximumDate={new Date(`${today()}T00:00:00`)}
                                onChange={onChangeDraftFromDate}
                                style={{ alignSelf: 'center', marginBottom: 14 }}
                            />
                        )}
                        {showToPicker && (
                            <DateTimePicker
                                value={new Date(`${draftToDate}T00:00:00`)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                                maximumDate={new Date(`${today()}T00:00:00`)}
                                onChange={onChangeDraftToDate}
                                style={{ alignSelf: 'center', marginBottom: 14 }}
                            />
                        )}

                        <TouchableOpacity style={[styles.applyBtn, { backgroundColor: NAVY }]} onPress={applyFilters}>
                            <Text style={styles.applyBtnText}>APPLY FILTERS</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={picker.visible} transparent animationType="fade" onRequestClose={() => setPicker(p => ({ ...p, visible: false }))}>
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }} onPress={() => setPicker(p => ({ ...p, visible: false }))}>
                    <View style={{ width: '100%', maxHeight: '70%', backgroundColor: colors.background, borderRadius: 24, padding: 24, gap: 16 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{picker.title}</Text>
                            <TouchableOpacity onPress={() => setPicker(p => ({ ...p, visible: false }))}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ gap: 8 }}>
                            {picker.options.map(option => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={{ padding: 16, borderRadius: 12, backgroundColor: picker.selectedValue === option.value ? colors.surfaceSecondary : 'transparent', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                                    onPress={() => { picker.onSelect(option.value); setPicker(p => ({ ...p, visible: false })); }}
                                >
                                    <Text style={{ fontSize: 15, fontWeight: '600', color: picker.selectedValue === option.value ? NAVY : colors.text }}>{option.label}</Text>
                                    {picker.selectedValue === option.value && <Ionicons name="checkmark-circle" size={20} color={NAVY} />}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

function getStyles({ s, vs, ms }: { s: (n: number) => number; vs: (n: number) => number; ms: (n: number) => number }) {
    return StyleSheet.create({
        container: { flex: 1 },
        topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingVertical: vs(14), borderBottomWidth: 1 },
        backBtn: { width: 30, height: 30, justifyContent: 'center' },
        topbarTitle: { fontSize: ms(15.5), fontWeight: '800' },

        scrollContent: { paddingBottom: vs(40) },

        filtersRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: s(18), paddingTop: vs(16) },
        filtersBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: ms(12), paddingVertical: vs(9), paddingHorizontal: s(14) },
        filtersBtnText: { fontSize: ms(13), fontWeight: '700' },

        chipScroll: { marginTop: vs(10), paddingLeft: s(18) },
        chip: { paddingHorizontal: s(16), paddingVertical: vs(8), borderRadius: 999 },
        chipText: { fontSize: ms(12), fontWeight: '700' },
        chipTextActive: { fontSize: ms(12), fontWeight: '700', color: '#fff' },

        // Stacked, not side-by-side — two fields in a row meant whichever one's
        // dropdown was open (taller) left a dead gap next to the other (short) one,
        // and customer names wrapped to 2-3 lines in the half-width column. Full width
        // each, matching the single-field layout `components/CustomerSearch.tsx` uses.
        searchGrid: { gap: s(10), paddingHorizontal: s(18), marginTop: vs(14) },
        searchField: { flex: 1, borderWidth: 1, borderRadius: ms(14), paddingHorizontal: s(12), paddingVertical: vs(10) },
        searchFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        searchFieldValue: { flex: 1, fontSize: ms(12.5), fontWeight: '600' },
        searchFieldInput: { flex: 1, fontSize: ms(12.5), fontWeight: '600' },
        // In-flow now, not absolutely positioned — see the note on LinkSearchField.
        // The divider line above it (not a full box border) is what visually
        // separates it from the input row while staying part of the same card.
        searchDropdown: { borderTopWidth: 1, marginTop: vs(10), paddingTop: vs(6) },
        searchResultRow: { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth },

        countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: s(18), marginTop: vs(18), marginBottom: vs(2) },
        countText: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
        countNum: { fontSize: ms(11), fontWeight: '800' },

        truncBanner: { marginHorizontal: s(18), marginTop: vs(10), padding: ms(12), borderRadius: ms(12) },

        emptyState: { alignItems: 'center', paddingVertical: vs(60), gap: 12 },
        emptyText: { fontSize: ms(13), fontWeight: '600' },

        invoiceCard: { borderWidth: 1, borderRadius: ms(18), padding: ms(16), marginHorizontal: s(18), marginTop: vs(12) },
        invoiceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
        invoiceNo: { fontSize: ms(14.5), fontWeight: '800', flex: 1 },
        statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
        invoiceSub: { fontSize: ms(11.5), fontWeight: '600', marginTop: vs(5), lineHeight: ms(16) },
        invoiceDesc: { fontSize: ms(12.5), marginTop: vs(7), lineHeight: 18 },
        metricGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: vs(12), paddingTop: vs(12), borderTopWidth: 1 },
        metricGridNoBorder: { flexDirection: 'row', justifyContent: 'space-between', marginTop: vs(10) },
        mLabel: { fontSize: ms(9), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
        mValue: { fontSize: ms(12.5), fontWeight: '800', marginTop: 3 },
        invoiceFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: vs(12) },
        invoiceFootText: { fontSize: ms(11.5), fontWeight: '600' },

        sheet: { borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: s(22), paddingTop: vs(10), paddingBottom: vs(28) },
        handle: { width: 40, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: vs(18) },
        sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(16) },
        sheetTitle: { fontSize: ms(20), fontWeight: '800' },
        sheetDivider: { height: 1, marginHorizontal: -22, marginBottom: vs(18) },

        fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: s(14), marginBottom: vs(4) },
        fieldBlock: { flexBasis: '45%', flexGrow: 1, gap: 8, marginBottom: vs(14) },
        fieldLabel: { fontSize: ms(10.5), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
        selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: ms(12), paddingVertical: vs(11), paddingHorizontal: s(13) },
        selectValue: { fontSize: ms(13.5), fontWeight: '600' },

        applyBtn: { borderRadius: ms(14), paddingVertical: vs(16), alignItems: 'center', marginTop: vs(6) },
        applyBtnText: { color: '#fff', fontSize: ms(14.5), fontWeight: '800', letterSpacing: 0.4 },
    });
}
