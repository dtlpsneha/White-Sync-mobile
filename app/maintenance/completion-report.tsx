import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Customer, searchCustomers } from '@/services/frappeSearch';
import { CompletionEntry, CustomerVisit, getVisit, saveVisit, syncVisitToErp } from '@/services/visitExtras';

const COMPLETION_TYPES = ['Courtesy visit', 'Complaint visit', 'Follow up visit', 'Measurement', 'Sample trial followup'];

/** One saved visit: a record view with its completion report, and an edit mode for the report. */
export default function CompletionReportScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [visit, setVisit] = useState<CustomerVisit | null>(null);
    const [entries, setEntries] = useState<CompletionEntry[]>([]);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Customer[]>([]);
    const [editing, setEditing] = useState(false);

    useEffect(() => {
        getVisit(String(id)).then(v => {
            if (!v) return;
            setVisit(v);
            setEntries(v.completion ?? v.customer_planned.map(c => ({ customer: c, visited: '' as const, types: [] })));
            setEditing(!v.completion);
        });
    }, [id]);

    const setEntry = (i: number, patch: Partial<CompletionEntry>) =>
        setEntries(prev => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

    const toggleType = (i: number, t: string) => {
        const e = entries[i];
        setEntry(i, { types: e.types.includes(t) ? e.types.filter(x => x !== t) : [...e.types, t] });
    };

    // Customer search, as in the visit form: pick an ERP customer, or add the typed name as new.
    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) { setResults([]); return; }
        const handle = setTimeout(async () => {
            const r = await searchCustomers(q);
            setResults(r.ok ? r.data : []);
        }, 300);
        return () => clearTimeout(handle);
    }, [query]);

    const addCustomer = (name: string, customerId?: string) => {
        const n = name.trim();
        if (!n) return;
        if (entries.some(e => e.customer === n)) {
            Alert.alert('Already added', `${n} is already in the list.`);
            return;
        }
        setEntries(prev => [...prev, { customer: n, customer_id: customerId, visited: '', types: [] }]);
        setQuery('');
        setResults([]);
    };

    const save = async () => {
        try {
            if (!visit) return;
            const customers = entries.map(e => e.customer);
            const customerIds = entries.map(e => e.customer_id).filter((x): x is string => !!x);
            const synced = await syncVisitToErp({ ...visit, customer_planned: customers, customer_ids: customerIds, completion: entries, dirty: true });
            await saveVisit(synced);
            setVisit(synced);
            setEditing(false);
        } catch {
            Alert.alert('Save failed', 'Could not save the completion report.');
        }
    };

    const statusOf = (e: CompletionEntry) =>
        e.visited === 'yes' ? { label: 'Visited', color: '#16A34A' } : e.visited === 'no' ? { label: 'Not visited', color: '#DC2626' } : { label: 'Not answered', color: colors.textSecondary };

    const headerTitle = editing ? 'Completion Report' : 'Visit Record';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title={headerTitle}
                subtitle={visit ? `${visit.date_of_visit} · ${visit.executive || '-'}` : ''}
                onBack={() => router.back()}
            />

            <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                {!visit ? (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>Visit not found on this phone.</Text>
                ) : !editing ? (
                    <>
                        <View style={[styles.recordCard, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Date of visit</Text>
                            <Text style={[styles.value, { color: colors.text }]}>{visit.date_of_visit}</Text>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Executive</Text>
                            <Text style={[styles.value, { color: colors.text }]}>{visit.executive || '-'}</Text>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Along with</Text>
                            <Text style={[styles.value, { color: colors.text }]}>{visit.along_with.length ? visit.along_with.join(', ') : '-'}</Text>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>ERP</Text>
                            <Text style={[styles.value, { color: visit.erp_name ? colors.success : colors.danger }]}>
                                {visit.erp_name ? `Synced (${visit.erp_name})` : visit.sync_error || 'Not synced'}
                            </Text>
                        </View>

                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Customers</Text>
                        {entries.length === 0 && <Text style={[styles.hint, { color: colors.textSecondary }]}>No customers in this visit.</Text>}
                        {entries.map((e, i) => {
                            const st = statusOf(e);
                            return (
                                <View key={`${e.customer}-${i}`} style={[styles.recordCard, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.rowBetween}>
                                        <Text style={[styles.customer, { color: colors.text, flex: 1 }]}>{e.customer}</Text>
                                        <View style={[styles.badge, { backgroundColor: st.color + '1F' }]}>
                                            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                                        </View>
                                    </View>
                                    {e.visited === 'yes' && e.types.length > 0 && (
                                        <View style={styles.chipRow}>
                                            {e.types.map(t => (
                                                <View key={t} style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
                                                    <Text style={[styles.chipText, { color: colors.primary }]}>{t}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            );
                        })}

                        <TouchableOpacity style={[styles.editBtn, { borderColor: colors.primary }]} onPress={() => setEditing(true)}>
                            <Ionicons name="create-outline" size={18} color={colors.primary} />
                            <Text style={[styles.editText, { color: colors.primary }]}>Edit completion report</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        {entries.length === 0 && <Text style={[styles.hint, { color: colors.textSecondary }]}>No customers planned yet. Add one below.</Text>}

                        {entries.map((e, i) => (
                            <View key={`${e.customer}-${i}`} style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                <Text style={[styles.customer, { color: colors.text }]}>{e.customer}</Text>
                                <View style={styles.yesNoRow}>
                                    {(['yes', 'no'] as const).map(opt => {
                                        const on = e.visited === opt;
                                        return (
                                            <TouchableOpacity
                                                key={opt}
                                                style={[styles.yesNo, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.background }]}
                                                onPress={() => setEntry(i, { visited: on ? '' : opt, types: opt === 'no' ? [] : e.types })}
                                            >
                                                <Text style={[styles.yesNoText, { color: on ? '#FFF' : colors.text }]}>{opt === 'yes' ? 'Yes' : 'No'}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {e.visited === 'yes' && (
                                    <View style={styles.chipRow}>
                                        {COMPLETION_TYPES.map(t => {
                                            const on = e.types.includes(t);
                                            return (
                                                <TouchableOpacity
                                                    key={t}
                                                    style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.background }]}
                                                    onPress={() => toggleType(i, t)}
                                                >
                                                    <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]}>{t}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        ))}

                        <View style={[styles.addBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <TextInput
                                style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                                placeholder="Search customer, or type a new name"
                                placeholderTextColor={colors.textSecondary}
                                value={query}
                                onChangeText={setQuery}
                            />
                            {results.map(c => (
                                <TouchableOpacity
                                    key={c.name}
                                    style={[styles.resultRow, { borderBottomColor: colors.border }]}
                                    onPress={() => addCustomer(c.customer_name || c.name, c.name)}
                                >
                                    <Text style={[styles.resultText, { color: colors.text }]}>{c.customer_name || c.name}</Text>
                                </TouchableOpacity>
                            ))}
                            {query.trim().length > 0 && (
                                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primarySoft }]} onPress={() => addCustomer(query)}>
                                    <Ionicons name="add" size={18} color={colors.primary} />
                                    <Text style={[styles.addText, { color: colors.primary }]}>Add "{query.trim()}" as new customer</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save}>
                            <Text style={styles.saveText}>Save</Text>
                        </TouchableOpacity>
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 12, paddingBottom: 120 },
    hint: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 20 },
    sectionTitle: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
    recordCard: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 6 },
    label: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
    value: { fontSize: 15, fontWeight: '700' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '800' },
    editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 14, marginTop: 8 },
    editText: { fontSize: 14, fontWeight: '800' },
    card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 12 },
    customer: { fontSize: 15, fontWeight: '800' },
    yesNoRow: { flexDirection: 'row', gap: 10 },
    yesNo: { flex: 1, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center' },
    yesNoText: { fontSize: 14, fontWeight: '800' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    addBox: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 10 },
    resultRow: { paddingVertical: 10, borderBottomWidth: 1 },
    resultText: { fontSize: 14, fontWeight: '600' },
    input: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.md, paddingVertical: 12 },
    addText: { fontSize: 14, fontWeight: '800' },
    saveBtn: { borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
    saveText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
