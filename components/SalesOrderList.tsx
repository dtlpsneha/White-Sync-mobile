import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { apiPost } from '@/utils/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { API_BASE_URL, apiUrl } from '@/constants/config';
import { useResponsive } from '@/hooks/useResponsive';
import Animated from 'react-native-reanimated';
import { enterRow } from '@/constants/motion';

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
    /** Hands the whole fetched list to the parent (filter pills and header figures). */
    onLoaded?: (orders: SalesOrder[]) => void;
}

export type { SalesOrder };

/** Edge / pill colour for an ERPNext Sales Order status (Midnight x Ember). */
export function orderStatusColor(status: string): string {
    const s = (status || '').toUpperCase();
    if (s.includes('CANCEL')) return '#C8423B';
    if (s.includes('DRAFT')) return '#8C8173';
    if (s.includes('COMPLETED') || s.includes('APPROVED') || s.includes('CLOSED')) return '#2F7D5B';
    if (s.includes('TO DELIVER AND BILL')) return '#D99A14';
    if (s.includes('TO BILL')) return '#3E7CB1';
    if (s.includes('TO DELIVER')) return '#8E5BB5';
    return '#D99A14';
}

/** Two letters for the avatar tile: Demo Textiles -> DT. */
function initials(name: string): string {
    const words = (name || '').replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words[1]?.[0] || words[0][1] || '')).toUpperCase();
}

export default function SalesOrderList({ filter = 'All', searchQuery = '', scrollEnabled = true, onLoaded }: SalesOrderListProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
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
                onLoaded?.(deduped);
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

    const renderItem = ({ item, index }: { item: SalesOrder; index: number }) => {
        const status = item.workflow_state || item.status || 'Draft';
        const tone = toneFor(theme, orderStatusColor(status));
        const amount = '₹' + Number(item.grand_total || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
        // The list call returns the date as `date`; the detail call uses `transaction_date`.
        const rawDate = (item as any).date || item.transaction_date || '';
        const [y, m, d] = rawDate.split('-');
        const dateText = y && m && d ? `${d}-${m}-${y}` : rawDate;
        const hasFile = !!(item.attach || (item as any).attach_image);

        return (
            <Animated.View entering={enterRow(index)}>
                <TouchableOpacity
                    style={styles.card}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/sales-orders/${item.name}` as any)}
                >
                    <View style={[styles.edge, { backgroundColor: tone }]} />
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(item.customer)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.customerName} numberOfLines={1}>{item.customer}</Text>
                        <Text style={styles.metaText} numberOfLines={1}>{item.name}</Text>
                        <View style={styles.metaRow}>
                            <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                            <Text style={styles.metaText}>{dateText || 'No date'}</Text>
                            {hasFile ? (
                                <>
                                    <Ionicons name="attach" size={13} color={colors.primaryVariant} />
                                    <Text style={[styles.metaText, { color: colors.primaryVariant, fontWeight: '700' }]}>PO attached</Text>
                                </>
                            ) : null}
                        </View>
                    </View>
                    <View style={styles.right}>
                        <Text style={styles.amountText}>{amount}</Text>
                        <View style={[styles.pill, { backgroundColor: tone + '1F' }]}>
                            <Text style={[styles.pillText, { color: tone }]} numberOfLines={1}>{status}</Text>
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
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1 },
        center: { padding: 40, alignItems: 'center', justifyContent: 'center' },
        listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },
        card: {
            backgroundColor: colors.surface,
            borderRadius: Radius.lg,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.border,
            ...Shadow.card(theme),
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 12,
            paddingLeft: 16,
            paddingRight: 14,
            overflow: 'hidden',
        },
        edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
        avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
        avatarText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
        customerName: { fontSize: ms(14.5), fontWeight: '800', color: colors.text },
        metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
        metaText: { fontSize: 11.5, color: colors.textSecondary, fontWeight: '500', marginTop: 1 },
        right: { alignItems: 'flex-end', gap: 6, maxWidth: '38%' },
        amountText: { fontSize: ms(15), fontWeight: '800', color: colors.text },
        pill: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
        pillText: { fontSize: 10.5, fontWeight: '800' },
        emptyText: { marginTop: 16, fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    });
}
