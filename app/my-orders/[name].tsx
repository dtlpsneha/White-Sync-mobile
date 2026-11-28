/**
 * One invoice in My Orders: where it stands, every LR filed for it in Team Chat, and the two
 * things to do with it -- "Ready to dispatch" (the desk: packed, waiting for a lorry) and
 * "Add LR" (opens Team Chat's attach sheet with this invoice already picked).
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { dmy, inr } from '@/components/orders/format';
import { orderTone } from '@/components/orders/tones';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow, StatusColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { InvoiceDetail, OrderStatus, team } from '@/services/teamApi';

const STEPS: { key: OrderStatus; label: string }[] = [
    { key: 'so_pending', label: 'Sales Order' },
    { key: 'invoice_pending', label: 'Confirmed' },
    { key: 'invoice_generated', label: 'Invoice' },
    { key: 'delivery_pending', label: 'Ready' },
    { key: 'dispatched', label: 'Dispatched' },
];

export default function InvoiceScreen() {
    const { name } = useLocalSearchParams<{ name: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const [data, setData] = useState<InvoiceDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const r = await team.invoice(String(name));
        if (!r.ok) { setError(r.error); return; }
        setError(null);
        setData(r.data);
    }, [name]);

    // Coming back from Team Chat after adding an LR: show it.
    useFocusEffect(useCallback(() => { load(); }, [load]));

    const setReady = async (ready: boolean) => {
        setBusy(true);
        const r = await team.readyToDispatch(String(name), ready);
        setBusy(false);
        if (!r.ok) { Alert.alert('Not changed', r.error); return; }
        setData(r.data);
    };

    const row = data?.row;
    const tone = row ? orderTone(row.status, theme) : null;
    const DONE = StatusColors.approved;
    const PLUM = StatusColors.reopen;
    const at = row ? STEPS.findIndex(s => s.key === row.status) : -1;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title={row ? `Invoice ${row.number}` : 'Invoice'}
                subtitle={row ? [row.customer_name, row.salesperson].filter(Boolean).join(' · ') : undefined}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/my-orders' as any))} />

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={load}><Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text></TouchableOpacity>
                </View>
            ) : !row ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
            ) : (
                <ScrollView contentContainerStyle={styles.pad}>
                    <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.cardTop}>
                            <View style={[styles.status, { backgroundColor: tone!.soft }]}>
                                <Text style={[styles.statusText, { color: tone!.text }]}>{row.status_label}</Text>
                            </View>
                            <Text style={[styles.total, { color: colors.text }]}>{inr(row.amount)}</Text>
                        </View>
                        <View style={styles.steps}>
                            {STEPS.map((s, i) => {
                                const done = i <= at;
                                return (
                                    <View key={s.key} style={styles.step}>
                                        <View style={[styles.dot, { backgroundColor: done ? DONE : colors.surfaceVariant }]}>
                                            {done && <Ionicons name="checkmark" size={14} color="#FFF" />}
                                        </View>
                                        <Text style={[styles.stepText, { color: i === at ? colors.text : colors.textSecondary }]}>{s.label}</Text>
                                    </View>
                                );
                            })}
                        </View>
                        <Facts colors={colors} facts={[
                            ['Invoice date', dmy(row.date)], ['Customer PO', row.po_no],
                            ['Sales Order', row.order], ['Sales Invoice', row.sales_invoice || 'not made yet'],
                            ['Payment', row.paid], ['Salesperson', row.salesperson || ''],
                        ]} />
                    </View>

                    <View style={styles.actions}>
                        {row.status === 'invoice_generated' && (
                            <TouchableOpacity disabled={busy} onPress={() => setReady(true)}
                                style={[styles.action, { backgroundColor: PLUM }]}>
                                {busy ? <ActivityIndicator color="#FFF" /> : <>
                                    <Ionicons name="cube" size={18} color="#FFF" />
                                    <Text style={styles.actionText}>Ready to dispatch</Text>
                                </>}
                            </TouchableOpacity>
                        )}
                        {row.status === 'delivery_pending' && (
                            <TouchableOpacity disabled={busy} onPress={() => setReady(false)}
                                style={[styles.action, styles.outline, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                                <Ionicons name="arrow-undo" size={18} color={colors.textSecondary} />
                                <Text style={[styles.actionText, { color: colors.text }]}>Not ready yet</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => router.push({ pathname: '/team', params: { lr: row.name, lrNumber: row.number } } as any)}
                            style={[styles.action, { backgroundColor: colors.primary }]}>
                            <Ionicons name="car" size={18} color="#FFF" />
                            <Text style={styles.actionText}>Add LR</Text>
                        </TouchableOpacity>
                    </View>

                    <Text style={[styles.section, { color: colors.textSecondary }]}>
                        {data!.lrs.length ? `LRs (${data!.lrs.length})` : 'No LR yet'}
                    </Text>
                    {data!.lrs.map((l, i) => {
                        const others = l.invoices.filter(x => x !== row.name).length;
                        return (
                            <TouchableOpacity key={`${l.job_id}-${i}`} activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/team/[id]', params: { id: l.job_id } })}
                                style={[styles.lr, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <View style={[styles.lrEdge, { backgroundColor: DONE }]} />
                                <View style={[styles.lrIcon, { backgroundColor: `${DONE}24` }]}>
                                    <Ionicons name={l.mime?.includes('pdf') ? 'document-text' : 'image'} size={20} color={DONE} />
                                </View>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={[styles.lrNo, { color: colors.text }]}>LR {l.lr_no || '(no number)'}</Text>
                                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {[l.transporter, dmy(l.lr_date), others ? `also ${others} other invoice${others > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ')}
                                    </Text>
                                    <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {[l.filename, l.filed_by ? `by ${l.filed_by}` : '', dmy(l.filed_at)].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} style={{ marginRight: 12 }} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

function Facts({ facts, colors }: { facts: [string, string][]; colors: typeof Colors.light }) {
    return (
        <View style={styles.facts}>
            {facts.filter(([, v]) => v).map(([k, v]) => (
                <View key={k} style={styles.fact}>
                    <Text style={[styles.factKey, { color: colors.textSecondary }]}>{k}</Text>
                    <Text style={[styles.factValue, { color: colors.text }]} numberOfLines={1}>{v}</Text>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 12, paddingBottom: 40 },
    card: { borderWidth: 1, borderRadius: Radius.lg, padding: 16, gap: 16 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    status: { borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
    statusText: { fontSize: 12.5, fontWeight: '800' },
    total: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
    steps: { flexDirection: 'row', justifyContent: 'space-between' },
    step: { alignItems: 'center', gap: 6, flex: 1 },
    dot: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    stepText: { fontSize: 10.5, fontWeight: '700', textAlign: 'center' },
    facts: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
    fact: { width: '50%', paddingRight: 8 },
    factKey: { fontSize: 11, fontWeight: '700' },
    factValue: { fontSize: 14.5, fontWeight: '800', marginTop: 2 },
    actions: { flexDirection: 'row', gap: 10 },
    action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, height: 52 },
    outline: { borderWidth: 1 },
    actionText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
    section: { fontSize: 14, fontWeight: '800', marginTop: 4 },
    lr: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, overflow: 'hidden', paddingVertical: 12 },
    lrEdge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
    lrIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginLeft: 16 },
    lrNo: { fontSize: 14.5, fontWeight: '800' },
    meta: { fontSize: 12, fontWeight: '600' },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, padding: 14, borderWidth: 1, borderRadius: Radius.md },
    noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
