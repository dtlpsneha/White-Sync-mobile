/**
 * Payment Matching -- Tally payments ERPNext could not settle, with the bill SmartOps thinks
 * each one pays, how sure it is and why. A person approves or rejects; that is recorded in
 * SmartOps only. Not for salespeople.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';

import { dmy, inr } from '@/components/orders/format';
import { BandStats } from '@/components/ui/Midnight';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { enterRow } from '@/constants/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CONFIDENCE, Confidence, Match, Reconciliation, loadRecon } from '@/services/reconApi';

type Tab = Confidence | 'decided';

const TABS: { key: Tab; label: string }[] = [
    { key: 'strong', label: 'Strong' },
    { key: 'likely', label: 'Likely' },
    { key: 'weak', label: 'Weak' },
    { key: 'decided', label: 'Decided' },
];

const isDecided = (m: Match) => !!m.decision?.current;
const inTab = (m: Match, t: Tab) => (t === 'decided' ? isDecided(m) : !isDecided(m) && m.confidence === t);

export default function PaymentMatchingScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [data, setData] = useState<Reconciliation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refused, setRefused] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<Tab>('strong');
    const [query, setQuery] = useState('');

    const load = useCallback(async (fresh = false) => {
        const r = await loadRecon(fresh);
        setLoading(false);
        setRefreshing(false);
        if (!r.ok) { setRefused(r.status === 403); setError(r.error); return; }
        setError(null);
        setRefused(false);
        setData(r.data);
    }, []);

    // On every focus, so coming back from a receipt shows the decision just made.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const count = (t: Tab) => (data?.matches ?? []).filter(m => inTab(m, t)).length;
    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data?.matches ?? []).filter(m => inTab(m, tab)
            && (!q || m.customer_name.toLowerCase().includes(q) || m.printed_customer.toLowerCase().includes(q)
                || m.reference.toLowerCase().includes(q)));
    }, [data, tab, query]);

    const back = () => (router.canGoBack() ? router.back() : router.replace('/credit-control' as any));
    const noMatchTotal = (data?.no_match ?? []).reduce((n, c) => n + c.count, 0);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Payment Matching"
                subtitle={data ? `${data.receipts} payments ERPNext could not settle` : 'Which bill does each payment pay?'}
                align="left"
                onBack={back}
            >
                <BandStats items={[
                    { label: 'Strong', value: data ? String(count('strong')) : '—', color: colors.mint },
                    { label: 'Likely', value: data ? String(count('likely')) : '—', color: colors.amber },
                    { label: 'Weak', value: data ? String(count('weak')) : '—', color: '#F07A55' },
                ]} />
            </ScreenHeader>

            {refused ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="lock-closed-outline" size={22} color={colors.textSecondary} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>Payment matching is for accounts and managers.</Text>
                </View>
            ) : error ? (
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
                <>
                    <View style={styles.top}>
                        <View style={[styles.search, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Ionicons name="search" size={18} color={colors.textSecondary} />
                            <TextInput style={[styles.searchInput, { color: colors.text }]} value={query} onChangeText={setQuery}
                                placeholder="Customer or reference" placeholderTextColor={colors.placeholder} autoCorrect={false} />
                            {!!query && (
                                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                                    <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.chips}>
                            {TABS.map(t => {
                                const on = t.key === tab;
                                return (
                                    <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} activeOpacity={0.8}
                                        style={[styles.chip, on
                                            ? { backgroundColor: colors.ink, borderColor: colors.ink }
                                            : { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]} numberOfLines={1}>{t.label}</Text>
                                        <Text style={[styles.chipCount, { color: on ? 'rgba(255,255,255,0.6)' : colors.textSecondary }]}>{count(t.key)}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        {tab !== 'decided' && (
                            <Text style={[styles.hint, { color: colors.textSecondary }]}>{CONFIDENCE[tab].hint}</Text>
                        )}
                    </View>

                    <FlatList
                        data={rows}
                        keyExtractor={m => m.receipt}
                        contentContainerStyle={styles.list}
                        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
                            onRefresh={() => { setRefreshing(true); load(true); }} />}
                        ListEmptyComponent={
                            <View style={styles.empty}>
                                <Ionicons name="checkmark-done-outline" size={44} color={colors.textSecondary} />
                                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                    {query ? `Nothing matches “${query}”.` : tab === 'decided' ? 'No decisions yet.' : 'Nothing left to check here.'}
                                </Text>
                            </View>
                        }
                        ListFooterComponent={data && noMatchTotal > 0 ? (
                            <View style={[styles.noMatch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Text style={[styles.noMatchTitle, { color: colors.text }]}>No match found for {noMatchTotal} payments</Text>
                                {data.no_match.map(c => (
                                    <View key={c.key} style={styles.noMatchRow}>
                                        <Text style={[styles.noMatchLabel, { color: colors.textSecondary }]} numberOfLines={2}>{c.label}</Text>
                                        <Text style={[styles.noMatchCount, { color: colors.text }]}>{c.count}</Text>
                                    </View>
                                ))}
                                <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 6 }]}>
                                    These stay as they are: advances, or bills ERPNext never had.
                                </Text>
                            </View>
                        ) : undefined}
                        renderItem={({ item, index }) => (
                            <Animated.View entering={enterRow(index)}>
                                <Row m={item} colors={colors} theme={theme}
                                    onPress={() => router.push({ pathname: '/payment-matching/[receipt]', params: { receipt: item.receipt } } as any)} />
                            </Animated.View>
                        )}
                    />
                </>
            )}
        </View>
    );
}

function Row({ m, colors, theme, onPress }: { m: Match; colors: typeof Colors.light; theme: 'light' | 'dark'; onPress: () => void }) {
    const tone = toneFor(theme, CONFIDENCE[m.confidence].hex);
    const d = m.decision?.current ? m.decision : null;
    const bills = m.allocations.map(a => a.voucher_number).join(', ');
    return (
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}
            style={[styles.row, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.edge, { backgroundColor: tone }]} />
            <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.customer, { color: colors.text }]} numberOfLines={1}>{m.customer_name}</Text>
                        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                            {dmy(m.date)} · {m.reference || 'no reference'}
                        </Text>
                    </View>
                    <Text style={[styles.amount, { color: colors.text }]} numberOfLines={1}>{inr(m.amount).replace('.00', '')}</Text>
                </View>
                <Text style={[styles.why, { color: colors.textSecondary }]} numberOfLines={2}>
                    {bills ? `→ ${bills}. ` : ''}{m.why}
                </Text>
                <View style={styles.tags}>
                    <View style={[styles.pill, { backgroundColor: tone + '22' }]}>
                        <Text style={[styles.pillText, { color: tone }]}>{CONFIDENCE[m.confidence].label}</Text>
                    </View>
                    {d && (
                        <View style={[styles.pill, { backgroundColor: (d.decision === 'approved' ? toneFor(theme, '#2F7D5B') : toneFor(theme, '#8C8173')) + '22' }]}>
                            <Text style={[styles.pillText, { color: d.decision === 'approved' ? toneFor(theme, '#2F7D5B') : toneFor(theme, '#8C8173') }]}>
                                {d.decision === 'approved' ? 'Approved' : 'Rejected'} · {d.decided_by}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    top: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0 },
    chips: { flexDirection: 'row', gap: 8 },
    chip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: Radius.pill, paddingVertical: 8, paddingHorizontal: 6 },
    chipText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
    chipCount: { fontSize: 11, fontWeight: '700' },
    hint: { fontSize: 11.5, fontWeight: '600' },
    list: { padding: 16, paddingBottom: 60, gap: 10 },
    row: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', flexDirection: 'row' },
    edge: { width: 4 },
    rowBody: { flex: 1, padding: 14, gap: 8 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    customer: { fontSize: 14.5, fontWeight: '800' },
    meta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    amount: { fontSize: 15, fontWeight: '900', maxWidth: '38%' },
    why: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    pill: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    pillText: { fontSize: 10.5, fontWeight: '800' },
    notice: { margin: 16, borderWidth: 1, borderRadius: Radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    noticeText: { flex: 1, fontSize: 13, fontWeight: '600' },
    empty: { alignItems: 'center', gap: 10, paddingTop: 50 },
    emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
    noMatch: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 6, marginTop: 6 },
    noMatchTitle: { fontSize: 13.5, fontWeight: '800' },
    noMatchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    noMatchLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
    noMatchCount: { fontSize: 13, fontWeight: '800' },
});
