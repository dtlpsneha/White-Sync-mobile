import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Customer, Item, searchCustomers, searchItems } from '@/services/frappeSearch';
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
} from '@/services/dailySalesReportApi';

/**
 * Unlike the Daily Sales Report summary (anchored on "yesterday"), this
 * screen mirrors the "Sales Invoice History" tab of the ERPNext Client
 * Script, which anchors on "today" and offers all 12 months unbounded —
 * kept as a direct port of that verified logic, not a redesign.
 */
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function today() { return toIso(new Date()); }
function ddmm(iso: string) { const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}` : iso; }

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
 * The results dropdown is a plain absolutely-positioned View. It must live
 * OUTSIDE the FlatList's scrolling content (a fixed section above the list,
 * not inside ListHeaderComponent) — FlatList cells on Android each get their
 * own compositing layer, so a dropdown nested inside the header gets painted
 * UNDER the list items below it regardless of zIndex. A Modal would dodge
 * that, but opening a new native window mid-typing dismisses the keyboard on
 * Android, which is worse. As a plain sibling of the FlatList (not nested in
 * its virtualized content), ordinary zIndex stacking works correctly.
 */
function LinkSearchField({ placeholder, value, onSelect, onClear, search, colors, styles }: {
    placeholder: string;
    value: string;
    onSelect: (item: any) => void;
    onClear: () => void;
    search: (query: string) => Promise<{ ok: boolean; data: any[] }>;
    colors: any;
    styles: any;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!query.trim()) { setResults([]); return; }
        let cancelled = false;
        setLoading(true);
        const handle = setTimeout(async () => {
            const res = await search(query);
            if (!cancelled) { setResults(res.ok ? res.data : []); setLoading(false); }
        }, 300);
        return () => { cancelled = true; clearTimeout(handle); };
    }, [query]);

    if (value && !open) {
        return (
            <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.searchFieldValue, { color: colors.text }]} numberOfLines={1}>{value}</Text>
                <TouchableOpacity onPress={onClear}><Ionicons name="close-circle" size={16} color={colors.textSecondary} /></TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={[styles.searchField, { backgroundColor: colors.surface, borderColor: colors.border, zIndex: 20 }]}>
            <Ionicons name="search" size={14} color={colors.textSecondary} />
            <TextInput
                style={[styles.searchFieldInput, { color: colors.text }]}
                placeholder={placeholder}
                placeholderTextColor={colors.textSecondary}
                value={query}
                onChangeText={t => { setQuery(t); setOpen(true); }}
                onFocus={() => setOpen(true)}
            />
            {open && query.trim().length > 0 && (
                <View style={[styles.searchDropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {loading ? (
                        <ActivityIndicator size="small" color={NAVY} style={{ padding: 10 }} />
                    ) : results.length === 0 ? (
                        <Text style={{ padding: 10, color: colors.textSecondary, fontSize: 12 }}>No matches</Text>
                    ) : (
                        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {results.slice(0, 8).map((r, idx) => (
                                <TouchableOpacity
                                    key={r.name || idx}
                                    style={[styles.searchResultRow, { borderBottomColor: colors.border }]}
                                    onPress={() => { onSelect(r); setQuery(''); setOpen(false); }}
                                >
                                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                                        {r.customer_name || r.item_name || r.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
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

const InvoiceCard = React.memo(function InvoiceCard({ item, colors, styles }: { item: InvoiceHistoryRow; colors: any; styles: any }) {
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
                {item.date} · {brandLabel(item.brand)} · {item.customer}
            </Text>
            {!!item.description && <Text style={[styles.invoiceDesc, { color: colors.text }]} numberOfLines={2}>{item.description}</Text>}
            <View style={[styles.metricGrid, { borderTopColor: colors.border }]}>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Qty</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.qty)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Unit Price</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.unit_price)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Basic Value</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.total_value)}</Text></View>
            </View>
            <View style={styles.metricGridNoBorder}>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Invoice Total</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.invoice_total_value)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Profit</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.profit)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Margin %</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.margin)}</Text></View>
                <View><Text style={[styles.mLabel, { color: colors.textSecondary }]}>Discount %</Text><Text style={[styles.mValue, { color: colors.text }]}>{formatPlain(item.discount_percentage)}</Text></View>
            </View>
            <View style={styles.invoiceFoot}>
                <Ionicons name="person-circle-outline" size={13} color={colors.textSecondary} />
                <Text style={[styles.invoiceFootText, { color: colors.textSecondary }]}>{item.sales_executive || '—'}</Text>
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

    // How many rows are actually mounted right now — see the PAGE_SIZE note
    // above InvoiceCard. Reset to the first page whenever a new result set
    // comes in.
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    useEffect(() => { setVisibleCount(PAGE_SIZE); }, [history]);

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
    const onSelectDraftMonth = (m: string) => {
        const fy = findFy(fiscalYears, draftFiscalYear);
        const t = today();
        setDraftMonth(m);
        setDraftFromDate(monthStartDate(fy, m, t));
        setDraftToDate(monthEndDate(fy, m, t));
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
    const openMonthPicker = () => setPicker({ visible: true, title: 'Month', options: MONTHS.map(m => ({ label: m, value: m })), selectedValue: draftMonth, onSelect: onSelectDraftMonth });
    const openExecPicker = () => setPicker({ visible: true, title: 'Sales Executive', options: [{ label: 'All', value: '' }, ...executives.map(e => ({ label: e.name, value: e.id }))], selectedValue: draftSalesExecutive, onSelect: setDraftSalesExecutive });
    const openBrandPicker = () => setPicker({ visible: true, title: 'Brand', options: [{ label: 'All', value: '' }, ...brands.map(b => ({ label: brandLabel(b), value: b }))], selectedValue: draftBrand, onSelect: setDraftBrand });
    const openPaymentStatusPicker = () => setPicker({
        visible: true,
        title: 'Payment Status',
        options: [{ label: 'All', value: '' }, { label: 'Payment Pending', value: 'Payment Pending' }, { label: 'Payment Paid', value: 'Payment Paid' }],
        selectedValue: draftPaymentStatus,
        onSelect: setDraftPaymentStatus,
    });

    const execLabel = (id: string) => executives.find(e => e.id === id)?.name || 'All';
    const brandLabelFor = (b: string) => (b ? brandLabel(b) : 'All');
    const paymentStatusLabelFor = (p: string) => p || 'All';

    const rows = useMemo(() => history?.rows || [], [history]);

    // Derived from whatever page of rows the server actually returned (capped at 5000,
    // see `history.truncated`) — a client-side aggregate of already-fetched data, the
    // same pattern app/home.tsx uses for quote totals, not a second network call.
    const pendingSummary = useMemo(() => {
        let count = 0;
        let amount = 0;
        for (const row of rows) {
            if (row.payment_status === 'Payment Pending') {
                count += 1;
                amount += row.invoice_total_value;
            }
        }
        return { count, amount };
    }, [rows]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ backgroundColor: colors.surface }} edges={['top']}>
                <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.topbarTitle, { color: colors.text }]}>Sales Invoice History</Text>
                    <View style={{ width: 30 }} />
                </View>
            </SafeAreaView>

            {/*
              * Chips + search fields are pinned here, OUTSIDE the scrollable
              * list below — not just for the FlatList-vs-touch issue (fixed by
              * switching the list to a plain ScrollView), but because a
              * ScrollView also clips its own content to its scrollable
              * viewport bounds. Nesting the search field inside that
              * scrollable content clipped the dropdown as soon as it tried to
              * extend past the field's own layout box. As a sibling ABOVE the
              * scrollable list (not a descendant of it), the dropdown has no
              * scrolling ancestor to be clipped by.
              */}
            <View style={{ zIndex: 20, backgroundColor: colors.background }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={{ gap: 8, paddingRight: s(18) }}>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: NAVY }]} onPress={openFiltersSheet}><Text style={styles.chipTextActive}>FY {fiscalYear}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{month}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{ddmm(fromDate)} – {ddmm(toDate)}</Text></TouchableOpacity>
                    {ownExecutiveName ? (
                        <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{ownExecutiveName}</Text></View>
                    ) : (
                        <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{execLabel(salesExecutive)}</Text></TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}><Text style={[styles.chipText, { color: colors.textSecondary }]}>{brandLabelFor(brand)}</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: paymentStatus ? NAVY : colors.surfaceSecondary }]} onPress={openFiltersSheet}>
                        <Text style={paymentStatus ? styles.chipTextActive : [styles.chipText, { color: colors.textSecondary }]}>{paymentStatusLabelFor(paymentStatus)}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <View style={styles.searchGrid}>
                    <LinkSearchField placeholder="All Customers" value={customer?.customer_name || ''} onSelect={(c: Customer) => setCustomer(c)} onClear={() => setCustomer(null)} search={searchCustomers} colors={colors} styles={styles} />
                    <LinkSearchField placeholder="All Items" value={item?.item_name || ''} onSelect={(i: Item) => setItem(i)} onClear={() => setItem(null)} search={searchItems} colors={colors} styles={styles} />
                </View>
            </View>

            {/*
              * A plain ScrollView, not FlatList: FlatList cells on Android each
              * render in their own compositing layer, which was intercepting
              * swipe gestures meant for the dropdown above (swipes over it were
              * scrolling the list behind it instead, independent of the
              * clipping issue this second fix addresses).
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
            >
                <View style={styles.countRow}>
                    <Text style={[styles.countText, { color: colors.textSecondary }]}>Line Items</Text>
                    {history && <Text style={[styles.countNum, { color: NAVY }]}>{history.total_count}{history.truncated ? '+' : ''} rows</Text>}
                </View>

                {history && pendingSummary.count > 0 && (
                    <View style={[styles.pendingSummary, { backgroundColor: DANGER + '14', borderColor: DANGER + '30' }]}>
                        <Ionicons name="alert-circle-outline" size={15} color={DANGER} />
                        <Text style={{ color: DANGER, fontSize: 12, fontWeight: '700', flex: 1 }}>
                            {pendingSummary.count} pending · ₹{formatPlain(pendingSummary.amount)} outstanding
                            {history.truncated ? ' (of rows shown — narrow filters for the full total)' : ''}
                        </Text>
                    </View>
                )}

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
                        {rows.slice(0, visibleCount).map((row, idx) => <InvoiceCard key={`${row.invoice_no}-${idx}`} item={row} colors={colors} styles={styles} />)}
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
                            <FieldBlock label="Month" value={draftMonth} onPress={openMonthPicker} colors={colors} styles={styles} />
                            <FieldBlock label="From Date" value={draftFromDate} onPress={() => { setShowToPicker(false); setShowFromPicker(v => !v); }} colors={colors} styles={styles} />
                            <FieldBlock label="To Date" value={draftToDate} onPress={() => { setShowFromPicker(false); setShowToPicker(v => !v); }} colors={colors} styles={styles} />
                            {ownExecutiveName ? (
                                <View style={styles.fieldBlock}>
                                    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Sales Executive</Text>
                                    <View style={[styles.selectBox, { borderColor: colors.border }]}>
                                        <Text style={[styles.selectValue, { color: colors.text }]}>{ownExecutiveName}</Text>
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

        chipScroll: { marginTop: vs(16), paddingLeft: s(18) },
        chip: { paddingHorizontal: s(16), paddingVertical: vs(8), borderRadius: 999 },
        chipText: { fontSize: ms(12), fontWeight: '700' },
        chipTextActive: { fontSize: ms(12), fontWeight: '700', color: '#fff' },

        searchGrid: { flexDirection: 'row', gap: s(10), paddingHorizontal: s(18), marginTop: vs(14) },
        searchField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: ms(14), paddingHorizontal: s(12), paddingVertical: vs(10), position: 'relative' },
        searchFieldValue: { flex: 1, fontSize: ms(12.5), fontWeight: '600' },
        searchFieldInput: { flex: 1, fontSize: ms(12.5), fontWeight: '600' },
        searchDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, borderWidth: 1, borderRadius: ms(12), marginTop: 4, maxHeight: 220, overflow: 'hidden', zIndex: 30, elevation: 8 },
        searchResultRow: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },

        countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: s(18), marginTop: vs(18), marginBottom: vs(2) },
        countText: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
        countNum: { fontSize: ms(11), fontWeight: '800' },

        truncBanner: { marginHorizontal: s(18), marginTop: vs(10), padding: ms(12), borderRadius: ms(12) },
        pendingSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: s(18), marginTop: vs(10), padding: ms(12), borderRadius: ms(12), borderWidth: 1 },

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
