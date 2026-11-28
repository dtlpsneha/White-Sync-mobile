/**
 * One customer's money: where it stands by lateness, every open bill, and a reminder message
 * SmartOps has written. A person copies or shares the reminder -- the app never sends it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { dmy, inr } from '@/components/orders/format';
import { BandStats, SectionCard } from '@/components/ui/Midnight';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ageing, BUCKETS, Chaser, lastCredit, loadChaser, loadCredit } from '@/services/creditApi';

export default function CreditCustomerScreen() {
    const { customer } = useLocalSearchParams<{ customer: string }>();
    const id = Array.isArray(customer) ? customer[0] : customer;
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [row, setRow] = useState<Ageing | null>(() => lastCredit()?.rows.find(r => r.customer === id) ?? null);
    const [chaser, setChaser] = useState<Chaser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        const [c, credit] = await Promise.all([loadChaser(id), row ? Promise.resolve(null) : loadCredit()]);
        if (credit?.ok) setRow(credit.data.rows.find(r => r.customer === id) ?? null);
        setLoading(false);
        if (!c.ok) { setError(c.error); return; }
        setError(null);
        setChaser(c.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const back = () => (router.canGoBack() ? router.back() : router.replace('/credit-control' as any));
    const name = chaser?.customer_name || row?.customer_name || id || 'Customer';
    const overdueBills = (chaser?.invoices ?? []).filter(i => i.days_overdue > 0);

    const copy = async () => {
        if (!chaser) return;
        try {
            await Clipboard.setStringAsync(chaser.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            Alert.alert('Not copied', 'Could not copy the message. Use Share instead.');
        }
    };

    const share = async () => {
        if (!chaser) return;
        try { await Share.share({ message: chaser.text }); } catch { /* closed without sharing */ }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title={name} subtitle="Credit Control" align="left" onBack={back}>
                {row && (
                    <BandStats items={[
                        { label: 'Outstanding', value: inr(row.outstanding).replace('.00', ''), flex: 1.2 },
                        { label: 'Overdue', value: inr(row.overdue).replace('.00', ''), color: colors.amber, flex: 1.2 },
                        { label: 'Still owed', value: inr(row.net_overdue).replace('.00', ''), color: '#F07A55', flex: 1.2 },
                    ]} />
                )}
            </ScreenHeader>

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={load}><Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text></TouchableOpacity>
                </View>
            ) : loading && !chaser ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
            ) : (
                <ScrollView contentContainerStyle={styles.pad}>
                    {row && (
                        <SectionCard icon="stats-chart" title="Where the money stands" subtitle="By how late each bill is">
                            {BUCKETS.map(b => {
                                const v = (row as any)[b.key] as number;
                                return (
                                    <View key={b.key} style={styles.bucket}>
                                        <View style={[styles.dot, { backgroundColor: toneFor(theme, b.hex), opacity: v > 1 ? 1 : 0.3 }]} />
                                        <Text style={[styles.bucketLabel, { color: v > 1 ? colors.text : colors.textSecondary }]}>{b.label}</Text>
                                        <Text style={[styles.bucketValue, { color: v > 1 ? colors.text : colors.textSecondary }]}>{v > 1 ? inr(v) : '—'}</Text>
                                    </View>
                                );
                            })}
                            {row.unallocated_receipts > 1 && (
                                <View style={[styles.credit, { backgroundColor: toneFor(theme, '#2F7D5B') + '1A', borderColor: toneFor(theme, '#2F7D5B') + '55' }]}>
                                    <Ionicons name="information-circle-outline" size={16} color={toneFor(theme, '#2F7D5B')} />
                                    <Text style={[styles.creditText, { color: colors.text }]}>
                                        {inr(row.unallocated_receipts)} was received from this customer but is not set against a bill yet,
                                        so “Still owed” is {inr(row.net_overdue)} and not {inr(row.overdue)}.
                                    </Text>
                                </View>
                            )}
                        </SectionCard>
                    )}

                    <SectionCard icon="receipt" title="Open bills" subtitle={chaser ? `${chaser.invoices.length} unpaid` : undefined}>
                        {(chaser?.invoices ?? []).map(i => {
                            const late = i.days_overdue > 0;
                            const tone = toneFor(theme, late ? (i.days_overdue > 60 ? '#C8423B' : '#D99A14') : '#2F7D5B');
                            return (
                                <View key={i.invoice} style={[styles.bill, { borderTopColor: colors.border }]}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.billNo, { color: colors.text }]} numberOfLines={1}>Bill {i.voucher_number || i.invoice}</Text>
                                        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
                                            {dmy(i.posting_date)} · due {dmy(i.due_date || i.posting_date)}
                                        </Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                        <Text style={[styles.billAmount, { color: colors.text }]}>{inr(i.outstanding)}</Text>
                                        <View style={[styles.pill, { backgroundColor: tone + '22' }]}>
                                            <Text style={[styles.pillText, { color: tone }]}>{late ? `${i.days_overdue} days late` : 'not due'}</Text>
                                        </View>
                                    </View>
                                </View>
                            );
                        })}
                    </SectionCard>

                    <SectionCard icon="chatbox-ellipses" title="Reminder message" subtitle="Written by SmartOps; you send it">
                        {overdueBills.length === 0 || !chaser ? (
                            <Text style={[styles.meta, { color: colors.textSecondary }]}>Nothing is overdue, so there is nothing to remind them about.</Text>
                        ) : (
                            <>
                                <View style={[styles.letter, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                                    <Text selectable style={[styles.letterText, { color: colors.text }]}>{chaser.text}</Text>
                                </View>
                                <View style={styles.actions}>
                                    <TouchableOpacity onPress={copy} activeOpacity={0.85}
                                        style={[styles.btn, { backgroundColor: colors.ink }]}>
                                        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color="#FFF" />
                                        <Text style={styles.btnText}>{copied ? 'Copied' : 'Copy'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={share} activeOpacity={0.85}
                                        style={[styles.btn, { backgroundColor: colors.primary }]}>
                                        <Ionicons name="share-social-outline" size={17} color="#FFF" />
                                        <Text style={styles.btnText}>Share</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={[styles.meta, { color: colors.textSecondary }]}>
                                    Share opens WhatsApp, email or any app you choose. Nothing is sent from here.
                                </Text>
                            </>
                        )}
                    </SectionCard>
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, paddingBottom: 60, gap: 14 },
    bucket: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    bucketLabel: { flex: 1, fontSize: 13, fontWeight: '700' },
    bucketValue: { fontSize: 13.5, fontWeight: '800' },
    credit: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: Radius.md, padding: 10, marginTop: 8 },
    creditText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
    bill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
    billNo: { fontSize: 13.5, fontWeight: '800' },
    billAmount: { fontSize: 14, fontWeight: '900' },
    meta: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    pill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    pillText: { fontSize: 10.5, fontWeight: '800' },
    letter: { borderWidth: 1, borderRadius: Radius.md, padding: 12 },
    letterText: { fontSize: 12.5, lineHeight: 19, fontWeight: '500' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.md, paddingVertical: 12 },
    btnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    notice: { margin: 16, borderWidth: 1, borderRadius: Radius.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
    noticeText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
