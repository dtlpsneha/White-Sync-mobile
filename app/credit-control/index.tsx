/**
 * Credit Control -- who owes White & Co. money and how late it is, worked out by SmartOps from
 * ERPNext. A salesperson sees their own customers; managers and the desk see everyone's.
 * Tap a customer for the bills and a reminder message to copy or share.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { inr } from '@/components/orders/format';
import { BandStats } from '@/components/ui/Midnight';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { enterRow } from '@/constants/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ageing, BUCKETS, Credit, loadCredit } from '@/services/creditApi';

type Filter = 'all' | 'overdue' | 'd60' | 'd90';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'd60', label: '60+ days' },
    { key: 'd90', label: '90+ days' },
];

const matches = (a: Ageing, f: Filter) =>
    f === 'all' ? true
        : f === 'overdue' ? a.net_overdue > 1
            : f === 'd60' ? a.d61_90 + a.d90_plus > 1
                : a.d90_plus > 1;

const asOf = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('-') : iso);

export default function CreditControlScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [data, setData] = useState<Credit | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

    const load = useCallback(async (fresh = false) => {
        const r = await loadCredit(fresh);
        setLoading(false);
        setRefreshing(false);
        if (!r.ok) { setError(r.error); return; }
        setError(null);
        setData(r.data);
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data?.rows ?? []).filter(a => matches(a, filter)
            && (!q || a.customer_name.toLowerCase().includes(q) || a.customer.toLowerCase().includes(q)));
    }, [data, query, filter]);

    const count = (f: Filter) => (data?.rows ?? []).filter(a => matches(a, f)).length;
    const t = data?.totals;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Credit Control"
                subtitle={data ? `${data.customers} customer${data.customers === 1 ? '' : 's'} owe money · ${data.scope === 'mine' ? 'my customers' : 'all customers'}` : 'Who owes what'}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            >
                <BandStats items={[
                    { label: 'Outstanding', value: t ? inr(t.outstanding).replace('.00', '') : '—', flex: 1.2 },
                    { label: 'Overdue', value: t ? inr(t.overdue).replace('.00', '') : '—', color: colors.amber, flex: 1.2 },
                    { label: 'Still owed', value: t ? inr(t.net_overdue).replace('.00', '') : '—', color: '#F07A55', flex: 1.2 },
                ]} />
            </ScreenHeader>

            <View style={styles.top}>
                <View style={[styles.search, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.textSecondary} />
                    <TextInput style={[styles.searchInput, { color: colors.text }]} value={query} onChangeText={setQuery}
                        placeholder="Customer name" placeholderTextColor={colors.placeholder} autoCorrect={false} />
                    {!!query && (
                        <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                {/* Matching payments to bills is accounts work: not offered to salespeople. */}
                {data?.scope === 'all' && (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/payment-matching' as any)}
                        style={[styles.matchCard, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={[styles.matchIcon, { backgroundColor: colors.ink }]}>
                            <Ionicons name="git-compare" size={18} color="#E4572E" />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.matchTitle, { color: colors.text }]}>Payment matching</Text>
                            <Text style={[styles.matchSub, { color: colors.textSecondary }]} numberOfLines={1}>
                                Which bill each payment pays — approve or reject
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
                <View style={styles.chips}>
                    {FILTERS.map(f => {
                        const on = f.key === filter;
                        return (
                            <TouchableOpacity key={f.key} onPress={() => setFilter(f.key)} activeOpacity={0.8}
                                style={[styles.chip, on
                                    ? { backgroundColor: colors.ink, borderColor: colors.ink }
                                    : { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]} numberOfLines={1}>{f.label}</Text>
                                {data && <Text style={[styles.chipCount, { color: on ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>{count(f.key)}</Text>}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : loading && !data ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
            ) : (
                <FlatList
                    data={rows}
                    keyExtractor={a => a.customer}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
                        onRefresh={() => { setRefreshing(true); load(true); }} />}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="wallet-outline" size={44} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {query ? `Nothing matches “${query}”.` : data?.customers === 0 ? 'Nobody owes anything open.' : 'No customer in this group.'}
                            </Text>
                        </View>
                    }
                    ListFooterComponent={data ? (
                        <Text style={[styles.footer, { color: colors.textSecondary }]}>
                            As of {asOf(data.as_of)} · from ERPNext · pull down to read it again
                        </Text>
                    ) : undefined}
                    renderItem={({ item, index }) => (
                        <Animated.View entering={enterRow(index)}>
                            <Row a={item} colors={colors} theme={theme}
                                onPress={() => router.push({ pathname: '/credit-control/[customer]', params: { customer: item.customer } } as any)} />
                        </Animated.View>
                    )}
                />
            )}
        </View>
    );
}

function Row({ a, colors, theme, onPress }: { a: Ageing; colors: typeof Colors.light; theme: 'light' | 'dark'; onPress: () => void }) {
    // The edge colour is the worst group this customer has money in.
    const worst = [...BUCKETS].reverse().find(b => (a as any)[b.key] > 1);
    const edge = toneFor(theme, worst?.hex ?? '#2F7D5B');
    const late = a.oldest_days_overdue > 0;
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}
            style={[styles.row, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.edge, { backgroundColor: edge }]} />
            <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>{a.customer_name}</Text>
                        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                            {a.invoices} bill{a.invoices === 1 ? '' : 's'}{late ? ` · oldest ${a.oldest_days_overdue} days late` : ' · none late'}
                        </Text>
                    </View>
                    <View style={styles.amounts}>
                        <Text style={[styles.amount, { color: colors.text }]} numberOfLines={1}>{inr(a.outstanding).replace('.00', '')}</Text>
                        {a.net_overdue > 1 ? (
                            <Text style={[styles.meta, { color: toneFor(theme, '#E4572E'), fontWeight: '800' }]} numberOfLines={1}>
                                {inr(a.net_overdue).replace('.00', '')} still owed
                            </Text>
                        ) : (
                            <Text style={[styles.meta, { color: toneFor(theme, '#2F7D5B'), fontWeight: '800' }]}>nothing overdue</Text>
                        )}
                    </View>
                </View>
                {/* How the unpaid money splits by lateness */}
                <View style={styles.bar}>
                    {BUCKETS.map(b => {
                        const v = (a as any)[b.key] as number;
                        return v > 1 ? <View key={b.key} style={{ flex: v, backgroundColor: toneFor(theme, b.hex) }} /> : null;
                    })}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    top: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
    matchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.lg, padding: 12 },
    matchIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    matchTitle: { fontSize: 14, fontWeight: '800' },
    matchSub: { fontSize: 11.5, fontWeight: '600', marginTop: 1 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: 6 },
    chipText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
    chipCount: { fontSize: 11, fontWeight: '700' },
    list: { padding: 16, paddingBottom: 60, gap: 10 },
    row: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', flexDirection: 'row' },
    edge: { width: 4 },
    rowBody: { flex: 1, padding: 14, gap: 10 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    customer: { fontSize: 14.5, fontWeight: '800' },
    meta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    amounts: { alignItems: 'flex-end', maxWidth: '45%' },
    amount: { fontSize: 15, fontWeight: '900' },
    bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
    notice: { margin: 16, borderWidth: 1, borderRadius: Radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    noticeText: { flex: 1, fontSize: 13, fontWeight: '600' },
    empty: { alignItems: 'center', gap: 10, paddingTop: 50 },
    emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
    footer: { textAlign: 'center', fontSize: 11.5, fontWeight: '600', paddingTop: 8 },
});
