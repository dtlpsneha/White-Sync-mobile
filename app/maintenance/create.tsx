import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/Midnight';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Customer, searchCustomers } from '@/services/frappeSearch';
import { saveVisit, syncVisitToErp, tellTeam } from '@/services/visitExtras';

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
    const insets = useSafeAreaInsets();

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
            const synced = await tellTeam(await syncVisitToErp(visit));
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

    const chip = (on: boolean) => [styles.chip, { borderColor: on ? colors.ink : colors.border, backgroundColor: on ? colors.ink : colors.surface }];
    const chipText = (on: boolean) => [styles.chipText, { color: on ? '#FFF' : colors.text }];
    const label = [styles.label, { color: colors.textSecondary }];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader title="New visit" subtitle="Customer Visit · saved on this phone" align="left" onBack={() => router.back()} />

            <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                <SectionCard icon="person" title="Who & when">
                    <View style={{ gap: 8 }}>
                        <Text style={label}>Executive Name</Text>
                        <View style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}>
                            <Text style={[styles.valueText, { color: colors.text }]}>{executive || '-'}</Text>
                        </View>
                        <Text style={[label, { marginTop: 4 }]}>Date of Visit</Text>
                        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text, fontWeight: '700' }]}
                                value={dateOfVisit}
                                onChangeText={setDateOfVisit}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={colors.placeholder}
                            />
                        </View>
                    </View>
                </SectionCard>

                <SectionCard icon="people" title="Along with" subtitle="Pick everyone who joins">
                    <View style={styles.chipRow}>
                        {ALONG_WITH_OPTIONS.map(o => {
                            const on = alongWith.includes(o);
                            const alone = alongWith.includes('Alone');
                            // "Alone" stands on its own: picking it clears the rest and disables them.
                            const blocked = alone && o !== 'Alone';
                            return (
                                <TouchableOpacity
                                    key={o}
                                    style={[chip(on), blocked && { opacity: 0.35 }]}
                                    disabled={blocked}
                                    onPress={() => setAlongWith(prev => {
                                        if (o === 'Alone') return on ? [] : ['Alone'];
                                        return on ? prev.filter(x => x !== o) : [...prev.filter(x => x !== 'Alone'), o];
                                    })}
                                >
                                    <Text style={chipText(on)}>{o}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </SectionCard>

                <SectionCard
                    icon="business"
                    title="Customers planned"
                    subtitle={plannedCustomers.length ? `${plannedCustomers.length} selected` : 'Search, or type a new name'}
                >
                    <View style={{ gap: 8 }}>
                        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <Ionicons name="search" size={18} color={colors.primary} />
                            <TextInput
                                style={[styles.searchInput, { color: colors.text }]}
                                placeholder="Search customer, or type a new name"
                                placeholderTextColor={colors.placeholder}
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
                                <Text style={[styles.addText, { color: colors.primaryVariant }]}>{`Add "${plannedQuery.trim()}" as new customer`}</Text>
                            </TouchableOpacity>
                        )}
                        {plannedCustomers.length > 0 && (
                            <View style={styles.chipRow}>
                                {plannedCustomers.map(n => (
                                    <TouchableOpacity
                                        key={n}
                                        style={[styles.selChip, { backgroundColor: colors.primarySoft }]}
                                        onPress={() => setPlannedCustomers(prev => prev.filter(x => x !== n))}
                                    >
                                        <Text style={[styles.selChipText, { color: colors.primaryVariant }]}>{n}</Text>
                                        <Ionicons name="close" size={14} color={colors.primaryVariant} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>
                </SectionCard>
            </ScrollView>

            <View style={[styles.actBar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
                    {saving ? <ActivityIndicator color="#FFF" /> : (
                        <>
                            <Ionicons name="checkmark" size={20} color="#FFF" />
                            <Text style={styles.saveText}>Save visit</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 14, paddingBottom: 32 },
    label: { fontSize: 12, fontWeight: '700' },
    valueText: { fontSize: 15, fontWeight: '700' },
    input: { borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, borderWidth: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: Radius.pill, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    selChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 10, paddingVertical: 7, borderRadius: Radius.pill },
    selChipText: { fontSize: 12.5, fontWeight: '800' },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, paddingHorizontal: 14, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
    resultRow: { paddingVertical: 12, borderBottomWidth: 1 },
    resultText: { fontSize: 14, fontWeight: '600' },
    addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: Radius.md, padding: 12 },
    addText: { fontSize: 14, fontWeight: '700' },
    actBar: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 14 },
    saveBtn: { flexDirection: 'row', gap: 8, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...Shadow.raised('light'), shadowColor: '#E4572E' },
    saveText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
