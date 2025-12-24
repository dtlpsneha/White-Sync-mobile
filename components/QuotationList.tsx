import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { s, vs, ms } from '../utils/responsive';
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
    const styles = getStyles(theme);

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
                        const rawStatus = q.workflow_state || q.status;
                        const displayStatus = rawStatus === 'Open' ? 'Pending' : rawStatus;
                        return displayStatus === filter;
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
                if (isManager === 'true' && showAllQuotes === 'false') {
                    console.log(`[QuotationList] Applying Sales Manager filter for: ${loggedInUser}`);
                    filtered = filtered.filter(q => q.temporary_approver === loggedInUser);
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
                return { bg: 'rgba(0, 176, 255, 0.1)', text: '#00B0FF', border: 'rgba(0, 176, 255, 0.2)' };
            case 'Review':
                return { bg: 'rgba(2, 119, 189, 0.1)', text: '#0277BD', border: 'rgba(2, 119, 189, 0.2)' };
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

    const renderItem = ({ item }: { item: Quotation }) => {
        const rawStatus = item.workflow_state || item.status;
        const displayStatus = rawStatus === 'Open' ? 'Pending' : rawStatus;

        const isApproved = displayStatus === 'Approved' || displayStatus === 'Ordered';
        const isPending = displayStatus === 'Pending' || displayStatus === 'Draft';
        const isCancelled = displayStatus === 'Cancelled' || displayStatus === 'Declined';

        const statusConfig = isApproved
            ? { color: '#4CAF50', bg: '#E8F5E9', border: '#C8E6C9' }
            : isPending
                ? { color: '#FF9800', bg: '#FFF3E0', border: '#FFE0B2' }
                : isCancelled
                    ? { color: '#F44336', bg: '#FFEBEE', border: '#FFCDD2' }
                    : { color: '#2196F3', bg: '#E3F2FD', border: '#BBDEFB' };

        const activeIconConfig = {
            bg: statusConfig.bg,
            color: statusConfig.color
        };

        return (
            <Animated.View entering={FadeInDown.delay(100)}>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.card}
                    onPress={() => {
                        router.push({ pathname: '/quotations/[id]', params: { id: item.name } });
                    }}
                >
                    <View style={styles.cardHeader}>
                        {/* Left: Icon Box */}
                        <View style={[styles.iconBox, { backgroundColor: activeIconConfig.bg }]}>
                            <Ionicons name="document-text" size={24} color={activeIconConfig.color} />
                        </View>

                        {/* Middle: Content */}
                        <View style={styles.contentMiddle}>
                            <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>

                            <View style={styles.statusRow}>
                                <View style={[styles.statusPill, { backgroundColor: statusConfig.bg, borderColor: statusConfig.border, borderWidth: 1 }]}>
                                    <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
                                    <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                        {displayStatus}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.creatorRow}>
                                <Ionicons name="person-outline" size={14} color="#90A4AE" />
                                <Text style={styles.creatorName}>
                                    {(item.executive_person && item.executive_person.trim()) ? item.executive_person :
                                        (item.team_member && item.team_member.trim()) ? item.team_member :
                                            (item.sales_executive && item.sales_executive.trim()) ? item.sales_executive :
                                                (item.owner && !item.owner.includes('System')) ? item.owner.split('@')[0] : 'Consultant'}
                                </Text>
                            </View>
                        </View>

                        {/* Right: Dates */}
                        <View style={styles.contentRight}>
                            <Text style={styles.transactionDate}>
                                {formatDate(item.transaction_date) || formatDate(item.posting_date || '') || formatDate(item.date || '') || formatDate(item.creation || '')}
                            </Text>
                            {(item.valid_till || item.valid_until) && (
                                <Text style={styles.expiryDate}>Valid: {formatDate(item.valid_till || item.valid_until || '')}</Text>
                            )}
                        </View>
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* Footer */}
                    <View style={styles.cardFooter}>
                        <Text style={styles.idText}>ID: {item.name}</Text>
                        <Text style={styles.amountText}>
                            {Number(item.grand_total ?? item.net_total ?? item.base_net_total ?? item.rounded_total ?? item.total ?? item.total_amount ?? item.base_grand_total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </Text>
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

function getStyles(theme: 'light' | 'dark') {
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
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: 100,
        },
        card: {
            backgroundColor: '#FFF',
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 3,
        },
        cardHeader: {
            flexDirection: 'row',
            alignItems: 'flex-start',
        },
        iconBox: {
            width: s(48),
            height: s(48),
            borderRadius: ms(12),
            justifyContent: 'center',
            alignItems: 'center',
        },
        contentMiddle: {
            flex: 1,
            marginLeft: 12,
        },
        customerName: {
            fontSize: ms(16),
            fontWeight: '700',
            color: '#263238',
            marginBottom: vs(6),
            textTransform: 'uppercase',
        },
        statusRow: {
            flexDirection: 'row',
            marginBottom: 6,
        },
        statusPill: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 2,
            paddingHorizontal: 8,
            borderRadius: 12,
            gap: 6,
        },
        statusDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
        },
        statusText: {
            fontSize: ms(12),
            fontWeight: '600',
        },
        creatorRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
        },
        creatorName: {
            fontSize: ms(12),
            color: '#90A4AE',
        },
        contentRight: {
            alignItems: 'flex-end',
        },
        transactionDate: {
            fontSize: ms(12),
            color: '#90A4AE',
            marginBottom: vs(4),
        },
        expiryDate: {
            fontSize: 11,
            color: '#FF5252',
            fontWeight: '500',
        },
        divider: {
            height: 1,
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: '#ECEFF1',
            marginVertical: 12,
        },
        cardFooter: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        idText: {
            fontSize: 12,
            color: '#B0BEC5',
        },
        amountText: {
            fontSize: ms(16),
            fontWeight: '800',
            color: '#0055D4',
        },
        emptyText: {
            color: '#90A4AE',
            fontSize: 16,
            marginTop: 12,
            fontWeight: '500',
        },
    });
}
