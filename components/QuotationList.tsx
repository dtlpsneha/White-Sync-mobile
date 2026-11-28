import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow, StatusColors } from '@/constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import Animated from 'react-native-reanimated';
import { enterRow } from '@/constants/motion';
import { apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';

interface Quotation {
    name: string;
    customer_name: string;
    transaction_date: string;
    valid_till: string;
    grand_total: number;
    status: string;
    currency: string;
    company: string;
    workflow_state?: string;
    creation?: string;
    in_words?: string;
    owner: string;
    team_member?: string;
    sales_executive?: string;
    temporary_approver?: string;
    quotation_approver?: string | null;
    quotation_approver_name?: string | null;
    total?: number;
    total_amount?: number;
    rounded_total?: number;
    base_grand_total?: number;
    date?: string;
    posting_date?: string;
    valid_until?: string;
    executive_person?: string;
    brand?: string;
    net_total?: number;
    base_net_total?: number;
    approved_by?: string;
    dashboard_category?: string;
    docstatus?: number;
    against_purchase_invoice?: string;
    purchase_rate?: number;
    item_margin?: number;
    total_margin?: number;
    display_status?: string;
    color?: string;
}

/** Which bucket a quote falls in. Same rules the filter pills use. */
export function quoteFlags(q: Pick<Quotation, 'workflow_state' | 'status' | 'docstatus'>) {
    const workflow = (q.workflow_state || '').toUpperCase().replace('-', '');
    const status = (q.status || '').toUpperCase().replace('-', '');
    // Treat workflow_state as the primary state if present, fallback to standard status.
    // This prevents Frappe's default 'Draft' status from pulling 'Pending' items into the Draft tab.
    const activeState = workflow || status || 'DRAFT';
    const isCanceled = activeState.includes('CANCEL') || activeState.includes('REJECT') || activeState.includes('DECLINE') || q.docstatus === 2;
    const isApproved = activeState.includes('APPROV') || activeState.includes('ORDER') || activeState === 'SUBMITTED' || (q.docstatus === 1 && !isCanceled);
    const isPending = activeState.includes('PENDING') || activeState === 'OPEN';
    const isReview = activeState.includes('REVIEW');
    const isReopen = activeState.includes('REOPEN') || activeState.includes('RESUBMIT');
    const isDraft = activeState === 'DRAFT' || activeState === '';
    return { activeState, isCanceled, isApproved, isPending, isReview, isReopen, isDraft };
}

/** The quote's value, from whichever total field the endpoint filled. */
export function quoteAmount(q: Partial<Quotation>): number {
    return Number(q.grand_total ?? q.net_total ?? q.base_net_total ?? q.rounded_total ?? q.total ?? q.total_amount ?? q.base_grand_total ?? 0) || 0;
}

/** Status colour (Midnight x Ember). `color` is the backend's own colour name, when it sends one. */
export function quoteStatusColor(status: string, color?: string): string {
    const c = (color || '').toLowerCase();
    if (c === 'green') return StatusColors.approved;
    if (c === 'orange') return StatusColors.review;
    if (c === 'blue') return StatusColors.pending;
    if (c === 'red') return StatusColors.cancelled;
    if (c === 'grey' || c === 'gray') return StatusColors.draft;
    const s = (status || '').toUpperCase().replace('-', '');
    if (s.includes('CANCEL') || s.includes('REJECT') || s.includes('DECLINE')) return StatusColors.cancelled;
    if (s.includes('REOPEN') || s.includes('RESUBMIT')) return StatusColors.reopen;
    if (s.includes('APPROV') || s.includes('ORDER') || s.includes('SUBMIT')) return StatusColors.approved;
    if (s.includes('PENDING')) return StatusColors.pending;
    if (s.includes('REVIEW') || s === 'OPEN') return StatusColors.review;
    return StatusColors.draft;
}

export type { Quotation };

interface QuotationListProps {
    filter?: string;
    searchQuery?: string;
    scrollEnabled?: boolean;
    /** Reports the distinct workflow states in the fetched data, so the parent
     *  screen can build its filter pills without refetching the list. */
    onStatesLoaded?: (states: string[]) => void;
    /** Hands the whole fetched list to the parent (for the figures in the header). */
    onLoaded?: (list: Quotation[]) => void;
}

export default function QuotationList({ filter = 'All', searchQuery = '', scrollEnabled = true, onStatesLoaded, onLoaded }: QuotationListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    // StyleSheet.create() on every render also defeated the memoised renderItem below.
    const styles = useMemo(() => getStyles(theme, { s, vs, ms }), [theme, s, vs, ms]);

    // Raw server list. Filtering and searching are done locally against this,
    // so typing does not trigger a refetch.
    const [allQuotations, setAllQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);

    // Fetch once. `filter` and `searchQuery` are applied client-side below —
    // having them here meant every keystroke re-downloaded the whole list.
    useEffect(() => {
        fetchQuotations();
    }, []);

    const fetchQuotations = async () => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const url = apiUrl('/api/method/get_quote_resource');
            const res = await apiPost(url, {}, sessionCookies);

            const data: any = res.data;

            if (res.ok && data && data.message && data.message.success) {
                const fetchedList: Quotation[] = Array.isArray(data.message.data) ? data.message.data : [];

                // The endpoint can return the same quotation more than once.
                // Duplicates would collide in FlatList's keyExtractor (which
                // keys on `name`), producing React key warnings and recycled
                // rows rendering the wrong record.
                const seen = new Set<string>();
                const deduped = fetchedList.filter(q => {
                    if (!q?.name || seen.has(q.name)) return false;
                    seen.add(q.name);
                    return true;
                });

                setAllQuotations(deduped);
                onLoaded?.(deduped);

                if (onStatesLoaded) {
                    const states = Array.from(new Set(
                        deduped
                            .map(q => (q.dashboard_category || q.workflow_state || q.status || '').trim())
                            .filter(Boolean)
                    )).sort();
                    onStatesLoaded(states);
                }
            } else {
                console.warn('Failed to fetch quotations', data);
                setAllQuotations([]);
            }
        } catch (error) {
            console.error('Error fetching quotations:', error);
            setAllQuotations([]);
        } finally {
            setLoading(false);
        }
    };

    const quotations = useMemo(() => {
        let filtered = allQuotations;

        // 1. Filter by dashboard category or status
        if (filter !== 'All') {
            const target = filter.toUpperCase().replace('-', '');

            filtered = filtered.filter(q => {
                const cat = (q.dashboard_category || '').toUpperCase().replace('-', '');
                const { activeState, isCanceled, isApproved, isPending, isReview, isReopen, isDraft } = quoteFlags(q);

                if (target === 'APPROVED') return isApproved && !isCanceled;
                if (target === 'CANCELLED') return isCanceled;
                if (target === 'PENDING') return isPending && !isApproved && !isCanceled;
                if (target === 'REVIEW') return isReview && !isApproved && !isCanceled;
                if (target === 'REOPEN') return isReopen && !isApproved && !isCanceled;
                if (target === 'DRAFT') return isDraft && !isPending && !isReview && !isApproved && !isCanceled && !isReopen;

                // Generic match for other potential status tabs
                return activeState.includes(target) || cat === target;
            });
        }

        // 2. Search Query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(q =>
                (q.name && q.name.toLowerCase().includes(query)) ||
                (q.customer_name && q.customer_name.toLowerCase().includes(query))
            );
        }

        return filtered;
    }, [allQuotations, filter, searchQuery]);

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        // Handle ERPNext formats (yyyy-mm-dd or yyyy-mm-dd HH:mm:ss)
        const date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const formatCreatorName = (item: Quotation) => {
        // Prioritize actual name fields over owner/email
        const candidates = [
            item.quotation_approver_name,
            item.quotation_approver,
            item.temporary_approver,
            item.approved_by,
            item.executive_person,
            item.team_member,
            item.sales_executive,
        ];

        const named = candidates.find(v => typeof v === 'string' && v.trim());

        let rawName = named ? named.trim() :
            (item.owner && !item.owner.toLowerCase().includes('system')) ? item.owner : 'System';

        // If it looks like an email, take the part before @
        if (rawName.includes('@')) {
            rawName = rawName.split('@')[0];
        }

        // Trim whitespace first so ^ regex works
        rawName = rawName.trim();

        // Strip DTLP prefix if present (case insensitive)
        rawName = rawName.replace(/^dtlp/i, '');

        // Clean up and Title Case
        return rawName.trim().replace(/\b\w/g, (c: string) => c.toUpperCase()) || 'System';
    };

    const renderItem = useCallback(({ item, index }: { item: Quotation; index?: number }) => {
        const displayStatus = item.display_status || item.workflow_state || item.status || 'Draft';
        const tone = quoteStatusColor(displayStatus, item.color);
        const amount = quoteAmount(item);
        const formattedAmount = '₹' + amount.toLocaleString('en-IN', { maximumFractionDigits: 0 });
        const date = formatDate(item.transaction_date) || formatDate(item.posting_date || '') || formatDate(item.date || '') || formatDate(item.creation || '');
        const margin = item.item_margin ?? item.total_margin;
        const validTill = item.valid_till || item.valid_until || '';
        const validTime = validTill ? new Date(validTill.replace(' ', 'T')).getTime() : NaN;
        const expired = !isNaN(validTime) && validTime < Date.now() - 86400000;

        return (
            <Animated.View entering={enterRow(index ?? 0)}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.card}
                    onPress={() => router.push({ pathname: '/quotations/[id]', params: { id: item.name } })}
                >
                    <View style={[styles.edge, { backgroundColor: tone }]} />
                    <View style={styles.cardBody}>
                        <View style={styles.topRow}>
                            <Text style={styles.qid} numberOfLines={1}>#{item.name}</Text>
                            <View style={[styles.pill, { backgroundColor: tone + '1F' }]}>
                                <View style={[styles.pillDot, { backgroundColor: tone }]} />
                                <Text style={[styles.pillText, { color: tone }]} numberOfLines={1}>{displayStatus}</Text>
                            </View>
                        </View>
                        <View style={styles.midRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                                <Text style={styles.metaText} numberOfLines={1}>{date} · {formatCreatorName(item)}</Text>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.amountText}>{formattedAmount}</Text>
                                {margin !== undefined && margin !== null ? (
                                    <View style={styles.marginRow}>
                                        <Ionicons name="trending-up" size={12} color={colors.success} />
                                        <Text style={[styles.marginText, { color: colors.success }]}>₹{Number(margin).toLocaleString('en-IN')} margin</Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                        {validTill ? (
                            <View style={styles.validRow}>
                                <Ionicons name="time-outline" size={13} color={expired ? colors.danger : colors.textSecondary} />
                                <Text style={[styles.validText, { color: expired ? colors.danger : colors.textSecondary }]}>
                                    {expired ? 'Expired' : 'Valid till'} {formatDate(validTill)}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    }, [styles, colors, router]);

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (quotations.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="documents-outline" size={64} color={colors.surfaceVariant} />
                <Text style={styles.emptyText}>No quotations found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {scrollEnabled ? (
                <FlatList
                    data={quotations}
                    renderItem={renderItem}
                    keyExtractor={item => item.name}
                    scrollEnabled={true}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={8}
                    maxToRenderPerBatch={8}
                    windowSize={7}
                    removeClippedSubviews
                />
            ) : (
                <View style={styles.listContent}>
                    {quotations.map((item, i) => (
                        <View key={item.name}>{renderItem({ item, index: i })}</View>
                    ))}
                </View>
            )}
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1 },
        center: { padding: 40, alignItems: 'center', justifyContent: 'center' },
        listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 },
        card: {
            backgroundColor: colors.surface,
            borderRadius: Radius.lg,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
            flexDirection: 'row',
            overflow: 'hidden',
            ...Shadow.card(theme),
        },
        edge: { width: 4 },
        cardBody: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, gap: 6 },
        topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
        qid: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: colors.primaryVariant, letterSpacing: 0.2 },
        pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: Radius.pill },
        pillDot: { width: 6, height: 6, borderRadius: 3 },
        pillText: { fontSize: ms(11), fontWeight: '800' },
        midRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        customerName: { fontSize: ms(15), fontWeight: '800', color: colors.text, letterSpacing: -0.2 },
        metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500', marginTop: 2 },
        amountText: { fontSize: ms(16), fontWeight: '800', color: colors.text },
        marginRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
        marginText: { fontSize: 11, fontWeight: '800' },
        validRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
        validText: { fontSize: 11.5, fontWeight: '700' },
        emptyText: { color: colors.textSecondary, fontSize: 15, marginTop: 12, fontWeight: '600' },
    });
}
