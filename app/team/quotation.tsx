/**
 * Make the draft pro-forma / quotation for a team job.
 *
 * Starts from what SmartOps read: the brand from the principal named in the post, the
 * customers matching the post and the PO photo, and the photo's lines. Each line offers the
 * closest ERPNext item SmartOps found, with a "Use" button (or "Use all suggestions") -- a
 * person still chooses every item, nothing is filled in for them -- and shows what this
 * customer was last quoted for it. The result is a DRAFT in ERPNext, in the principal's own series;
 * it is sent for approval there as today, and the job closes when it is approved.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PickOption } from '@/components/team/PickerSheet';
import { SearchSheet } from '@/components/team/SearchSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchCustomers, searchItems } from '@/services/frappeSearch';
import { KIND_COLORS, Plan, team } from '@/services/teamApi';

interface Line {
    key: string;
    description: string;
    item_code: string;
    item_name: string;
    qty: string;
    rate: string;
    last?: string | null;
    /** Where the line came from: the PO photo, or the words of a typed request. */
    fromMessage?: boolean;
    /** SmartOps' closest ERPNext item for this line: offered, never applied by itself. */
    suggestion?: { code: string; name: string; how?: string | null } | null;
}

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

export default function QuotationScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [plan, setPlan] = useState<Plan | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [brand, setBrand] = useState<string | null>(null);
    const [customer, setCustomer] = useState<string | null>(null);
    const [lines, setLines] = useState<Line[]>([]);
    const [itemFor, setItemFor] = useState<string | null>(null);
    const [customerSearch, setCustomerSearch] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        team.plan(id).then(r => {
            if (!r.ok) { setError(r.error); return; }
            const p = r.data;
            setPlan(p);
            setBrand(p.brand ?? null);
            if (p.customers.length === 1) setCustomer(p.customers[0].name);
            const fromPhoto = p.lines.map(l => ({
                key: newKey(), description: l.description, item_code: l.item_code ?? '', item_name: l.item_code ?? '',
                qty: l.qty ? String(l.qty) : '', rate: l.rate != null ? String(l.rate) : '',
                fromMessage: l.source === 'message',
                suggestion: l.suggested_item_code
                    ? { code: l.suggested_item_code, name: l.suggested_item_name || l.suggested_item_code, how: l.suggested_how }
                    : null,
            }));
            setLines(fromPhoto.length ? fromPhoto : [{ key: newKey(), description: '', item_code: '', item_name: '', qty: '', rate: '' }]);
        });
    }, [id]);

    // "check with previous supply": the customer's last approved rate for each picked item.
    useEffect(() => {
        if (!customer) return;
        const pending = lines.filter(l => l.item_code && l.last === undefined);
        if (!pending.length) return;
        // Marked as asked ('' shows nothing) before asking, so a re-render while the answer
        // is on its way does not ask again.
        const asked = new Set(pending.map(l => l.key));
        setLines(cur => cur.map(x => asked.has(x.key) ? { ...x, last: '' } : x));
        pending.forEach(l => {
            team.lastRate(customer, l.item_code).then(r => {
                const text = r.ok && r.data.rate != null ? `Last quoted ₹${r.data.rate.toLocaleString('en-IN')} on ${r.data.date}` : null;
                setLines(cur => cur.map(x => x.key === l.key ? { ...x, last: text, rate: x.rate || (r.ok && r.data.rate != null ? String(r.data.rate) : '') } : x));
            });
        });
    }, [customer, lines]);

    const update = (key: string, change: Partial<Line>) =>
        setLines(cur => cur.map(l => l.key === key ? { ...l, ...change } : l));

    /** Take SmartOps' suggestion for one line (or every unpicked line) -- the person's tap. */
    const takeSuggestion = (key?: string) =>
        setLines(cur => cur.map(l => (key ? l.key === key : true) && !l.item_code && l.suggestion
            ? { ...l, item_code: l.suggestion.code, item_name: l.suggestion.name, last: undefined }
            : l));
    const suggestionsLeft = lines.filter(l => !l.item_code && l.suggestion).length;

    const searchItemOptions = useCallback(async (q: string): Promise<PickOption[]> => {
        const r = await searchItems(q);
        return r.ok ? r.data.slice(0, 40).map(i => ({ value: i.name, label: i.item_name || i.name, hint: `${i.name}${i.description ? ' · ' + i.description.replace(/<[^>]+>/g, '').slice(0, 80) : ''}` })) : [];
    }, []);
    const searchCustomerOptions = useCallback(async (q: string): Promise<PickOption[]> => {
        const r = await searchCustomers(q);
        return r.ok ? r.data.slice(0, 40).map(c => ({ value: c.name, label: c.customer_name || c.name, hint: c.territory })) : [];
    }, []);

    if (!plan) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                {error ? <Text style={{ color: colors.danger, fontWeight: '700', padding: 24 }}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
            </View>
        );
    }

    const tint = KIND_COLORS[plan.kind];
    const ready = !!brand && !!customer && lines.length > 0 && lines.every(l => l.item_code && Number(l.qty) > 0);

    const create = async () => {
        if (!ready || !brand || !customer) return;
        setSaving(true);
        const r = await team.quotation(id, {
            customer, brand,
            lines: lines.map(l => ({
                item_code: l.item_code, qty: Number(l.qty),
                rate: l.rate.trim() ? Number(l.rate) : null,
            })),
        });
        setSaving(false);
        if (!r.ok) { Alert.alert('Quotation', r.error); return; }
        router.back();
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScreenHeader
                title={`Draft ${plan.quote_type === 'Proforma' ? 'pro-forma' : 'quotation'}`}
                subtitle="Saved in ERPNext as a draft — nothing is submitted"
                onBack={() => router.back()}
            />

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                {!!plan.note && <Text style={{ color: colors.warning, fontWeight: '700' }}>{plan.note}</Text>}

                <Text style={[styles.label, { color: colors.textSecondary }]}>Brand / principal</Text>
                <View style={styles.wrap}>
                    {plan.brands.map(b => {
                        const on = b.brand === brand;
                        return (
                            <TouchableOpacity key={b.brand} onPress={() => setBrand(b.brand)}
                                style={[styles.pill, { backgroundColor: on ? tint : colors.surfaceSecondary, borderColor: on ? tint : colors.border }]}>
                                <Text style={{ color: on ? '#FFF' : colors.text, fontWeight: '800' }}>{b.label}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                {brand === plan.brand && !!plan.series && (
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{`Series ${plan.series} · print format "${plan.print_format}"`}</Text>
                )}

                <Text style={[styles.label, { color: colors.textSecondary }]}>Customer</Text>
                {plan.customers.map(c => {
                    const on = c.name === customer;
                    return (
                        <TouchableOpacity key={c.name} onPress={() => setCustomer(c.name)}
                            style={[styles.option, { borderColor: on ? tint : colors.border, backgroundColor: colors.surface }]}>
                            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? tint : colors.textSecondary} />
                            <Text style={{ color: colors.text, fontWeight: on ? '800' : '600', flex: 1 }}>{c.customer_name}</Text>
                        </TouchableOpacity>
                    );
                })}
                {!!customer && !plan.customers.some(c => c.name === customer) && (
                    <View style={[styles.option, { borderColor: tint, backgroundColor: colors.surface }]}>
                        <Ionicons name="radio-button-on" size={20} color={tint} />
                        <Text style={{ color: colors.text, fontWeight: '800', flex: 1 }}>{customer}</Text>
                    </View>
                )}
                <TouchableOpacity onPress={() => setCustomerSearch(true)}>
                    <Text style={{ color: colors.primary, fontWeight: '800' }}>
                        {plan.customers.length ? 'Someone else — search ERPNext' : `Search ERPNext${plan.customer_query ? ` (photo says "${plan.customer_query}")` : ''}`}
                    </Text>
                </TouchableOpacity>

                <View style={styles.rowBetween}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Items</Text>
                    {suggestionsLeft > 1 && (
                        <TouchableOpacity onPress={() => takeSuggestion()}>
                            <Text style={{ color: colors.primary, fontWeight: '800', marginTop: 6 }}>
                                Use all {suggestionsLeft} suggestions
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {lines.map((l, i) => (
                    <View key={l.key} style={[styles.line, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.rowBetween}>
                            <Text style={{ color: colors.textSecondary, fontWeight: '800' }}>Line {i + 1}</Text>
                            <TouchableOpacity onPress={() => setLines(cur => cur.filter(x => x.key !== l.key))}>
                                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                        {!!l.description && <Text style={{ color: colors.text }}>{l.fromMessage ? 'Asked for' : 'On the PO'}: {l.description}</Text>}
                        <TouchableOpacity onPress={() => setItemFor(l.key)}
                            style={[styles.itemPick, { borderColor: l.item_code ? colors.success : colors.warning }]}>
                            <Ionicons name={l.item_code ? 'checkmark-circle' : 'search'} size={18} color={l.item_code ? colors.success : colors.warning} />
                            <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }} numberOfLines={2}>
                                {l.item_code ? `${l.item_name} (${l.item_code})` : 'Pick the ERPNext item'}
                            </Text>
                        </TouchableOpacity>
                        {!l.item_code && !!l.suggestion && (
                            <View style={[styles.suggestion, { backgroundColor: colors.surfaceVariant }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '800' }}>
                                        SUGGESTED{l.suggestion.how ? ` · ${l.suggestion.how.toUpperCase()}` : ''} — CHECK IT
                                    </Text>
                                    <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={2}>
                                        {l.suggestion.name} ({l.suggestion.code})
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={() => takeSuggestion(l.key)}
                                    style={[styles.useBtn, { backgroundColor: colors.primary }]}>
                                    <Text style={{ color: '#FFF', fontWeight: '900' }}>Use</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                                placeholder="Qty" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad"
                                value={l.qty} onChangeText={v => update(l.key, { qty: v })} />
                            <TextInput style={[styles.input, { color: colors.text, borderColor: colors.border, flex: 1.4 }]}
                                placeholder="Rate (blank = price list)" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad"
                                value={l.rate} onChangeText={v => update(l.key, { rate: v })} />
                        </View>
                        {!!l.last && <Text style={{ color: colors.info, fontSize: 12, fontWeight: '700' }}>{l.last}</Text>}
                    </View>
                ))}
                <TouchableOpacity onPress={() => setLines(cur => [...cur, { key: newKey(), description: '', item_code: '', item_name: '', qty: '', rate: '' }])}>
                    <Text style={{ color: colors.primary, fontWeight: '800' }}>+ Add a line</Text>
                </TouchableOpacity>

                <TouchableOpacity disabled={!ready || saving} onPress={create}
                    style={[styles.create, { backgroundColor: tint, opacity: !ready || saving ? 0.5 : 1 }]}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.createText}>Make draft in ERPNext</Text>}
                </TouchableOpacity>
                <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
                    {"A draft only — tax is taken from this customer's last approved quotation. Check it and send for approval in ERPNext."}
                </Text>
            </ScrollView>

            <SearchSheet visible={!!itemFor} title="ERPNext item"
                initial={lines.find(l => l.key === itemFor)?.description.split(/\s+/).slice(0, 2).join(' ')}
                search={searchItemOptions}
                onPick={o => itemFor && update(itemFor, { item_code: o.value, item_name: o.label, last: undefined })}
                onClose={() => setItemFor(null)} />
            <SearchSheet visible={customerSearch} title="Customer" initial={plan.customer_query ?? ''}
                search={searchCustomerOptions}
                onPick={o => { setCustomer(o.value); setLines(cur => cur.map(l => ({ ...l, last: undefined }))); }}
                onClose={() => setCustomerSearch(false)} />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    label: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pill: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, padding: 12 },
    line: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemPick: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, padding: 10 },
    suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 10 },
    useBtn: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    create: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    createText: { color: '#FFF', fontWeight: '900', fontSize: 16 },
});
