import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiPost } from '@/utils/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { API_BASE_URL, apiUrl } from '@/constants/config';
import { useResponsive } from '@/hooks/useResponsive';
import Animated, { FadeInDown } from 'react-native-reanimated';

const IMAGE_HOST = API_BASE_URL;

interface SalesOrderItem {
    item_code: string;
    delivery_date: string;
    qty: number;
    rate: number;
    amount: number;
}

interface SalesOrder {
    name: string;
    customer: string;
    status: string;
    transaction_date: string;
    grand_total: number;
    items?: SalesOrderItem[];
    workflow_state?: string;
    dashboard_category?: string;
    attach?: string | null;
}

interface SalesOrderListProps {
    filter?: string;
    searchQuery?: string;
    scrollEnabled?: boolean;
}

export default function SalesOrderList({ filter = 'All', searchQuery = '', scrollEnabled = true }: SalesOrderListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const { s, vs, ms } = useResponsive();
    const styles = useMemo(() => getStyles(theme, { s, vs, ms }), [theme, s, vs, ms]);

    // Raw server list — filtering and searching happen locally against this.
    const [allSalesOrders, setAllSalesOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Fetch once; `filter`/`searchQuery` are applied client-side below, so
    // having them here re-downloaded the whole list on every keystroke.
    useEffect(() => {
        fetchSalesOrders();
    }, []);

    const fetchSalesOrders = async () => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const url = apiUrl('/api/method/get_sales_order_resource');

            // For now passing empty object as per Postman screenshot
            const res = await apiPost(url, {}, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message && data.message.success && Array.isArray(data.message.data)) {
                // Drop repeated records — duplicates collide in keyExtractor.
                const seen = new Set<string>();
                const deduped = (data.message.data as SalesOrder[]).filter(so => {
                    if (!so?.name || seen.has(so.name)) return false;
                    seen.add(so.name);
                    return true;
                });

                setAllSalesOrders(deduped);
            }
        } catch (error) {
            console.error('Error fetching sales orders:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const salesOrders = useMemo(() => {
        let filtered = allSalesOrders;

        if (filter !== 'All') {
            const targetFormatted = filter.toUpperCase();
            filtered = filtered.filter(so => {
                const rawStatus = (so.workflow_state || so.status || '').toUpperCase();

                if (targetFormatted === 'PENDING') return rawStatus.includes('OPEN') || rawStatus.includes('PENDING');
                if (targetFormatted === 'APPROVED') return rawStatus.includes('APPROVED') || rawStatus.includes('ORDERED');
                if (targetFormatted === 'CANCELLED') return rawStatus.includes('CANCELLED');
                if (targetFormatted === 'DRAFT') return rawStatus.includes('DRAFT');

                return rawStatus.includes(targetFormatted);
            });
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(so =>
                (so.name || '').toLowerCase().includes(query) ||
                (so.customer || '').toLowerCase().includes(query)
            );
        }

        return filtered;
    }, [allSalesOrders, filter, searchQuery]);

    const getStatusColors = (status: string) => {
        const s = (status || '').toUpperCase();
        switch (s) {
            case 'COMPLETED':
            case 'APPROVED':
                return { bg: 'rgba(0, 191, 165, 0.1)', text: '#00BFA5', border: 'rgba(0, 191, 165, 0.2)' };
            case 'DRAFT':
                return { bg: 'rgba(148, 163, 184, 0.1)', text: '#64748B', border: 'rgba(148, 163, 184, 0.2)' };
            case 'CANCELLED':
                return { bg: 'rgba(198, 40, 40, 0.1)', text: '#C62828', border: 'rgba(198, 40, 40, 0.2)' };
            default:
                return { bg: 'rgba(2, 119, 189, 0.1)', text: '#0277BD', border: 'rgba(2, 119, 189, 0.2)' };
        }
    };

    const renderItem = ({ item, index }: { item: SalesOrder; index: number }) => {
        const statusConfig = getStatusColors(item.workflow_state || item.status);
        const formattedAmount = Number(item.grand_total).toLocaleString('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).replace('INR', '₹');

        return (
            <Animated.View entering={FadeInDown.delay(100 + (index % 5) * 50).springify()}>
                <TouchableOpacity 
                    style={styles.card} 
                    activeOpacity={0.7}
                    onPress={() => router.push(`/sales-orders/${item.name}` as any)}
                >
                    <View style={[styles.statusAccent, { backgroundColor: statusConfig.text }]} />
                    <View style={styles.cardContent}>
                        <View style={styles.cardHeader}>
                            <View style={styles.idBadge}>
                                <Text style={styles.idText}>#{item.name}</Text>
                            </View>
                            <View style={[styles.statusPill, { backgroundColor: statusConfig.bg + '10', borderColor: statusConfig.border }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusConfig.text }]} />
                                <Text style={[styles.statusText, { color: statusConfig.text }]}>
                                    {item.workflow_state || item.status}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.cardBody}>
                            <View style={styles.customerRow}>
                                {item.attach || (item as any).attach_image ? (
                                    <View style={styles.thumbnailContainer}>
                                        {(item.attach || (item as any).attach_image || '').toLowerCase().endsWith('.pdf') ? (
                                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary + '10' }}>
                                                <Ionicons name="document-text" size={24} color={colors.primary} />
                                            </View>
                                        ) : (
                                            <Image 
                                                source={{ uri: (item.attach || (item as any).attach_image || '').startsWith('http') ? (item.attach || (item as any).attach_image || '') : `${IMAGE_HOST}${(item.attach || (item as any).attach_image || '')}` }} 
                                                style={styles.thumbnail} 
                                            />
                                        )}
                                    </View>
                                ) : (
                                    <View style={styles.iconContainer}>
                                        <Ionicons name="cart" size={16} color={colors.primary} />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.customerName} numberOfLines={1}>{item.customer}</Text>
                                    <View style={styles.dateRow}>
                                        <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                                        <Text style={styles.dateText}>{item.transaction_date}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>

                        <View style={styles.cardFooter}>
                            <View style={styles.amountContainer}>
                                <Text style={styles.amountLabel}>Total Value</Text>
                                <Text style={[styles.amountText, { color: statusConfig.text }]}>{formattedAmount}</Text>
                            </View>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (salesOrders.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="cart-outline" size={64} color={colors.surfaceVariant} />
                <Text style={styles.emptyText}>No sales orders found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={salesOrders}
                renderItem={renderItem}
                keyExtractor={item => item.name}
                scrollEnabled={scrollEnabled}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchSalesOrders(); }} tintColor={colors.primary} />
                }
            />
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1 },
        center: { padding: 40, alignItems: 'center', justifyContent: 'center' },
        listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
        card: {
            backgroundColor: colors.surface,
            borderRadius: 24,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.04,
            shadowRadius: 14,
            elevation: 4,
            flexDirection: 'row',
            overflow: 'hidden',
        },
        statusAccent: { width: 5, height: '100%' },
        cardContent: { flex: 1, padding: 16 },
        cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
        idBadge: { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
        idText: { fontSize: 10, color: colors.textSecondary, fontWeight: '800' },
        statusPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1 },
        statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
        statusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
        cardBody: { marginBottom: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#F8FAFC', borderRadius: 16, padding: 12 },
        customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        thumbnailContainer: { width: 44, height: 44, borderRadius: 12, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9' },
        thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' },
        iconContainer: { width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? 'rgba(0, 191, 165, 0.1)' : '#F0FDFA', justifyContent: 'center', alignItems: 'center' },
        customerName: { fontSize: ms(16), fontWeight: '900', color: colors.text, textTransform: 'uppercase' },
        dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
        dateText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
        cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
        amountContainer: { gap: 2 },
        amountLabel: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase' },
        amountText: { fontSize: ms(20), fontWeight: '900', color: '#00BFA5' },
        emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: colors.textSecondary }
    });
}

