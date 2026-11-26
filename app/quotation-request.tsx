import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Customer, searchCustomers } from '@/services/frappeSearch';
import {
    REQUEST_BRANDS,
    RequestItem,
    RequestType,
    createRequestDraft,
    emailQuotationToSales,
    searchItemsByBrand,
} from '@/services/quotationRequest';

type Line = { key: number; item: RequestItem | null; query: string; results: RequestItem[]; qty: string };

/** Quotation / Proforma request: choose the type, then brand, customer and one or more items with quantities. Saved to ERP as a Draft. */
export default function QuotationRequestScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const nextKey = useRef(2);
    const formScrollRef = useRef<ScrollView>(null);

    const newLine = (key: number): Line => ({ key, item: null, query: '', results: [], qty: '' });

    const [source, setSource] = useState<'white' | 'direct' | null>(null);
    const [type, setType] = useState<RequestType | null>(null);
    const [brand, setBrand] = useState<string | null>(null);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState<Customer[]>([]);
    const [lines, setLines] = useState<Line[]>([newLine(1)]);
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const q = customerQuery.trim();
        if (q.length < 2 || customer) { setCustomerResults([]); return; }
        const h = setTimeout(async () => {
            const r = await searchCustomers(q);
            setCustomerResults(r.ok ? r.data : []);
        }, 300);
        return () => clearTimeout(h);
    }, [customerQuery, customer]);

    const patchLine = (key: number, patch: Partial<Line>) =>
        setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

    const addLine = () => {
        const key = nextKey.current++;
        setLines(ls => [...ls, newLine(key)]);
    };

    const removeLine = (key: number) =>
        setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls));

    const chooseBrand = (b: string) => {
        setBrand(b);
        setType(null);
        setLines([newLine(1)]);
        nextKey.current = 2;
    };

    /** Step back: form -> Quotation/Proforma -> brand -> source -> previous screen. */
    const onBack = () => {
        if (type) setType(null);
        else if (brand) setBrand(null);
        else if (source) setSource(null);
        else router.back();
    };

    const save = async () => {
        if (!type || !brand || !customer) {
            Alert.alert('Missing details', 'Choose the brand and customer.');
            return;
        }
        if (lines.some(l => l.item && !(Number(l.qty) > 0))) {
            Alert.alert('Quantity', 'Enter a quantity greater than zero for every item.');
            return;
        }
        setSaving(true);
        try {
            // Lines with no item are left out; a request can be saved with no items.
            const lineList = lines.filter(l => l.item).map(l => ({ item: l.item as RequestItem, qty: Number(l.qty) }));
            const senderEmail = (await SecureStore.getItemAsync('user_id')) || '';
            const name = await createRequestDraft({
                type,
                brand,
                customerId: customer.name,
                lines: lineList,
                whiteCoSeries: source === 'white',
                // The logged-in user is the quotation approver.
                approverEmail: senderEmail || undefined,
                specialInstructions: specialInstructions.trim() || undefined,
            });
            // The draft is saved; now email it to the HOS address from the logged-in user's address.
            const senderName = (await SecureStore.getItemAsync('user_name')) || '';
            const typeLabel = type === 'quotation' ? 'Quotation' : 'Proforma';
            // Running number for this phone's requests, kept separately for quotations and proformas: 1, 2, 3 ...
            const counterKey = type === 'quotation' ? 'quotation_request_no' : 'proforma_request_no';
            const requestNo = (parseInt((await SecureStore.getItemAsync(counterKey)) || '0', 10) || 0) + 1;
            await SecureStore.setItemAsync(counterKey, String(requestNo));
            let mailNote = '';
            if (!senderEmail) {
                mailNote = 'Email not sent: your user email is not known. Log out and log in again.';
            } else {
                try {
                    await emailQuotationToSales({
                        name,
                        requestNo,
                        senderEmail,
                        senderName,
                        typeLabel,
                        customerLabel: customer.customer_name || customer.name,
                        lines: lineList,
                        brand,
                        sourceLabel: source === 'direct' ? 'Direct Supplier' : 'From White & Co',
                        specialInstructions: specialInstructions.trim() || undefined,
                    });
                    mailNote = 'Emailed to hos@whitenco.net.';
                } catch (e: any) {
                    mailNote = `Saved, but the email was not sent: ${e?.message || 'unknown error'}`;
                }
            }
            Alert.alert('Saved in ERP', `${name} was saved as a Draft in ERP.\n${mailNote}`, [{ text: 'OK', onPress: () => router.back() }]);
        } catch (e: any) {
            Alert.alert('Not saved', e?.message || 'ERP did not accept the request.');
        } finally {
            setSaving(false);
        }
    };

    const field = [styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }];
    const label = [styles.label, { color: colors.textSecondary }];
    const chip = (on: boolean) => [styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }];
    const chipText = (on: boolean) => [styles.chipText, { color: on ? '#FFF' : colors.text }];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title="Quotation / Proforma"
                subtitle={
                    !source ? 'Choose a source'
                    : !brand ? `${source === 'direct' ? 'Direct Supplier' : 'From White & Co'} · Choose a brand`
                    : !type ? `${brand} · Quotation or Proforma`
                    : `${brand} · ${type === 'quotation' ? 'Quotation' : 'Proforma'} request`
                }
                onBack={onBack}
            />

            {!source ? (
                <View style={styles.typeWrap}>
                    {([
                        { key: 'white', label: 'From White & Co', icon: 'business' },
                        { key: 'direct', label: 'Direct Supplier', icon: 'people' },
                    ] as const).map(s => (
                        <TouchableOpacity
                            key={s.key}
                            style={[styles.typeBtn, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => setSource(s.key)}
                        >
                            <Ionicons name={s.icon} size={26} color={colors.primary} />
                            <Text style={[styles.typeText, { color: colors.text }]}>{s.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : !brand ? (
                <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                    <Text style={label}>Brand</Text>
                    <View style={styles.chipRow}>
                        {REQUEST_BRANDS.map(b => (
                            <TouchableOpacity key={b} style={chip(false)} onPress={() => chooseBrand(b)}>
                                <Text style={chipText(false)}>{b}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            ) : !type ? (
                <View style={styles.typeWrap}>
                    {(['quotation', 'proforma'] as RequestType[]).map(t => (
                        <TouchableOpacity
                            key={t}
                            style={[styles.typeBtn, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => setType(t)}
                        >
                            <Ionicons name={t === 'quotation' ? 'document-text' : 'receipt'} size={26} color={colors.primary} />
                            <Text style={[styles.typeText, { color: colors.text }]}>{t === 'quotation' ? 'Quotation' : 'Proforma'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            ) : (
                <ScrollView
                    ref={formScrollRef}
                    contentContainerStyle={[styles.pad, { paddingBottom: 320 }]}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={label}>Customer</Text>
                    {customer ? (
                        <TouchableOpacity style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]} onPress={() => { setCustomer(null); setCustomerQuery(''); }}>
                            <Text style={[styles.selectedText, { color: colors.primary }]}>{customer.customer_name || customer.name}</Text>
                            <Ionicons name="close-circle" size={18} color={colors.primary} />
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TextInput
                                style={field}
                                placeholder="Search customer"
                                placeholderTextColor={colors.textSecondary}
                                value={customerQuery}
                                onChangeText={setCustomerQuery}
                            />
                            {customerResults.map(c => (
                                <TouchableOpacity key={c.name} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => { setCustomer(c); setCustomerResults([]); }}>
                                    <Text style={[styles.resultText, { color: colors.text }]}>{c.customer_name || c.name}</Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    )}

                    {!brand ? (
                        <Text style={[styles.hint, { color: colors.textSecondary, marginTop: 12 }]}>Choose a brand to add items.</Text>
                    ) : (
                        <>
                            {lines.map((l, i) => (
                                <ItemLine
                                    key={l.key}
                                    index={i}
                                    line={l}
                                    brand={brand}
                                    canRemove={lines.length > 1}
                                    onChange={patch => patchLine(l.key, patch)}
                                    onRemove={() => removeLine(l.key)}
                                    colors={colors}
                                    field={field}
                                    label={label}
                                />
                            ))}
                            <TouchableOpacity style={[styles.addItemBtn, { borderColor: colors.primary }]} onPress={addLine}>
                                <Ionicons name="add" size={18} color={colors.primary} />
                                <Text style={[styles.addItemText, { color: colors.primary }]}>Add item</Text>
                            </TouchableOpacity>
                            <Text style={label}>Special Instructions</Text>
                            <TextInput
                                style={[field, { minHeight: 220, textAlignVertical: 'top' }]}
                                placeholder="Optional"
                                placeholderTextColor={colors.textSecondary}
                                value={specialInstructions}
                                onChangeText={setSpecialInstructions}
                                onFocus={() => setTimeout(() => formScrollRef.current?.scrollToEnd({ animated: true }), 350)}
                                multiline
                            />
                        </>
                    )}

                    <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
                        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save and Send to ERP</Text>}
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

/** One item line: its own item search and quantity. */
function ItemLine({
    index, line, brand, canRemove, onChange, onRemove, colors, field, label,
}: {
    index: number;
    line: Line;
    brand: string;
    canRemove: boolean;
    onChange: (patch: Partial<Line>) => void;
    onRemove: () => void;
    colors: typeof Colors.light;
    field: any[];
    label: any[];
}) {
    useEffect(() => {
        const q = line.query.trim();
        if (q.length < 2 || line.item) { if (line.results.length) onChange({ results: [] }); return; }
        const h = setTimeout(async () => {
            onChange({ results: await searchItemsByBrand(brand, q) });
        }, 300);
        return () => clearTimeout(h);
        // onChange is a fresh closure each render; the search depends only on these values
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [line.query, line.item, brand]);

    return (
        <View style={styles.lineBox}>
            <View style={styles.lineHead}>
                <Text style={label}>Item {index + 1}</Text>
                {canRemove && (
                    <TouchableOpacity onPress={onRemove} hitSlop={8}>
                        <Text style={[styles.hint, { color: colors.danger }]}>Remove</Text>
                    </TouchableOpacity>
                )}
            </View>
            {line.item ? (
                <TouchableOpacity style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]} onPress={() => onChange({ item: null, query: '', results: [] })}>
                    <Text style={[styles.selectedText, { color: colors.primary }]}>{line.item.item_name}</Text>
                    <Ionicons name="close-circle" size={18} color={colors.primary} />
                </TouchableOpacity>
            ) : (
                <>
                    <TextInput
                        style={field}
                        placeholder="Search item name (2+ letters)"
                        placeholderTextColor={colors.textSecondary}
                        value={line.query}
                        onChangeText={query => onChange({ query })}
                    />
                    {line.results.map(it => (
                        <TouchableOpacity key={it.item_code} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => onChange({ item: it, results: [] })}>
                            <Text style={[styles.resultText, { color: colors.text }]}>{it.item_name}</Text>
                            <Text style={[styles.hint, { color: colors.textSecondary }]}>{it.item_code}</Text>
                        </TouchableOpacity>
                    ))}
                </>
            )}
            <Text style={label}>Quantity</Text>
            <TextInput
                style={field}
                value={line.qty}
                onChangeText={qty => onChange({ qty })}
                keyboardType="decimal-pad"
                placeholder="Enter quantity"
                placeholderTextColor={colors.textSecondary}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    typeWrap: { padding: 16, gap: 14, marginTop: 24 },
    typeBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: Radius.lg, padding: 22 },
    typeText: { fontSize: 17, fontWeight: '800' },
    pad: { padding: 16, gap: 8, paddingBottom: 32 },
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    input: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
    selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
    selectedText: { fontSize: 14, fontWeight: '700', flex: 1 },
    resultRow: { paddingVertical: 10, borderBottomWidth: 1, gap: 2 },
    resultText: { fontSize: 14, fontWeight: '600' },
    hint: { fontSize: 12, fontWeight: '600' },
    lineBox: { gap: 8, marginTop: 4, paddingTop: 4 },
    lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 12, marginTop: 14 },
    addItemText: { fontSize: 14, fontWeight: '800' },
    saveBtn: { borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
    saveText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
