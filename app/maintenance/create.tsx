import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Customer, searchCustomers } from '@/services/frappeSearch';
import { saveVisit, syncVisitToErp } from '@/services/visitExtras';

const ALONG_WITH_OPTIONS = ['Alone', 'HOS', 'Precitex', 'Habasit', 'Inspiron'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const todayIso = () => {
    const d = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Customer Visit form: executive, date of visit, along with, customers planned, completion report. Kept on this phone. */
export default function CustomerVisitScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [executive, setExecutive] = useState('');
    const [dateOfVisit, setDateOfVisit] = useState(todayIso());
    const [alongWith, setAlongWith] = useState<string[]>([]);
    const [plannedCustomers, setPlannedCustomers] = useState<string[]>([]);
    const [plannedIds, setPlannedIds] = useState<Record<string, string>>({});
    const [plannedQuery, setPlannedQuery] = useState('');
    const [plannedResults, setPlannedResults] = useState<Customer[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        SecureStore.getItemAsync('user_name').then(n => setExecutive(n || '')).catch(() => { });
    }, []);

    useEffect(() => {
        const q = plannedQuery.trim();
        if (q.length < 2) { setPlannedResults([]); return; }
        const handle = setTimeout(async () => {
            const r = await searchCustomers(q);
            setPlannedResults(r.ok ? r.data : []);
        }, 300);
        return () => clearTimeout(handle);
    }, [plannedQuery]);

    const addPlanned = (name: string, customerId?: string) => {
        const n = name.trim();
        if (!n) return;
        setPlannedCustomers(prev => (prev.includes(n) ? prev : [...prev, n]));
        if (customerId) setPlannedIds(prev => ({ ...prev, [n]: customerId }));
        setPlannedQuery('');
        setPlannedResults([]);
    };

    const save = async () => {
        if (!DATE_RE.test(dateOfVisit)) {
            Alert.alert('Date of visit', 'Enter the date as YYYY-MM-DD.');
            return;
        }
        setSaving(true);
        try {
            const visit = {
                id: `${Date.now()}`,
                executive,
                date_of_visit: dateOfVisit,
                along_with: alongWith,
                customer_planned: plannedCustomers,
                customer_ids: plannedCustomers.map(n => plannedIds[n]).filter(Boolean),
                dirty: true,
                saved_at: new Date().toISOString(),
            };
            await saveVisit(visit);
            const synced = await syncVisitToErp(visit);
            await saveVisit(synced);
            const message = synced.erp_name
                ? 'Saved to ERP.'
                : `Saved on this phone. ${synced.sync_error || ''}`.trim();
            Alert.alert('Saved', message, [{ text: 'OK', onPress: () => router.back() }]);
        } catch {
            Alert.alert('Save failed', 'Could not save the visit on this phone.');
        } finally {
            setSaving(false);
        }
    };

    const chip = (on: boolean) => [styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surface }];
    const chipText = (on: boolean) => [styles.chipText, { color: on ? '#FFF' : colors.text }];
    const field = [styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }];
    const label = [styles.label, { color: colors.textSecondary }];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="Customer Visit" subtitle="Saved on this phone" onBack={() => router.back()} />

            <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                <Text style={label}>Executive Name</Text>
                <View style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, justifyContent: 'center' }]}>
                    <Text style={[styles.valueText, { color: colors.text }]}>{executive || '-'}</Text>
                </View>

                <Text style={label}>Date of Visit</Text>
                <TextInput style={field} value={dateOfVisit} onChangeText={setDateOfVisit} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />

                <Text style={label}>Along With</Text>
                <View style={styles.chipRow}>
                    {ALONG_WITH_OPTIONS.map(o => {
                        const on = alongWith.includes(o);
                        return (
                            <TouchableOpacity key={o} style={chip(on)} onPress={() => setAlongWith(prev => (on ? prev.filter(x => x !== o) : [...prev, o]))}>
                                <Text style={chipText(on)}>{o}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={label}>Customer Planned</Text>
                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.primary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        placeholder="Search customer, or type a new name"
                        placeholderTextColor={colors.textSecondary}
                        value={plannedQuery}
                        onChangeText={setPlannedQuery}
                    />
                </View>
                {plannedResults.map(c => (
                    <TouchableOpacity key={c.name} style={[styles.resultRow, { borderBottomColor: colors.border }]} onPress={() => addPlanned(c.customer_name || c.name, c.name)}>
                        <Text style={[styles.resultText, { color: colors.text }]}>{c.customer_name || c.name}</Text>
                    </TouchableOpacity>
                ))}
                {plannedQuery.trim().length > 0 && (
                    <TouchableOpacity style={[styles.addRow, { borderColor: colors.primary }]} onPress={() => addPlanned(plannedQuery)}>
                        <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                        <Text style={[styles.addText, { color: colors.primary }]}>Add "{plannedQuery.trim()}" as new customer</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.chipRow}>
                    {plannedCustomers.map(n => (
                        <TouchableOpacity key={n} style={chip(true)} onPress={() => setPlannedCustomers(prev => prev.filter(x => x !== n))}>
                            <Text style={chipText(true)}>{n}  x</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save Visit</Text>}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 8, paddingBottom: 120 },
    label: { fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 4 },
    valueText: { fontSize: 15, fontWeight: '700' },
    input: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, paddingHorizontal: 14, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
    resultRow: { paddingVertical: 12, borderBottomWidth: 1 },
    resultText: { fontSize: 14, fontWeight: '600' },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, padding: 12, marginTop: 6 },
    addText: { fontSize: 14, fontWeight: '700' },
    reportCard: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 10, marginTop: 6 },
    reportNo: { fontSize: 14, fontWeight: '800' },
    saveBtn: { marginTop: 20, borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center' },
    saveText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
