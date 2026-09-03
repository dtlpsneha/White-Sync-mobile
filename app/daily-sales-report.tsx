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
import {
    DailySummary,
    DailySummaryRow,
    FiscalYear,
    SalesExecutive,
    brandLabel,
    getDailySummary,
    getFiscalYears,
    getOwnRestrictedExecutiveName,
    getSalesExecutives,
    sortSummaryRows,
} from '@/services/dailySalesReportApi';

/**
 * FY -> bounded Month options -> Date sync rules are a direct carry-over
 * from the previous build of this screen (verified against the real ERPNext
 * "Daily Sales Report" Client Script) — this rewrite only restyles the UI,
 * it does not change this logic.
 */
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toIso(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return toIso(d); }
function ddmmyy(iso: string) { const p = iso.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso; }

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
function monthOptionsForFy(fy: FiscalYear | undefined, anchor: string): string[] {
    if (!fy) return MONTHS;
    const anchorDate = new Date(`${anchor}T00:00:00Z`);
    const start = new Date(`${fy.year_start_date}T00:00:00Z`);
    const end = new Date(`${fy.year_end_date}T00:00:00Z`);
    if (!(start <= anchorDate && anchorDate <= end)) return MONTHS;
    const anchorCalIdx = anchorDate.getUTCMonth();
    const maxFyIdx = anchorCalIdx >= 3 ? anchorCalIdx - 3 : anchorCalIdx + 9;
    return MONTHS.slice(0, maxFyIdx + 1);
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

type DisplayUnit = 'absolute' | 'lacs';
const DISPLAY_LABELS: Record<DisplayUnit, string> = { absolute: 'Absolute', lacs: 'Lacs' };

function formatAmount(value: number | undefined, display: DisplayUnit) {
    const divisor = display === 'lacs' ? 100000 : 1;
    const n = (value || 0) / divisor;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Brand-specific navy/red accent palette from the approved design canvas — kept constant across themes (a brand accent, not a neutral), while surfaces/text still follow the app's real light/dark tokens. */
const NAVY = '#0E1E3B';
const DANGER = '#DC3545';

type PickerOption = { label: string; value: string };
type PickerState = { visible: boolean; title: string; options: PickerOption[]; selectedValue: string; onSelect: (v: string) => void };
const EMPTY_PICKER: PickerState = { visible: false, title: '', options: [], selectedValue: '', onSelect: () => {} };

const FieldBlock = ({ label, value, onPress, icon, full, colors, styles }: any) => (
    <TouchableOpacity style={full ? styles.fieldBlockFull : styles.fieldBlock} onPress={onPress}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={[styles.selectBox, { borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {icon && <Ionicons name={icon} size={15} color={colors.textSecondary} />}
                <Text style={[styles.selectValue, { color: colors.text }]}>{value}</Text>
            </View>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </View>
    </TouchableOpacity>
);

export default function DailySalesReportScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = useMemo(() => getStyles({ s, vs, ms }), [s, vs, ms]);

    const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
    const [executives, setExecutives] = useState<SalesExecutive[]>([]);
    const [ready, setReady] = useState(false);
    // Non-null only for the four restricted executives — their own name,
    // pre-filled and locked (see the real enforcement server-side).
    const [ownExecutiveName, setOwnExecutiveName] = useState<string | null>(null);

    // Committed filters — drive the actual fetch.
    const [fiscalYear, setFiscalYear] = useState('');
    const [monthOptions, setMonthOptions] = useState<string[]>(MONTHS);
    const [month, setMonth] = useState('April');
    const [date, setDate] = useState(yesterday());
    const [salesExecutive, setSalesExecutive] = useState('');
    const [display, setDisplay] = useState<DisplayUnit>('lacs');

    // Draft filters — edited inside the sheet, only committed on "Apply Filters".
    const [draftFiscalYear, setDraftFiscalYear] = useState('');
    const [draftMonthOptions, setDraftMonthOptions] = useState<string[]>(MONTHS);
    const [draftMonth, setDraftMonth] = useState('April');
    const [draftDate, setDraftDate] = useState(yesterday());
    const [draftSalesExecutive, setDraftSalesExecutive] = useState('');
    const [draftDisplay, setDraftDisplay] = useState<DisplayUnit>('lacs');

    const [summary, setSummary] = useState<DailySummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const [searchQuery, setSearchQuery] = useState('');
    const [sortMode, setSortMode] = useState<'alpha' | 'pending'>('alpha');

    const [filtersSheetVisible, setFiltersSheetVisible] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [picker, setPicker] = useState<PickerState>(EMPTY_PICKER);

    useEffect(() => {
        (async () => {
            const [fyRes, execRes, ownName] = await Promise.all([getFiscalYears(), getSalesExecutives(), getOwnRestrictedExecutiveName()]);
            const list = fyRes.ok ? fyRes.data : [];
            const execList = execRes.ok ? execRes.data : [];
            setFiscalYears(list);
            setExecutives(execList);

            const y = yesterday();
            const currentFy = findCurrentFy(list, y) || list[0];
            const opts = monthOptionsForFy(currentFy, y);
            const defaultMonth = opts.includes(monthFromDate(y)) ? monthFromDate(y) : (opts[opts.length - 1] || 'April');
            setFiscalYear(currentFy?.name || '');
            setMonthOptions(opts);
            setMonth(defaultMonth);
            setDate(y);

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
        fetchSummary();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, fiscalYear, month, date, salesExecutive]);

    // Guards against out-of-order responses: if filters change again before an
    // in-flight request resolves, its response is discarded rather than
    // overwriting the newer, correct one when it arrives later.
    const requestIdRef = useRef(0);

    const fetchSummary = async (isRefresh = false) => {
        const requestId = ++requestIdRef.current;
        if (isRefresh) setRefreshing(true); else setLoading(true);
        setFetchError(null);
        const res = await getDailySummary({ fiscalYear, month, date, salesExecutive });
        if (requestId !== requestIdRef.current) return;
        // On failure, clear the stale summary rather than leaving the previous
        // filter's data on screen looking as if the new filter had applied.
        if (res.ok) {
            setSummary(res.data);
        } else {
            setSummary(null);
            setFetchError(res.error || 'Could not load report data.');
        }
        setLoading(false);
        setRefreshing(false);
    };

    const openFiltersSheet = () => {
        setDraftFiscalYear(fiscalYear);
        setDraftMonthOptions(monthOptions);
        setDraftMonth(month);
        setDraftDate(date);
        setDraftSalesExecutive(salesExecutive);
        setDraftDisplay(display);
        setShowDatePicker(false);
        setFiltersSheetVisible(true);
    };
    const closeFiltersSheet = () => { setShowDatePicker(false); setFiltersSheetVisible(false); };
    const applyFilters = () => {
        setFiscalYear(draftFiscalYear);
        setMonthOptions(draftMonthOptions);
        setMonth(draftMonth);
        setDate(draftDate);
        setSalesExecutive(draftSalesExecutive);
        setDisplay(draftDisplay);
        setShowDatePicker(false);
        setFiltersSheetVisible(false);
    };

    const onSelectDraftFy = (fyName: string) => {
        const fy = findFy(fiscalYears, fyName);
        const y = yesterday();
        const opts = monthOptionsForFy(fy, y);
        const m = opts.includes('April') ? 'April' : (opts[0] || 'April');
        setDraftFiscalYear(fyName);
        setDraftMonthOptions(opts);
        setDraftMonth(m);
        setDraftDate(monthEndDate(fy, m, y));
    };
    const onSelectDraftMonth = (m: string) => {
        const fy = findFy(fiscalYears, draftFiscalYear);
        setDraftMonth(m);
        setDraftDate(monthEndDate(fy, m, yesterday()));
    };
    const applyDraftDate = (selected: Date) => {
        const y = yesterday();
        let iso = toIso(selected);
        if (iso > y) iso = y;
        setDraftDate(iso);
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
    const onChangeDraftDate = (_event: any, selected?: Date) => {
        if (selected) applyDraftDate(selected);
        if (Platform.OS !== 'ios') setShowDatePicker(false);
    };

    const openFyPicker = () => setPicker({
        visible: true, title: 'Fiscal Year',
        options: fiscalYears.map(fy => ({ label: fy.name, value: fy.name })),
        selectedValue: draftFiscalYear, onSelect: onSelectDraftFy,
    });
    const openMonthPicker = () => setPicker({
        visible: true, title: 'Month',
        options: draftMonthOptions.map(m => ({ label: m, value: m })),
        selectedValue: draftMonth, onSelect: onSelectDraftMonth,
    });
    const openExecPicker = () => setPicker({
        visible: true, title: 'Sales Executive',
        options: [{ label: 'All Executives', value: '' }, ...executives.map(e => ({ label: e.name, value: e.id }))],
        selectedValue: draftSalesExecutive, onSelect: setDraftSalesExecutive,
    });

    const execLabel = (id: string) => executives.find(e => e.id === id)?.name || 'All Executives';

    const goToBrand = (row: DailySummaryRow) => {
        router.push({
            pathname: '/daily-sales-report/[brand]',
            params: { brand: row.brand, fiscalYear, month, date, salesExecutive, display },
        });
    };

    const rows = useMemo(() => {
        if (!summary) return [];
        let list = sortSummaryRows(summary.rows);
        if (sortMode === 'pending') list = [...list].sort((a, b) => b.payment_pending - a.payment_pending);
        const q = searchQuery.trim().toLowerCase();
        if (q) list = list.filter(r => brandLabel(r.brand).toLowerCase().includes(q));
        return list;
    }, [summary, sortMode, searchQuery]);

    const totals = summary?.totals;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ backgroundColor: colors.surface }} edges={['top']}>
                <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.topbarTitle, { color: colors.text }]}>Daily Sales Report</Text>
                    <View style={{ width: 30 }} />
                </View>
            </SafeAreaView>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchSummary(true)} tintColor={colors.text} />}
            >
                <View style={styles.dateRow}>
                    <View>
                        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>Date</Text>
                        <Text style={[styles.dateValue, { color: colors.text }]}>{ddmmyy(date)}</Text>
                    </View>
                    <TouchableOpacity style={[styles.filtersBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={openFiltersSheet}>
                        <Ionicons name="options-outline" size={15} color={colors.text} />
                        <Text style={[styles.filtersBtnText, { color: colors.text }]}>Filters</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={{ gap: 8, paddingRight: s(18) }}>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: NAVY }]} onPress={openFiltersSheet}>
                        <Text style={styles.chipTextActive}>FY {fiscalYear}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}>
                        <Text style={[styles.chipText, { color: colors.textSecondary }]}>{month}</Text>
                    </TouchableOpacity>
                    {ownExecutiveName ? (
                        <View style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]}>
                            <Text style={[styles.chipText, { color: colors.textSecondary }]}>{ownExecutiveName}</Text>
                        </View>
                    ) : (
                        <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}>
                            <Text style={[styles.chipText, { color: colors.textSecondary }]}>{execLabel(salesExecutive)}</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.chip, { backgroundColor: colors.surfaceSecondary }]} onPress={openFiltersSheet}>
                        <Text style={[styles.chipText, { color: colors.textSecondary }]}>{DISPLAY_LABELS[display]}</Text>
                    </TouchableOpacity>
                </ScrollView>

                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Executive Summary</Text>

                {loading && !summary ? (
                    <ActivityIndicator size="large" color={NAVY} style={{ marginTop: 40 }} />
                ) : fetchError ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
                        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{fetchError}</Text>
                        <TouchableOpacity style={[styles.filtersBtn, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 12 }]} onPress={() => fetchSummary()}>
                            <Ionicons name="refresh" size={15} color={colors.text} />
                            <Text style={[styles.filtersBtnText, { color: colors.text }]}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        <View style={styles.summaryGrid}>
                            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <View style={[styles.badgeSquare, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="trending-up-outline" size={17} color={colors.text} />
                                </View>
                                <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(totals?.sales_fytd, display)}</Text>
                                <Text style={[styles.summaryCaption, { color: colors.textSecondary }]}>Sales</Text>
                            </View>
                            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <View style={[styles.badgeSquare, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="wallet-outline" size={17} color={colors.text} />
                                </View>
                                <Text style={[styles.summaryValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(totals?.collection_fytd, display)}</Text>
                                <Text style={[styles.summaryCaption, { color: colors.textSecondary }]}>Collection</Text>
                            </View>
                        </View>

                        <View style={[styles.pendingCard, { backgroundColor: 'rgba(220,53,69,0.10)', borderLeftColor: DANGER }]}>
                            <Ionicons name="triangle" size={110} color="rgba(220,53,69,0.10)" style={styles.pendingWatermark} />
                            <View style={styles.pendingTop}>
                                <Text style={styles.pendingLabel}>Payment Pending</Text>
                                <View style={[styles.pendingIconCircle, { backgroundColor: 'rgba(220,53,69,0.16)' }]}>
                                    <Ionicons name="warning-outline" size={15} color={DANGER} />
                                </View>
                            </View>
                            <Text style={[styles.pendingValue, { color: DANGER }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(totals?.payment_pending, display)}</Text>
                        </View>

                        <View style={styles.searchRow}>
                            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Ionicons name="search" size={16} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text }]}
                                    placeholder="Search organisation"
                                    placeholderTextColor={colors.textSecondary}
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                            </View>
                            <TouchableOpacity
                                style={[styles.sortBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                                onPress={() => setSortMode(m => (m === 'alpha' ? 'pending' : 'alpha'))}
                            >
                                <Ionicons name="swap-vertical-outline" size={17} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {rows.length === 0 ? (
                            <View style={styles.emptyState}>
                                <Ionicons name="search-outline" size={40} color={colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No brands match &ldquo;{searchQuery}&rdquo;</Text>
                            </View>
                        ) : (
                            rows.map(row => (
                                <TouchableOpacity
                                    key={row.brand}
                                    style={[styles.brandCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                    onPress={() => goToBrand(row)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.brandTop}>
                                        <View style={styles.brandId}>
                                            <View style={[styles.brandAvatar, { backgroundColor: colors.surfaceSecondary }]}>
                                                <Text style={[styles.brandAvatarText, { color: colors.text }]}>{brandLabel(row.brand)[0]}</Text>
                                            </View>
                                            <Text style={[styles.brandName, { color: colors.text }]}>{brandLabel(row.brand)}</Text>
                                        </View>
                                        <View style={styles.viewLink}>
                                            <Text style={[styles.viewLinkText, { color: colors.text }]}>View Details</Text>
                                            <Ionicons name="chevron-forward" size={13} color={colors.text} />
                                        </View>
                                    </View>
                                    <View style={[styles.brandDivider, { backgroundColor: colors.border }]} />
                                    <View style={styles.brandMetrics}>
                                        <View>
                                            <Text style={[styles.bmLabel, { color: colors.textSecondary }]}>Sales</Text>
                                            <Text style={[styles.bmValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(row.sales_mtd, display)}</Text>
                                        </View>
                                        <View>
                                            <Text style={[styles.bmLabel, { color: colors.textSecondary }]}>Collection</Text>
                                            <Text style={[styles.bmValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(row.collection_mtd, display)}</Text>
                                        </View>
                                        <View>
                                            <Text style={[styles.bmLabel, { color: DANGER }]}>Pending</Text>
                                            <Text style={[styles.bmValue, { color: DANGER }]} numberOfLines={1} adjustsFontSizeToFit>{formatAmount(row.payment_pending, display)}</Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </>
                )}
            </ScrollView>

            {/* Filters bottom sheet */}
            <Modal visible={filtersSheetVisible} transparent animationType="slide" onRequestClose={closeFiltersSheet}>
                <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeFiltersSheet}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(10,15,25,0.55)' }} />
                    </Pressable>
                    <View style={[styles.sheet, { backgroundColor: colors.background }]}>
                        <View style={[styles.handle, { backgroundColor: colors.border }]} />
                        <View style={styles.sheetHead}>
                            <Text style={[styles.sheetTitle, { color: colors.text }]}>Filters</Text>
                            <TouchableOpacity onPress={closeFiltersSheet}>
                                <Ionicons name="close" size={22} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={[styles.sheetDivider, { backgroundColor: colors.border }]} />

                        <View style={styles.fieldGrid}>
                            <FieldBlock label="Fiscal Year" value={draftFiscalYear || '—'} onPress={openFyPicker} colors={colors} styles={styles} />
                            <FieldBlock label="Month" value={draftMonth} onPress={openMonthPicker} colors={colors} styles={styles} />
                        </View>
                        <FieldBlock full label="Specific Date" value={ddmmyy(draftDate)} onPress={() => setShowDatePicker(v => !v)} icon="calendar-outline" colors={colors} styles={styles} />
                        {showDatePicker && (
                            <DateTimePicker
                                value={new Date(`${draftDate}T00:00:00`)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
                                maximumDate={new Date(`${yesterday()}T00:00:00`)}
                                onChange={onChangeDraftDate}
                                style={{ alignSelf: 'center', marginBottom: vs(14) }}
                            />
                        )}
                        {ownExecutiveName ? (
                            <View style={styles.fieldBlockFull}>
                                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Sales Executive</Text>
                                <View style={[styles.selectBox, { borderColor: colors.border }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="people-outline" size={15} color={colors.textSecondary} />
                                        <Text style={[styles.selectValue, { color: colors.text }]}>{ownExecutiveName}</Text>
                                    </View>
                                    <Ionicons name="lock-closed" size={13} color={colors.textSecondary} />
                                </View>
                            </View>
                        ) : (
                            <FieldBlock full label="Sales Executive" value={execLabel(draftSalesExecutive)} onPress={openExecPicker} icon="people-outline" colors={colors} styles={styles} />
                        )}

                        <View style={styles.fieldBlockFull}>
                            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Display Unit</Text>
                            <View style={[styles.segmented, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                                {(['absolute', 'lacs'] as DisplayUnit[]).map(opt => (
                                    <TouchableOpacity
                                        key={opt}
                                        style={[styles.segment, draftDisplay === opt && { backgroundColor: colors.surface }]}
                                        onPress={() => setDraftDisplay(opt)}
                                    >
                                        <Text style={[styles.segmentText, { color: draftDisplay === opt ? colors.text : colors.textSecondary }]}>{DISPLAY_LABELS[opt]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        <TouchableOpacity style={[styles.applyBtn, { backgroundColor: NAVY }]} onPress={applyFilters}>
                            <Text style={styles.applyBtnText}>APPLY FILTERS</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={picker.visible} transparent animationType="fade" onRequestClose={() => setPicker(p => ({ ...p, visible: false }))}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
                    onPress={() => setPicker(p => ({ ...p, visible: false }))}
                >
                    <View style={{ width: '100%', maxHeight: '70%', backgroundColor: colors.background, borderRadius: 24, padding: 24, gap: 16 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{picker.title}</Text>
                            <TouchableOpacity onPress={() => setPicker(p => ({ ...p, visible: false }))}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ gap: 8 }}>
                            {picker.options.map(option => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={{
                                        padding: 16, borderRadius: 12,
                                        backgroundColor: picker.selectedValue === option.value ? colors.surfaceSecondary : 'transparent',
                                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                                    }}
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
        topbarTitle: { fontSize: ms(16), fontWeight: '800' },

        scrollContent: { paddingBottom: vs(40) },

        dateRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: s(18), paddingTop: vs(18) },
        dateLabel: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
        dateValue: { fontSize: ms(23), fontWeight: '800' },
        filtersBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: ms(12), paddingVertical: vs(9), paddingHorizontal: s(14) },
        filtersBtnText: { fontSize: ms(13), fontWeight: '700' },

        chipScroll: { marginTop: vs(14), paddingLeft: s(18) },
        chip: { paddingHorizontal: s(16), paddingVertical: vs(8), borderRadius: 999 },
        chipText: { fontSize: ms(12.5), fontWeight: '700' },
        chipTextActive: { fontSize: ms(12.5), fontWeight: '700', color: '#fff' },

        sectionLabel: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginHorizontal: s(18), marginTop: vs(22), marginBottom: vs(10) },

        summaryGrid: { flexDirection: 'row', gap: s(12), paddingHorizontal: s(18) },
        summaryCard: { flex: 1, borderWidth: 1, borderRadius: ms(20), padding: ms(16) },
        badgeSquare: { width: ms(34), height: ms(34), borderRadius: ms(10), justifyContent: 'center', alignItems: 'center' },
        summaryValue: { fontSize: ms(21), fontWeight: '800', marginTop: vs(14), marginBottom: 2 },
        summaryCaption: { fontSize: ms(12.5), fontWeight: '600' },

        pendingCard: { position: 'relative', overflow: 'hidden', borderLeftWidth: 5, borderRadius: ms(18), padding: ms(18), marginHorizontal: s(18), marginTop: vs(12) },
        pendingWatermark: { position: 'absolute', right: -14, bottom: -18 },
        pendingTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        pendingLabel: { fontSize: ms(12), fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: '#7A2020' },
        pendingIconCircle: { width: ms(30), height: ms(30), borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
        pendingValue: { fontSize: ms(25), fontWeight: '800', marginTop: vs(12) },

        searchRow: { flexDirection: 'row', gap: s(10), paddingHorizontal: s(18), marginTop: vs(22) },
        searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: s(16), paddingVertical: vs(4) },
        searchInput: { flex: 1, fontSize: ms(14), fontWeight: '500', paddingVertical: vs(8) },
        sortBtn: { width: ms(44), height: ms(44), borderWidth: 1, borderRadius: ms(14), justifyContent: 'center', alignItems: 'center' },

        emptyState: { alignItems: 'center', paddingVertical: vs(50), gap: 12 },
        emptyText: { fontSize: ms(13), fontWeight: '600' },

        brandCard: { borderWidth: 1, borderRadius: ms(18), padding: ms(16), marginHorizontal: s(18), marginTop: vs(14) },
        brandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        brandId: { flexDirection: 'row', alignItems: 'center', gap: s(12) },
        brandAvatar: { width: ms(38), height: ms(38), borderRadius: ms(10), justifyContent: 'center', alignItems: 'center' },
        brandAvatarText: { fontSize: ms(14), fontWeight: '800' },
        brandName: { fontSize: ms(16), fontWeight: '800' },
        viewLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
        viewLinkText: { fontSize: ms(12.5), fontWeight: '700' },
        brandDivider: { height: 1, marginVertical: vs(13) },
        brandMetrics: { flexDirection: 'row', justifyContent: 'space-between' },
        bmLabel: { fontSize: ms(11.5), fontWeight: '600', marginBottom: 4 },
        bmValue: { fontSize: ms(14.5), fontWeight: '800' },

        sheet: { borderTopLeftRadius: ms(24), borderTopRightRadius: ms(24), paddingHorizontal: s(22), paddingTop: vs(10), paddingBottom: vs(28) },
        handle: { width: 40, height: 4, borderRadius: 999, alignSelf: 'center', marginBottom: vs(18) },
        sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: vs(16) },
        sheetTitle: { fontSize: ms(20), fontWeight: '800' },
        sheetDivider: { height: 1, marginHorizontal: -22, marginBottom: vs(18) },

        fieldGrid: { flexDirection: 'row', gap: s(14), marginBottom: vs(14) },
        fieldBlock: { flex: 1, gap: 8, marginBottom: vs(14) },
        fieldBlockFull: { gap: 8, marginBottom: vs(14) },
        fieldLabel: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
        selectBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: ms(12), paddingVertical: vs(12), paddingHorizontal: s(14) },
        selectValue: { fontSize: ms(14.5), fontWeight: '600' },

        segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: ms(12), padding: 4, gap: 4 },
        segment: { flex: 1, alignItems: 'center', paddingVertical: vs(9), borderRadius: ms(9) },
        segmentText: { fontSize: ms(12.5), fontWeight: '700' },

        applyBtn: { borderRadius: ms(14), paddingVertical: vs(16), alignItems: 'center', marginTop: vs(6) },
        applyBtnText: { color: '#fff', fontSize: ms(14.5), fontWeight: '800', letterSpacing: 0.4 },
    });
}
