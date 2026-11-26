import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { apiGet, apiPost, apiPut, uploadFile } from '@/utils/api';
import { apiUrl } from '@/constants/config';
import { searchItemsByBrand, RequestItem } from '@/services/quotationRequest';
import { Customer, searchCustomers } from '@/services/frappeSearch';

type Attachment = { uri: string; name: string; type: string };
type Line = { key: number; item: RequestItem | null; query: string; results: RequestItem[]; qty: string };

const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dmy = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}-${m}-${y}` : iso;
};

/** Customer Purchase Order: customer, attachments, date, then items (one brand for all items, item, quantity). Saved to ERP. */
export default function CreateSalesOrderScreen() {
    const { edit_id } = useLocalSearchParams<{ edit_id?: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerResults, setCustomerResults] = useState<Customer[]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [existingAttach, setExistingAttach] = useState('');
    const [orderDate, setOrderDate] = useState(todayIso());
    const [showDate, setShowDate] = useState(false);
    const [brands, setBrands] = useState<string[]>([]);
    const [lines, setLines] = useState<Line[]>([{ key: 1, item: null, query: '', results: [], qty: '' }]);
    const [nextKey, setNextKey] = useState(2);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [brand, setBrand] = useState('');
    const [brandOpen, setBrandOpen] = useState(false);

    // Brands for the item lines
    useEffect(() => {
        (async () => {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(apiUrl('/api/resource/Brand?fields=%5B%22name%22%5D&order_by=name%20asc&limit_page_length=0'), cookies);
            if (res.ok) setBrands(((res.data as any)?.data || []).map((b: any) => b.name));
        })();
    }, []);

    // Customer search (enabled customers only)
    useEffect(() => {
        const q = customerQuery.trim();
        if (q.length < 2 || customer) { setCustomerResults([]); return; }
        const h = setTimeout(async () => {
            const r = await searchCustomers(q);
            setCustomerResults(r.ok ? r.data : []);
        }, 300);
        return () => clearTimeout(h);
    }, [customerQuery, customer]);

    // Editing an existing order: load its customer, date, items and attachment
    useEffect(() => {
        if (!edit_id) return;
        (async () => {
            setLoading(true);
            try {
                const cookies = await SecureStore.getItemAsync('session_cookies');
                const res = await apiGet(apiUrl(`/api/resource/Sales Order/${encodeURIComponent(edit_id)}`), cookies);
                const doc: any = (res.data as any)?.data;
                if (!res.ok || !doc) { Alert.alert('Error', 'Could not load the order.'); return; }
                setCustomer({ name: doc.customer, customer_name: doc.customer_name || doc.customer } as Customer);
                setCustomerQuery(doc.customer_name || doc.customer);
                setOrderDate(doc.transaction_date || todayIso());
                setBrand(doc.items?.[0]?.brand || '');
                setExistingAttach(doc.attach || '');
                const loaded: Line[] = (doc.items || []).map((it: any, i: number) => ({
                    key: i + 1,
                    item: { item_code: it.item_code, item_name: it.item_name || it.item_code, stock_uom: it.uom || '' },
                    query: '',
                    results: [],
                    qty: String(it.qty || ''),
                }));
                setLines(loaded.length ? loaded : [{ key: 1, item: null, query: '', results: [], qty: '' }]);
                setNextKey(loaded.length + 1);
            } finally {
                setLoading(false);
            }
        })();
    }, [edit_id]);

    // ---- attachments: pick any number of images or PDFs
    const addFiles = (files: Attachment[]) => {
        if (!files.length) return;
        setAttachments(prev => [...prev, ...files]);
    };

    const pickImages = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.8,
        });
        if (!result.canceled) {
            addFiles(result.assets.map(a => ({
                uri: a.uri,
                name: a.fileName || a.uri.split('/').pop() || 'image.jpg',
                type: a.mimeType || 'image/jpeg',
            })));
        }
    };

    const pickPdfs = async () => {
        const { getDocumentAsync } = await import('expo-document-picker');
        const result = await getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
        if (!result.canceled) {
            addFiles(result.assets.map(a => ({ uri: a.uri, name: a.name, type: a.mimeType || 'application/pdf' })));
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    // ---- item lines
    const patchLine = (key: number, patch: Partial<Line>) =>
        setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

    const addLine = () => {
        setLines(ls => [...ls, { key: nextKey, item: null, query: '', results: [], qty: '' }]);
        setNextKey(k => k + 1);
    };

    const removeLine = (key: number) => setLines(ls => (ls.length > 1 ? ls.filter(l => l.key !== key) : ls));

    // Item search for each line, limited to the order's brand
    useEffect(() => {
        lines.forEach(l => {
            const q = l.query.trim();
            if (!brand || l.item || q.length < 2) return;
            const h = setTimeout(async () => {
                const results = await searchItemsByBrand(brand, q);
                setLines(ls => ls.map(x => (x.key === l.key && x.query.trim() === q ? { ...x, results } : x)));
            }, 300);
            return () => clearTimeout(h);
        });
        // The search re-runs when the brand, a query or a chosen item changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [brand, lines.map(l => `${l.key}|${l.query}|${l.item?.item_code || ''}`).join(',')]);

    // ---- save
    const handleSave = async () => {
        if (!customer) { Alert.alert('Customer', 'Choose the customer.'); return; }
        const filled = lines.filter(l => l.item);
        if (filled.some(l => !(Number(l.qty) > 0))) { Alert.alert('Quantity', 'Enter a quantity greater than zero for every item.'); return; }

        setSaving(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const items = filled.map(l => ({
                item_code: l.item!.item_code,
                item_name: l.item!.item_name,
                description: l.item!.item_name,
                qty: Number(l.qty),
                brand,
            }));
            const payload: any = {
                customer: customer.name,
                transaction_date: orderDate,
                // ERP asks for a delivery date; the app sets it one week after the order date.
                delivery_date: addDaysIso(orderDate, 7),
                company: 'White & Co.',
                items,
            };
            // A order with no items still saves: zero totals, as the ERP quotation needs.
            if (items.length === 0) {
                Object.assign(payload, { total: 0, net_total: 0, grand_total: 0, base_total: 0, base_net_total: 0, base_grand_total: 0, rounded_total: 0, base_rounded_total: 0, total_taxes_and_charges: 0, base_total_taxes_and_charges: 0 });
            }

            const url = edit_id ? apiUrl(`/api/resource/Sales Order/${encodeURIComponent(edit_id)}`) : apiUrl('/api/resource/Sales Order');
            const res = edit_id ? await apiPut(url, payload, cookies) : await apiPost(url, payload, cookies);
            const name: string | undefined = (res.data as any)?.data?.name;
            if (!res.ok || !name) {
                Alert.alert('Not saved', serverText(res.data) || 'ERP did not accept the order.');
                return;
            }

            // Attach every chosen file to the saved order
            const failed: string[] = [];
            for (const f of attachments) {
                const up: any = await uploadFile(apiUrl('/api/method/upload_file'), f, cookies, { doctype: 'Sales Order', docname: name });
                if (!up.ok) failed.push(f.name);
            }
            const fileNote = failed.length ? `\nThese files were not attached: ${failed.join(', ')}` : '';
            Alert.alert('Saved in ERP', `Customer Purchase Order ${name} was saved.${fileNote}`, [{ text: 'OK', onPress: () => router.back() }]);
        } catch {
            Alert.alert('Not saved', 'Something went wrong while saving. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const field = [styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }];
    const label = [styles.label, { color: colors.textSecondary }];
    const card = [styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }];

    return (
        <KeyboardAvoidingView behavior="padding" style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title={edit_id ? 'Edit Purchase Order' : 'Customer Purchase Order'}
                subtitle={edit_id ? undefined : 'New order'}
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/sales-orders'))}
            />

            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
                <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: 320 + insets.bottom }]} keyboardShouldPersistTaps="handled">
                    {/* 1. Customer */}
                    <View style={card}>
                        <Text style={label}>1. Customer</Text>
                        {customer ? (
                            <TouchableOpacity style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]} onPress={() => { setCustomer(null); setCustomerQuery(''); }}>
                                <Text style={[styles.selectedText, { color: colors.primary }]}>{customer.customer_name || customer.name}</Text>
                                <Ionicons name="close-circle" size={18} color={colors.primary} />
                            </TouchableOpacity>
                        ) : (
                            <>
                                <TextInput style={field} placeholder="Search customer" placeholderTextColor={colors.textSecondary} value={customerQuery} onChangeText={setCustomerQuery} />
                                {customerResults.map(c => (
                                    <TouchableOpacity key={c.name} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => { setCustomer(c); setCustomerResults([]); }}>
                                        <Text style={[styles.resultText, { color: colors.text }]}>{c.customer_name || c.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}
                    </View>

                    {/* 2. Attachments */}
                    <View style={card}>
                        <Text style={label}>2. Attachments</Text>
                        {existingAttach ? <Text style={[styles.hint, { color: colors.textSecondary }]}>Existing file: {existingAttach.split('/').pop()}</Text> : null}
                        {attachments.map((f, i) => (
                            <View key={`${f.uri}-${i}`} style={[styles.fileRow, { borderColor: colors.border }]}>
                                <Ionicons name={f.type.includes('pdf') ? 'document-text-outline' : 'image-outline'} size={20} color={colors.primary} />
                                <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                                <TouchableOpacity onPress={() => removeAttachment(i)} hitSlop={8}>
                                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                                </TouchableOpacity>
                            </View>
                        ))}
                        <View style={styles.row}>
                            <TouchableOpacity style={[styles.addBox, { borderColor: colors.primary }]} onPress={pickImages}>
                                <Ionicons name="image-outline" size={18} color={colors.primary} />
                                <Text style={[styles.addText, { color: colors.primary }]}>Add image</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.addBox, { borderColor: colors.primary }]} onPress={pickPdfs}>
                                <Ionicons name="document-outline" size={18} color={colors.primary} />
                                <Text style={[styles.addText, { color: colors.primary }]}>Add PDF</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* 3. Date */}
                    <View style={card}>
                        <Text style={label}>3. Date</Text>
                        <Pressable style={[styles.dateBox, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowDate(true)}>
                            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                            <Text style={[styles.dateText, { color: colors.text }]}>{dmy(orderDate)}</Text>
                        </Pressable>
                        {showDate && (
                            <DateTimePicker
                                value={new Date(`${orderDate}T00:00:00`)}
                                mode="date"
                                display="default"
                                onChange={(_e, selected) => {
                                    setShowDate(false);
                                    if (selected) setOrderDate(todayIsoFrom(selected));
                                }}
                            />
                        )}
                    </View>

                    {/* 4. Items */}
                    <View style={card}>
                        <Text style={label}>4. Items</Text>
                        <Text style={[styles.sub, { color: colors.textSecondary }]}>Brand (for all items)</Text>
                        <TouchableOpacity
                            style={[styles.selected, { borderColor: colors.border, backgroundColor: colors.surface }]}
                            onPress={() => setBrandOpen(v => !v)}
                        >
                            <Text style={[styles.selectedText, { color: brand ? colors.text : colors.textSecondary }]}>{brand || 'Select brand'}</Text>
                            <Ionicons name={brandOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                        {brandOpen && (
                            <ScrollView style={[styles.dropdown, { borderColor: colors.border, backgroundColor: colors.surface }]} nestedScrollEnabled>
                                {brands.map(b => (
                                    <TouchableOpacity
                                        key={b}
                                        style={[styles.resultRow, { borderBottomColor: colors.border, paddingHorizontal: 12 }]}
                                        onPress={() => {
                                            if (b !== brand) setLines(ls => ls.map(x => ({ ...x, item: null, query: '', results: [] })));
                                            setBrand(b);
                                            setBrandOpen(false);
                                        }}
                                    >
                                        <Text style={[styles.resultText, { color: colors.text }]}>{b}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}
                        {lines.map((l, idx) => (
                            <View key={l.key} style={[styles.lineBox, { borderColor: colors.border }]}>
                                <View style={styles.lineHead}>
                                    <Text style={[styles.lineTitle, { color: colors.text }]}>Item {idx + 1}</Text>
                                    {lines.length > 1 && (
                                        <TouchableOpacity onPress={() => removeLine(l.key)} hitSlop={8}>
                                            <Text style={{ color: colors.danger, fontWeight: '800', fontSize: 12 }}>Remove</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {brand ? (
                                    <>
                                        <Text style={[styles.sub, { color: colors.textSecondary }]}>Item name</Text>
                                        {l.item ? (
                                            <TouchableOpacity style={[styles.selected, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]} onPress={() => patchLine(l.key, { item: null, query: '', results: [] })}>
                                                <Text style={[styles.selectedText, { color: colors.primary }]}>{l.item.item_name}</Text>
                                                <Ionicons name="close-circle" size={18} color={colors.primary} />
                                            </TouchableOpacity>
                                        ) : (
                                            <>
                                                <TextInput style={field} placeholder="Search item name (2+ letters)" placeholderTextColor={colors.textSecondary} value={l.query} onChangeText={query => patchLine(l.key, { query, results: [] })} />
                                                {l.results.map(it => (
                                                    <TouchableOpacity key={it.item_code} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => patchLine(l.key, { item: it, results: [], query: '' })}>
                                                        <Text style={[styles.resultText, { color: colors.text }]}>{it.item_name}</Text>
                                                        <Text style={[styles.hint, { color: colors.textSecondary }]}>{it.item_code}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </>
                                        )}
                                    </>
                                ) : null}

                                <Text style={[styles.sub, { color: colors.textSecondary }]}>Quantity</Text>
                                <TextInput style={field} value={l.qty} onChangeText={qty => patchLine(l.key, { qty })} keyboardType="decimal-pad" placeholder="Enter quantity" placeholderTextColor={colors.textSecondary} />
                            </View>
                        ))}
                        <TouchableOpacity style={[styles.addItemBtn, { borderColor: colors.primary }]} onPress={addLine}>
                            <Ionicons name="add" size={18} color={colors.primary} />
                            <Text style={[styles.addText, { color: colors.primary }]}>Add item</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={[styles.saveWide, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={saving}>
                        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveWideText}>{edit_id ? 'Update order' : 'Save order in ERP'}</Text>}
                    </TouchableOpacity>
                </ScrollView>
            )}
        </KeyboardAvoidingView>
    );
}

/** yyyy-mm-dd plus a number of days. */
function addDaysIso(iso: string, days: number) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function todayIsoFrom(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The message ERP sends back with a failed save. */
function serverText(data: any): string {
    try {
        if (data?._server_messages) {
            const list: string[] = JSON.parse(data._server_messages);
            return list.map(m => { try { return JSON.parse(m).message; } catch { return m; } }).join(' ').replace(/<[^>]+>/g, '').slice(0, 300);
        }
        if (data?.exception) return String(data.exception).split('\n').pop()!.slice(0, 300);
    } catch { /* fall through */ }
    return '';
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    pad: { padding: 16, gap: 12 },
    saveBtn: { minWidth: 44, height: 40, paddingHorizontal: 14, borderRadius: Radius.pill, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    saveText: { fontWeight: '900', fontSize: 14, color: '#FFF' },
    card: { padding: 14, borderRadius: Radius.lg, borderWidth: 1, gap: 8 },
    label: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    sub: { fontSize: 12, fontWeight: '700', marginTop: 6 },
    hint: { fontSize: 12, fontWeight: '600' },
    input: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
    selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
    selectedText: { fontSize: 14, fontWeight: '700', flex: 1 },
    resultRow: { paddingVertical: 10, borderBottomWidth: 1, gap: 2 },
    resultText: { fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 10 },
    addBox: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 12 },
    addText: { fontSize: 14, fontWeight: '800' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 10, paddingVertical: 8 },
    fileName: { flex: 1, fontSize: 13, fontWeight: '600' },
    dateBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
    dateText: { fontSize: 15, fontWeight: '700' },
    lineBox: { borderWidth: 1, borderRadius: Radius.md, padding: 10, gap: 6, marginTop: 6 },
    lineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    lineTitle: { fontSize: 14, fontWeight: '800' },
    dropdown: { maxHeight: 220, borderWidth: 1, borderRadius: Radius.md },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, paddingVertical: 12, marginTop: 6 },
    saveWide: { borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
    saveWideText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
