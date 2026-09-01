import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import Animated, { FadeInDown } from 'react-native-reanimated';
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

interface QuotationListProps {
    filter?: string;
    searchQuery?: string;
    scrollEnabled?: boolean;
    /** Reports the distinct workflow states in the fetched data, so the parent
     *  screen can build its filter pills without refetching the list. */
    onStatesLoaded?: (states: string[]) => void;
}

export default function QuotationList({ filter = 'All', searchQuery = '', scrollEnabled = true, onStatesLoaded }: QuotationListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
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

    const getStatusColors = (status: string, color?: string) => {
        const isDark = theme === 'dark';
        
        // 1. If explicit color name provided by backend
        if (color) {
            const c = color.toLowerCase();
            if (c === 'green') return { bg: 'rgba(0, 191, 165, 0.1)', text: '#00BFA5', border: 'rgba(0, 191, 165, 0.2)' };
            if (c === 'orange') return { bg: 'rgba(245, 158, 11, 0.1)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.2)' };
            if (c === 'blue') return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3B82F6', border: 'rgba(59, 130, 246, 0.2)' };
            if (c === 'red') return { bg: 'rgba(239, 68, 68, 0.1)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.2)' };
            if (c === 'grey' || c === 'gray') return { bg: 'rgba(148, 163, 184, 0.1)', text: '#94A3B8', border: 'rgba(148, 163, 184, 0.2)' };
        }

        // 2. Logic fallback
        const s = status.toUpperCase();
        if (s === 'APPROVED' || s === 'ORDERED' || s === 'SUBMITTED') {
            return { bg: 'rgba(0, 191, 165, 0.1)', text: '#00BFA5', border: 'rgba(0, 191, 165, 0.2)' };
        }
        if (s === 'PENDING') {
            return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3B82F6', border: 'rgba(59, 130, 246, 0.2)' };
        }
        if (s === 'REVIEW' || s === 'OPEN') {
            return { bg: 'rgba(245, 158, 11, 0.1)', text: '#F59E0B', border: 'rgba(245, 158, 11, 0.2)' };
        }
        if (s.includes('REOPEN') || s.includes('RESUBMIT')) {
            return { bg: 'rgba(30, 58, 138, 0.1)', text: '#1E3A8A', border: 'rgba(30, 58, 138, 0.2)' };
        }
        if (s === 'CANCELLED') {
            return { bg: 'rgba(239, 68, 68, 0.1)', text: '#EF4444', border: 'rgba(239, 68, 68, 0.2)' };
        }
        if (s === 'DRAFT') {
            return { bg: 'rgba(148, 163, 184, 0.1)', text: '#94A3B8', border: 'rgba(148, 163, 184, 0.2)' };
        }

        return { bg: isDark ? 'rgba(255,255,255,0.05)' : '#F5F7FA', text: '#94A3B8', border: isDark ? 'rgba(255,255,255,0.1)' : '#ECEFF1' };
    };

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

    const renderItem = useCallback(({ item }: { item: Quotation }) => {
        const displayStatus = item.display_status || item.workflow_state || item.status || 'Draft';
        const statusConfig = getStatusColors(displayStatus, item.color);

        const amount = Number(item.grand_total ?? item.net_total ?? item.base_net_total ?? item.rounded_total ?? item.total ?? item.total_amount ?? item.base_grand_total ?? 0);
        const formattedAmount = amount.toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).replace('INR', '₹');

        const date = formatDate(item.transaction_date) || formatDate(item.posting_date || '') || formatDate(item.date || '') || formatDate(item.creation || '');

        return (
            <Animated.View entering={FadeInDown.delay(100 + (item.name.charCodeAt(0) % 5) * 50).springify()}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.card}
                    onPress={() => {
                        router.push({ pathname: '/quotations/[id]', params: { id: item.name } });
                    }}
                >
                    {/* Status Accent Line */}
                    <View style={[styles.statusAccent, { backgroundColor: statusConfig.text }]} />

                    <View style={styles.cardContent}>
                        {/* Top: Header Info */}
                        <View style={styles.cardHeader}>
                            <View style={styles.idBadge}>
                                <Text style={styles.idText}>#{item.name}</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg + '10', borderColor: statusConfig.border }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusConfig.text }]} />
                                <Text style={[styles.statusText, { color: statusConfig.text }]}>
                                    {displayStatus}
                                </Text>
                            </View>
                        </View>

                        {/* Middle: Customer Name & Margin */}
                        <View style={styles.projectInfoRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                            </View>
                            {(item.item_margin !== undefined || item.total_margin !== undefined) && (
                                <View style={styles.marginChip}>
                                    <Text style={styles.marginChipLabel}>Margin</Text>
                                    <View style={styles.marginValueContainer}>
                                        <Ionicons name="trending-up" size={10} color="#059669" />
                                        <Text style={styles.marginChipValue}>₹{(item.item_margin ?? item.total_margin ?? 0).toLocaleString()}</Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        {/* Meta Row: Date and Creator */}
                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                                <Text style={styles.metaText}>{date}</Text>
                            </View>
                            <View style={styles.metaDivider} />
                            <View style={styles.metaItem}>
                                <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
                                <Text style={styles.metaText}>{formatCreatorName(item)}</Text>
                            </View>
                        </View>

                        {/* Footer: Amount and Expiry */}
                        <View style={styles.cardFooter}>
                            <View style={styles.amountContainer}>
                                <Text style={styles.amountLabel}>Total Value</Text>
                                <Text style={[styles.amountText, { color: statusConfig.text }]}>{formattedAmount}</Text>
                            </View>

                            {(item.valid_till || item.valid_until) && (
                                <View style={styles.expiryBadge}>
                                    <Ionicons name="time-outline" size={12} color={isDark ? '#FCA5A5' : '#EF4444'} />
                                    <Text style={styles.expiryText}>
                                        {formatDate(item.valid_till || item.valid_until || '')}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    }, [styles, colors, isDark, router]);

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
                    {quotations.map(item => (
                        <View key={item.name}>{renderItem({ item })}</View>
                    ))}
                </View>
            )}
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
        },
        center: {
            padding: 40,
            alignItems: 'center',
            justifyContent: 'center',
        },
        listContent: {
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 100,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: 24,
            marginBottom: 16,
            shadowColor: colors.cardShadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.04,
            shadowRadius: 14,
            elevation: 6,
            borderWidth: isDark ? 1 : 0,
            borderColor: colors.border,
            flexDirection: 'row',
            overflow: 'hidden',
        },
        statusAccent: {
            width: 5,
            height: '100%',
        },
        cardContent: {
            flex: 1,
            padding: 16,
        },
        cardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
        },
        idBadge: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
        },
        idText: {
            fontSize: 10,
            color: colors.textSecondary,
            fontWeight: '800',
            letterSpacing: 0.5,
        },
        customerName: {
            fontSize: ms(16),
            fontWeight: '900',
            color: colors.text,
            letterSpacing: -0.3,
            marginBottom: 10,
            textTransform: 'uppercase',
        },
        metaRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
            gap: 10,
        },
        metaItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
        },
        metaText: {
            fontSize: 12,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        metaDivider: {
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: colors.border,
        },
        statusPill: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 8,
            borderWidth: 1,
            gap: 4,
        },
        statusDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
        },
        statusText: {
            fontSize: ms(9),
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.8,
        },
        cardFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
        },
        amountContainer: {
            flex: 1,
        },
        amountLabel: {
            fontSize: 9,
            color: colors.textSecondary,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 2,
        },
        amountText: {
            fontSize: ms(20),
            fontWeight: '900',
            color: '#00BFA5',
            letterSpacing: -0.5,
        },
        expiryBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            gap: 4,
        },
        expiryText: {
            fontSize: 10,
            color: isDark ? '#FCA5A5' : '#EF4444',
            fontWeight: '800',
        },
        emptyText: {
            color: colors.textSecondary,
            fontSize: 15,
            marginTop: 12,
            fontWeight: '600',
        },
        projectInfoRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            gap: 8,
        },
        marginChip: {
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5',
            alignItems: 'center',
        },
        marginChipLabel: {
            fontSize: 8,
            color: '#10B981',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            marginBottom: 2,
        },
        marginValueContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3,
        },
        marginChipValue: {
            fontSize: 13,
            color: '#059669',
            fontWeight: '900',
        },
    });
}

