/**
 * One payment and the bill(s) SmartOps thinks it pays: how sure, why, and approve or reject.
 * The decision is recorded in SmartOps only -- it does not change ERPNext or Tally.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { dmy, inr } from '@/components/orders/format';
import { SectionCard } from '@/components/ui/Midnight';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, toneFor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CONFIDENCE, Match, RULE_LABEL, decide, findMatch, loadRecon } from '@/services/reconApi';

export default function PaymentMatchScreen() {
    const { receipt } = useLocalSearchParams<{ receipt: string }>();
    const id = Array.isArray(receipt) ? receipt[0] : receipt;
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [m, setM] = useState<Match | null>(() => (id ? findMatch(id) : null));
    const [loading, setLoading] = useState(!m);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState<'approved' | 'rejected' | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        const r = await loadRecon();
        setLoading(false);
        if (!r.ok) { setError(r.error); return; }
        setError(null);
        setM(r.data.matches.find(x => x.receipt === id) ?? null);
    }, [id]);

    useEffect(() => { if (!m) load(); }, [m, load]);

    const back = () => (router.canGoBack() ? router.back() : router.replace('/payment-matching' as any));

    const send = async (decision: 'approved' | 'rejected') => {
        if (!m || saving) return;
        setSaving(decision);
        const r = await decide(m, decision, note);
        setSaving(null);
        if (r.ok) { setM(r.data); setNote(''); return; }
        if (r.status === 409) {
            // The ledger moved on while this was open: take the new proposal.
            Alert.alert('This changed', 'SmartOps has a different proposal for this payment now. Please look at it again.');
            load();
            return;
        }
        Alert.alert('Not saved', r.error);
    };

    const confirm = (decision: 'approved' | 'rejected') => {
        if (decision === 'approved' && m?.confidence === 'weak') {
            Alert.alert('Approve a weak match?',
                'Nothing adds up exactly here: SmartOps only set the money against the oldest bills. Approve it anyway?',
                [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: () => send('approved') }]);
            return;
        }
        send(decision);
    };

    const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Could not open', 'Open it from ERPNext instead.'));

    if (loading && !m) {
        return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
    }
    if (!m) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <Text style={{ color: error ? colors.danger : colors.textSecondary, textAlign: 'center' }}>
                    {error ?? 'SmartOps has no proposal for this payment any more.'}
                </Text>
                <TouchableOpacity onPress={back} style={[styles.btn, { backgroundColor: colors.primary, marginTop: 14, flex: 0, paddingHorizontal: 24 }]}>
                    <Text style={styles.btnText}>Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const tone = toneFor(theme, CONFIDENCE[m.confidence].hex);
    const d = m.decision;
    const total = m.allocations.reduce((n, a) => n + a.amount, 0);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title={inr(m.amount).replace('.00', '')} subtitle={`${m.customer_name} · ${dmy(m.date)}`} align="left" onBack={back} />

            <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                <SectionCard icon="cash" title="The payment" subtitle="As Tally recorded it">
                    <Line label="Paid by" value={m.printed_customer} colors={colors} />
                    <Line label="Reference" value={m.reference || '—'} colors={colors} />
                    {!!m.narration && <Line label="Narration" value={m.narration} colors={colors} />}
                    <TouchableOpacity onPress={() => open(m.receipt_url)} style={styles.link}>
                        <Text style={[styles.linkText, { color: colors.primary }]}>Open {m.receipt} in ERPNext</Text>
                        <Ionicons name="open-outline" size={14} color={colors.primary} />
                    </TouchableOpacity>
                </SectionCard>

                <SectionCard icon="git-compare" title="What SmartOps thinks" right={
                    <View style={[styles.pill, { backgroundColor: tone + '22' }]}>
                        <Text style={[styles.pillText, { color: tone }]}>{CONFIDENCE[m.confidence].label}</Text>
                    </View>
                }>
                    <Text style={[styles.rule, { color: colors.text }]}>{RULE_LABEL[m.rule] ?? m.rule}</Text>
                    <Text style={[styles.why, { color: colors.textSecondary }]}>{m.why}</Text>
                    <Line label="Customer" value={m.customer_name} colors={colors} />
                    {m.allocations.length === 0 ? (
                        <Text style={[styles.why, { color: colors.textSecondary }]}>
                            No bill chosen: the customer is recognised, and the money stays as an advance on them.
                        </Text>
                    ) : (
                        <>
                            {m.allocations.map(a => (
                                <TouchableOpacity key={a.invoice} onPress={() => open(a.url)} style={[styles.bill, { borderTopColor: colors.border }]}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[styles.billNo, { color: colors.text }]} numberOfLines={1}>Bill {a.voucher_number || a.invoice}</Text>
                                        <Text style={[styles.why, { color: colors.textSecondary }]} numberOfLines={1}>{a.invoice}</Text>
                                    </View>
                                    <Text style={[styles.billNo, { color: colors.text }]}>{inr(a.amount)}</Text>
                                    <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
                                </TouchableOpacity>
                            ))}
                            {m.allocations.length > 1 && (
                                <Text style={[styles.why, { color: colors.textSecondary, textAlign: 'right' }]}>Together {inr(total)}</Text>
                            )}
                        </>
                    )}
                </SectionCard>

                <SectionCard icon="checkmark-done" title="Your decision">
                    {d && (
                        <View style={[styles.decided, {
                            backgroundColor: (d.decision === 'approved' ? toneFor(theme, '#2F7D5B') : toneFor(theme, '#8C8173')) + '1A',
                            borderColor: (d.decision === 'approved' ? toneFor(theme, '#2F7D5B') : toneFor(theme, '#8C8173')) + '55',
                        }]}>
                            <Text style={[styles.decidedTitle, { color: colors.text }]}>
                                {d.decision === 'approved' ? 'Approved' : 'Rejected'} by {d.decided_by} · {dmy(d.decided_at)}
                            </Text>
                            {!!d.note && <Text style={[styles.why, { color: colors.text }]}>“{d.note}”</Text>}
                            {!d.current && (
                                <Text style={[styles.why, { color: toneFor(theme, '#D99A14'), fontWeight: '800' }]}>
                                    The proposal has changed since then. Please decide again.
                                </Text>
                            )}
                        </View>
                    )}
                    <TextInput
                        style={[styles.note, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
                        value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={colors.placeholder}
                        multiline maxLength={500}
                    />
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={() => confirm('rejected')} disabled={!!saving} activeOpacity={0.85}
                            style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                            {saving === 'rejected' ? <ActivityIndicator color={colors.text} /> : (
                                <><Ionicons name="close" size={17} color={colors.text} /><Text style={[styles.btnText, { color: colors.text }]}>Reject</Text></>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirm('approved')} disabled={!!saving} activeOpacity={0.85}
                            style={[styles.btn, { backgroundColor: colors.ink }]}>
                            {saving === 'approved' ? <ActivityIndicator color="#FFF" /> : (
                                <><Ionicons name="checkmark" size={17} color="#FFF" /><Text style={styles.btnText}>Approve</Text></>
                            )}
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.why, { color: colors.textSecondary }]}>
                        This records your decision in SmartOps only. ERPNext and Tally are not changed — the payment is applied in ERPNext by a person.
                    </Text>
                </SectionCard>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function Line({ label, value, colors }: { label: string; value: string; colors: typeof Colors.light }) {
    return (
        <View style={styles.line}>
            <Text style={[styles.lineKey, { color: colors.textSecondary }]}>{label}</Text>
            <Text style={[styles.lineValue, { color: colors.text }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    pad: { padding: 16, paddingBottom: 80, gap: 14 },
    line: { flexDirection: 'row', gap: 10, paddingVertical: 3 },
    lineKey: { width: 82, fontSize: 12, fontWeight: '700' },
    lineValue: { flex: 1, fontSize: 13, fontWeight: '700' },
    link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    linkText: { fontSize: 12.5, fontWeight: '800' },
    rule: { fontSize: 14, fontWeight: '800' },
    why: { fontSize: 12, fontWeight: '500', lineHeight: 17 },
    pill: { borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    pillText: { fontSize: 10.5, fontWeight: '800' },
    bill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
    billNo: { fontSize: 13.5, fontWeight: '800' },
    decided: { borderWidth: 1, borderRadius: Radius.md, padding: 10, gap: 4, marginBottom: 6 },
    decidedTitle: { fontSize: 12.5, fontWeight: '800' },
    note: { borderWidth: 1, borderRadius: Radius.md, padding: 10, minHeight: 60, fontSize: 13, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', gap: 10, marginVertical: 8 },
    btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: Radius.md, paddingVertical: 12 },
    btnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
