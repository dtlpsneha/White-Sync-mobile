import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '../hooks/useResponsive';
import Animated, { FadeInDown, FadeInUp, useSharedValue, withRepeat, withTiming, withSequence, useAnimatedStyle } from 'react-native-reanimated';

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
}

interface QuotationListProps {
    filter?: string;
    searchQuery?: string;
    scrollEnabled?: boolean;
}

export default function QuotationList({ filter = 'All', searchQuery = '', scrollEnabled = true }: QuotationListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const { s, vs, ms } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms });

    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);

    const pulseValue = useSharedValue(1);

    useEffect(() => {
        pulseValue.value = withRepeat(
            withSequence(
                withTiming(1.2, { duration: 1000 }),
                withTiming(1, { duration: 1000 })
            ),
            -1,
            true
        );
    }, []);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseValue.value }],
        opacity: withRepeat(withSequence(withTiming(0.4, { duration: 1000 }), withTiming(0.8, { duration: 1000 })), -1, true),
    }));

    useEffect(() => {
        fetchQuotations();
    }, [filter, searchQuery]);

    const fetchQuotations = async () => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const showAllQuotes = await SecureStore.getItemAsync('show_all_quotes');
            const isManager = await SecureStore.getItemAsync('is_manager');
            const loggedInUser = await SecureStore.getItemAsync('user_id');

            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            // Determine body based on logic:
            // Quote Head / Manager (is_manager=true, show_all_quotes=true) -> "all"
            // Everyone else -> "respective_user"
            // Note: Login logic stores 'true'/'false' strings.
            const requestType = (showAllQuotes === 'true') ? 'all' : 'respective_user';

            console.log(`[QuotationList] Fetching with type: ${requestType}`);

            const url = `http://13.234.62.39:8080/api/method/get_quote_resource`;
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    show_quotation_type: requestType
                })
            });

            const data = await response.json();

            // Log response structure to verify assumption
            // console.log('[QuotationList] Response:', JSON.stringify(data).substring(0, 200) + '...');

            if (response.ok && data.message) {
                // Assumption: Custom API returns list in `data.message` or `data.message.data`? 
                // User example: "Response: { message: ... }" (User Data example). 
                // Usually Frappe custom methods return data in `message`.
                // If it returns a list directly in message:
                let fetchedList: Quotation[] = [];
                if (Array.isArray(data.message)) {
                    fetchedList = data.message;
                } else if (data.message.data && Array.isArray(data.message.data)) {
                    fetchedList = data.message.data;
                } else if (data.data && Array.isArray(data.data)) {
                    // Fallback for standard resource response style just in case
                    fetchedList = data.data;
                }

                // Client-side filtering
                let filtered = fetchedList;

                // 1. Workflow State Filter
                if (filter !== 'All') {
                    filtered = filtered.filter(q => {
                        const rawStatus = (q.workflow_state || q.status || '').trim();
                        let displayStatus = rawStatus;
                        if (displayStatus === 'Open') displayStatus = 'Pending';
                        if (displayStatus === 'Declined' || displayStatus === 'Rejected') displayStatus = 'Review';

                        // Case-insensitive comparison and handle Canceled vs Cancelled
                        const targetFilter = filter.toLowerCase();
                        const currentStatus = displayStatus.toLowerCase();

                        if (targetFilter === 'cancelled' || targetFilter === 'canceled') {
                            return currentStatus === 'cancelled' || currentStatus === 'canceled';
                        }

                        return currentStatus === targetFilter;
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

                // 3. Sales Manager Filter (Waiting for approval)
                // Logic: is_manager = true and show_all_quotes = false
                // Relaxation: Also show quotes where the user is the owner, so they can see their history/cancelled quotes.
                if (isManager === 'true' && showAllQuotes === 'false') {
                    console.log(`[QuotationList] Applying Sales Manager filter for: ${loggedInUser}`);
                    filtered = filtered.filter(q => q.temporary_approver === loggedInUser || q.owner === loggedInUser);
                }

                if (fetchedList.length > 0) {
                    console.log('[QuotationList] First Item Sample:', JSON.stringify(fetchedList[0]));
                }

                // Data usually comes sorted from ERPNext reports, but safe to trust API/Array order for now.

                setQuotations(filtered);
            } else {
                console.warn('Failed to fetch quotations', data);
                setQuotations([]);
            }
        } catch (error) {
            console.error('Error fetching quotations:', error);
            setQuotations([]);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColors = (status: string) => {
        const isDark = theme === 'dark';
        switch (status) {
            case 'Approved':
            case 'Ordered':
                return { bg: 'rgba(0, 191, 165, 0.1)', text: '#00BFA5', border: 'rgba(0, 191, 165, 0.2)' };
            case 'Open':
            case 'Pending':
            case 'Draft':
                return { bg: 'rgba(2, 119, 189, 0.1)', text: '#0277BD', border: 'rgba(2, 119, 189, 0.2)' };
            case 'Review':
                return { bg: 'rgba(244, 81, 30, 0.1)', text: '#F4511E', border: 'rgba(244, 81, 30, 0.2)' };
            case 'Cancelled':
            case 'Declined':
            case 'Rejected':
                return { bg: 'rgba(198, 40, 40, 0.1)', text: '#C62828', border: 'rgba(198, 40, 40, 0.2)' };
            default:
                return { bg: isDark ? 'rgba(255,255,255,0.05)' : '#F5F7FA', text: '#78909C', border: isDark ? 'rgba(255,255,255,0.1)' : '#ECEFF1' };
        }
    };

    const getRandomColor = (char: string) => {
        const primaryColors = theme === 'dark'
            ? ['#818CF8', '#34D399', '#FBBF24', '#F87171', '#60A5FA']
            : ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'];
        const index = char.charCodeAt(0) % primaryColors.length;
        return primaryColors[index];
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
        let rawName = (item.temporary_approver && item.temporary_approver.trim()) ? item.temporary_approver :
            (item.approved_by && item.approved_by.trim()) ? item.approved_by :
                (item.executive_person && item.executive_person.trim()) ? item.executive_person :
                    (item.team_member && item.team_member.trim()) ? item.team_member :
                        (item.sales_executive && item.sales_executive.trim()) ? item.sales_executive :
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
        return rawName.trim().replace(/\b\w/g, c => c.toUpperCase());
    };

    const renderItem = ({ item }: { item: Quotation }) => {
        const rawStatus = item.workflow_state || item.status;
        let displayStatus = rawStatus;
        if (displayStatus === 'Open') displayStatus = 'Pending';
        if (displayStatus === 'Declined' || displayStatus === 'Rejected') displayStatus = 'Review';

        const isApproved = displayStatus === 'Approved' || displayStatus === 'Ordered';
        const isPending = displayStatus === 'Pending' || displayStatus === 'Draft';
        const isReview = displayStatus === 'Review';
        const isCancelled = displayStatus === 'Cancelled';
        const isResubmit = displayStatus.toLowerCase().includes('resubmit') || displayStatus.toLowerCase().includes('re-open');

        const statusConfig = isApproved
            ? { color: '#00BFA5', bg: 'rgba(0, 191, 165, 0.1)', border: 'rgba(0, 191, 165, 0.2)' }
            : isPending
                ? { color: '#0277BD', bg: 'rgba(2, 119, 189, 0.1)', border: 'rgba(2, 119, 189, 0.2)' }
                : isReview
                    ? { color: '#F4511E', bg: 'rgba(244, 81, 30, 0.1)', border: 'rgba(244, 81, 30, 0.2)' }
                    : isCancelled
                        ? { color: '#C62828', bg: 'rgba(198, 40, 40, 0.1)', border: 'rgba(198, 40, 40, 0.2)' }
                        : isResubmit
                            ? { color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.2)' }
                            : { color: colors.textSecondary, bg: colors.surfaceSecondary, border: colors.border };

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
                    <View style={[styles.statusAccent, { backgroundColor: statusConfig.color }]} />

                    <View style={styles.cardContent}>
                        {/* Top: Header Info */}
                        <View style={styles.cardHeader}>
                            <View style={styles.idBadge}>
                                <Text style={styles.idText}>#{item.name}</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg + '10', borderColor: statusConfig.border }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                    {displayStatus}
                                </Text>
                            </View>
                        </View>

                        {/* Middle: Customer Name */}
                        <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>

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
                                <Text style={[styles.amountText, { color: statusConfig.color }]}>{formattedAmount}</Text>
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
    };


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
            fontSize: ms(15),
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
            fontSize: ms(18),
            fontWeight: '900',
            color: colors.primary,
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
    });
}
