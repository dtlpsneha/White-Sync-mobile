/**
 * My Orders -- every order and invoice of my customers, and where each one stands:
 *
 *   Sales Order Pending → Invoice Pending → Invoice Generated → Delivery Pending → Dispatched
 *
 * Worked out by SmartOps from ERPNext (app/web/my_orders.py). A salesperson sees their own
 * customers; the desk and managers see everyone's, and can pick one salesperson's -- or the
 * customers with none. Tap an invoice to see its LRs, mark it ready to dispatch, or add an LR.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { dmy, inr } from '@/components/orders/format';
import { PickerSheet } from '@/components/team/PickerSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MyOrders, ORDER_COLORS, ORDER_ICONS, OrderRow, OrderStatus, team } from '@/services/teamApi';


export default function MyOrdersScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [status, setStatus] = useState<OrderStatus | null>(null);
    const [salesperson, setSalesperson] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [query, setQuery] = useState('');
    const [data, setData] = useState<MyOrders | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const asked = useRef(0);

    const load = useCallback(async (s: OrderStatus | null, sp: string | null, q: string) => {
        const mine = ++asked.current;
        const r = await team.myOrders({ status: s, salesperson: sp, q });
        if (mine !== asked.current) return;
        setLoading(false);
        setRefreshing(false);
        if (!r.ok) { setError(r.error); return; }
        setError(null);
        setData(r.data);
    }, []);

    useEffect(() => {
        const h = setTimeout(() => load(status, salesperson, query), query ? 350 : 0);
        return () => clearTimeout(h);
    }, [status, salesperson, query, load]);

    // Back from an invoice (ready to dispatch, an LR added): show it.
    useFocusEffect(useCallback(() => { load(status, salesperson, query); }, [status, salesperson, query, load]));

    const people = data?.salespeople ?? [];
    const everyone = people.reduce((n, p) => n + p.count, 0);
    const picked = people.find(p => p.key === salesperson);
    const whose = !data ? '' : !data.can_see_all ? 'my customers' : picked ? picked.label : 'all salespeople';

    const chips: { key: OrderStatus | null; label: string }[] = [
        { key: null, label: 'All' },
        ...(data?.statuses ?? []).map(s => ({ key: s.key, label: s.label })),
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="My Orders"
                subtitle={data ? `${data.counts.all ?? 0} since ${dmy(data.since)} · ${whose}` : 'Orders and invoices'}
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            />

            <View style={styles.top}>
                <View style={styles.searchRow}>
                    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="search" size={18} color={colors.textSecondary} />
                        <TextInput style={[styles.searchInput, { color: colors.text }]} value={query} onChangeText={setQuery}
                            placeholder="Customer, invoice no., PO no." placeholderTextColor={colors.placeholder}
                            autoCorrect={false} />
                        {!!query && (
                            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                    {data?.can_see_all && people.length > 0 && (
                        <TouchableOpacity onPress={() => setPicking(true)}
                            style={[styles.scope, {
                                borderColor: colors.primary,
                                backgroundColor: salesperson ? colors.primary : colors.surface,
                            }]}>
                            <Ionicons name={salesperson ? 'person' : 'people'} size={16} color={salesperson ? '#FFF' : colors.primary} />
                            <Text style={[styles.scopeText, { color: salesperson ? '#FFF' : colors.primary }]} numberOfLines={1}>
                                {picked ? picked.label : 'All'}
                            </Text>
                            <Ionicons name="chevron-down" size={14} color={salesperson ? '#FFF' : colors.primary} />
                        </TouchableOpacity>
                    )}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {chips.map(c => {
                        const on = c.key === status;
                        const tint = c.key ? ORDER_COLORS[c.key] : colors.primary;
                        const n = data?.counts[c.key ?? 'all'] ?? 0;
                        return (
                            <TouchableOpacity key={c.key ?? 'all'} onPress={() => { setLoading(true); setStatus(c.key); }}
                                activeOpacity={0.8}
                                style={[styles.chip, { backgroundColor: on ? tint : colors.surface, borderColor: on ? tint : colors.border }]}>
                                {c.key && <Ionicons name={ORDER_ICONS[c.key] as any} size={14} color={on ? '#FFF' : tint} />}
                                <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]}>{c.label}</Text>
                                <Text style={[styles.chipCount, { color: on ? '#FFF' : colors.textSecondary }]}>{n}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={() => { setLoading(true); load(status, salesperson, query); }}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : loading && !data ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
            ) : (
                <FlatList
                    data={data?.rows ?? []}
                    keyExtractor={r => `${r.kind}-${r.name}`}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
                        onRefresh={() => { setRefreshing(true); load(status, salesperson, query); }} />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="cart-outline" size={44} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {query ? `Nothing matches “${query}”.` : data ? `No orders since ${dmy(data.since)}.` : ''}
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => <Row row={item} colors={colors} showSeller={!!data?.can_see_all && !salesperson}
                        onPress={() => router.push(item.kind === 'invoice'
                            ? { pathname: '/my-orders/[name]', params: { name: item.name } }
                            : { pathname: '/sales-orders/[id]', params: { id: item.name } } as any)} />}
                />
            )}

            <PickerSheet
                visible={picking}
                title="Whose orders"
                selected={salesperson ?? '*'}
                options={[
                    { value: '*', label: 'All salespeople', hint: `${everyone}` },
                    ...people.map(p => ({ value: p.key, label: p.label, hint: `${p.count}` })),
                ]}
                onPick={v => { setLoading(true); setSalesperson(v === '*' ? null : v); setPicking(false); }}
                onClose={() => setPicking(false)}
            />
        </View>
    );
}

function Row({ row, colors, onPress, showSeller }: { row: OrderRow; colors: typeof Colors.light; onPress: () => void; showSeller?: boolean }) {
    const tint = ORDER_COLORS[row.status];
    const sub = [row.kind === 'invoice' ? `Invoice ${row.number}` : `Order ${row.number}`,
        row.po_no ? `PO ${row.po_no}` : '', dmy(row.date)].filter(Boolean).join(' · ');
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}
            style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.icon, { backgroundColor: `${tint}1A` }]}>
                <Ionicons name={ORDER_ICONS[row.status] as any} size={22} color={tint} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>{row.customer_name}</Text>
                <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
                {showSeller && (
                    <Text style={[styles.meta, { color: colors.primary }]} numberOfLines={1}>
                        {row.salesperson || 'No salesperson'}
                    </Text>
                )}
                <View style={styles.tags}>
                    <View style={[styles.tag, { backgroundColor: `${tint}1A` }]}>
                        <Text style={[styles.tagText, { color: tint }]}>{row.status_label}</Text>
                    </View>
                    {row.lr_count > 1 && (
                        <View style={[styles.tag, { backgroundColor: `${tint}1A` }]}>
                            <Text style={[styles.tagText, { color: tint }]}>{row.lr_count} LRs</Text>
                        </View>
                    )}
                    {!!row.paid && row.kind === 'invoice' && (
                        <Text style={[styles.meta, { color: row.paid === 'Paid' ? colors.success : colors.textSecondary }]}>{row.paid}</Text>
                    )}
                </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.amount, { color: colors.text }]}>{inr(row.amount)}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    top: { paddingHorizontal: 14, paddingTop: 12, gap: 10 },
    searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, height: 44 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
    scope: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, height: 44, maxWidth: 150 },
    scopeText: { fontSize: 13, fontWeight: '800' },
    chips: { gap: 8, paddingBottom: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 13, fontWeight: '700' },
    chipCount: { fontSize: 12, fontWeight: '800' },
    list: { padding: 14, gap: 10, paddingBottom: 40 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: 12 },
    icon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    customer: { fontSize: 15, fontWeight: '800' },
    meta: { fontSize: 12.5, fontWeight: '600' },
    tags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    tag: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    tagText: { fontSize: 11.5, fontWeight: '800' },
    amount: { fontSize: 14, fontWeight: '800' },
    empty: { alignItems: 'center', gap: 10, marginTop: 60 },
    emptyText: { fontSize: 14, fontWeight: '600' },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, padding: 14, borderWidth: 1, borderRadius: Radius.md },
    noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
