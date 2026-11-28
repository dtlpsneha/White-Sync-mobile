/**
 * My Orders -- every order and invoice of my customers, and where each one stands:
 *
 *   Sales Order Pending → Invoice Pending → Invoice Generated → Dispatched → Delivered
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
import { orderLabel } from '@/components/orders/labels';
import { orderTone } from '@/components/orders/tones';
import { PickerSheet } from '@/components/team/PickerSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandStats } from '@/components/ui/Midnight';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { MyOrders, OrderRow, OrderStatus, team } from '@/services/teamApi';


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
        ...(data?.statuses ?? []).map(s => ({ key: s.key, label: orderLabel(s.key, s.label) })),
    ];

    const count = (k: string) => data?.counts[k] ?? 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="My Orders"
                subtitle={data ? `${count('all')} since ${dmy(data.since)} · ${whose}` : 'Orders and invoices'}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                right={data?.can_see_all && people.length > 0 ? (
                    <TouchableOpacity onPress={() => setPicking(true)} activeOpacity={0.85}
                        style={[styles.scope, salesperson ? { backgroundColor: colors.primary } : null]}>
                        <Ionicons name={salesperson ? 'person' : 'people'} size={15} color="#FFF" />
                        <Text style={styles.scopeText} numberOfLines={1}>{picked ? picked.label : 'All'}</Text>
                        <Ionicons name="chevron-down" size={13} color={colors.onInk} />
                    </TouchableOpacity>
                ) : undefined}
            >
                <BandStats items={[
                    { label: 'To invoice', value: data ? String(count('invoice_pending')) : '—', color: colors.amber },
                    { label: 'To dispatch', value: data ? String(count('invoice_generated')) : '—', color: '#C9A6E3' },
                    { label: 'Delivered', value: data ? String(count('dispatched')) : '—', color: colors.mint },
                ]} />
            </ScreenHeader>

            <View style={styles.top}>
                <View style={[styles.search, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
                    {chips.map(c => {
                        const on = c.key === status;
                        const n = count(c.key ?? 'all');
                        return (
                            <TouchableOpacity key={c.key ?? 'all'} onPress={() => { setLoading(true); setStatus(c.key); }}
                                activeOpacity={0.8}
                                style={[styles.chip, on
                                    ? { backgroundColor: colors.ink, borderColor: colors.ink }
                                    : { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                {c.key && <View style={[styles.chipDot, { backgroundColor: on ? '#FFF' : orderTone(c.key).edge }]} />}
                                <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]}>{c.label}</Text>
                                <Text style={[styles.chipCount, { color: on ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>{n}</Text>
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
                    renderItem={({ item }) => <Row row={item} colors={colors} theme={theme} showSeller={!!data?.can_see_all && !salesperson}
                        onPress={() => router.push(item.kind === 'invoice'
                            ? { pathname: '/my-orders/[name]', params: { name: item.name } }
                            : { pathname: '/sales-orders/[id]', params: { id: item.name, stage: item.status } } as any)} />}
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

function Row({ row, colors, theme, onPress, showSeller }: {
    row: OrderRow; colors: typeof Colors.light; theme: 'light' | 'dark'; onPress: () => void; showSeller?: boolean;
}) {
    const tone = orderTone(row.status, theme);
    const sub = [row.kind === 'invoice' ? `Inv ${row.number}` : row.number,
        row.po_no ? row.po_no : '', dmy(row.date)].filter(Boolean).join(' · ');
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}
            style={[styles.row, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.edge, { backgroundColor: tone.edge }]} />
            <View style={styles.rowBody}>
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>{row.customer_name}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>{sub}</Text>
                    {showSeller && (
                        <Text style={[styles.meta, { color: colors.primaryVariant }]} numberOfLines={1}>
                            {row.salesperson || 'No salesperson'}
                        </Text>
                    )}
                    <View style={styles.tags}>
                        <View style={[styles.tag, { backgroundColor: tone.soft }]}>
                            <Text style={[styles.tagText, { color: tone.text }]}>{orderLabel(row.status, row.status_label)}</Text>
                        </View>
                        {row.lr_count > 1 && (
                            <View style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                                <Text style={[styles.tagText, { color: colors.textSecondary }]}>{row.lr_count} LRs</Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                    <Text style={[styles.amount, { color: colors.text }]}>{inr(row.amount)}</Text>
                    {!!row.paid && row.kind === 'invoice' && (
                        <Text style={[styles.meta, { color: row.paid === 'Paid' ? colors.success : row.paid === 'Overdue' ? colors.danger : colors.textSecondary }]}>
                            {row.paid}
                        </Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    top: { paddingHorizontal: 16, paddingTop: 14, gap: 12, paddingBottom: 2 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, height: 46 },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
    scope: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, height: 38, maxWidth: 110, backgroundColor: '#2A302C' },
    scopeText: { fontSize: 12.5, fontWeight: '800', color: '#FFF', flexShrink: 1 },
    chipBar: { marginHorizontal: -16, flexGrow: 0 },
    chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
    chipDot: { width: 6, height: 6, borderRadius: 3 },
    chipText: { fontSize: 12.5, fontWeight: '700' },
    chipCount: { fontSize: 12, fontWeight: '800' },
    list: { padding: 16, paddingTop: 10, gap: 10, paddingBottom: 40 },
    row: { flexDirection: 'row', borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
    edge: { width: 4 },
    rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
    customer: { fontSize: 14.5, fontWeight: '800' },
    meta: { fontSize: 12, fontWeight: '600' },
    tags: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    tag: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    tagText: { fontSize: 11, fontWeight: '800' },
    amount: { fontSize: 14, fontWeight: '800' },
    empty: { alignItems: 'center', gap: 10, marginTop: 60 },
    emptyText: { fontSize: 14, fontWeight: '600' },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, padding: 14, borderWidth: 1, borderRadius: Radius.md },
    noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
