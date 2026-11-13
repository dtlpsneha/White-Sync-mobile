import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Customer } from '@/services/frappeSearch';
import { getUsedCustomers } from '@/services/dailySalesReportApi';
import {
    StatementDoc,
    StatementKind,
    StatementJob,
    localTodayIso,
    prepareStatement,
    writeStatementPdf,
    pdfViewerHtml,
    saveStatementToDownloads,
    shareStatement,
} from '@/services/customerStatements';

/**
 * Home > Customer Statements. Pick a customer, then view the Outstanding or
 * Ledger PDF built from ERP (fiscal year start to today) and download it.
 */
export default function CustomerStatementScreen() {
    const { kind: kindParam } = useLocalSearchParams();
    const kind: StatementKind = kindParam === 'ledger' ? 'ledger' : 'outstanding';
    const title = kind === 'outstanding' ? 'Outstanding PDF' : 'Ledger PDF';

    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();

    const [query, setQuery] = useState('');
    const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
    const [results, setResults] = useState<Customer[]>([]);
    const [loadingList, setLoadingList] = useState(false);
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [building, setBuilding] = useState(false);
    const [job, setJob] = useState<{ job: StatementJob; done: (json: string) => void } | null>(null);
    const [doc, setDoc] = useState<StatementDoc | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Customers with sales invoices from 1 January 2024 onwards (the same names the
    // Sales Invoice History filter uses).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            const used = await getUsedCustomers({ fromDate: '2024-01-01', toDate: localTodayIso() });
            if (cancelled) return;
            const names = used.ok ? used.data : [];
            // Records whose names match once punctuation is removed (e.g. "PLANT - 5" and "PLANT � 5")
            // are one customer in the list. Each entry keeps all of its records; the statement uses
            // the first one that ERP can resolve.
            const groups = new Map<string, string[]>();
            names.forEach(n => {
                const key = n.toLowerCase().replace(/[^a-z0-9]/g, '');
                groups.set(key, [...(groups.get(key) || []), n]);
            });
            const list = Array.from(groups.values())
                .map(ids => ({ name: ids[0], customer_name: ids[0], ids } as Customer & { ids: string[] }))
                .sort((x, y) => x.name.localeCompare(y.name));
            setAllCustomers(list);
            setLoadingList(false);
        })();
        return () => { cancelled = true; };
    }, []);

    // Search runs on the list above, so it never shows customers without 2024+ invoices.
    useEffect(() => {
        if (customer) {
            setResults([]);
            return;
        }
        const q = query.trim().toLowerCase();
        setResults(q ? allCustomers.filter(c => `${c.customer_name} ${c.name}`.toLowerCase().includes(q)) : allCustomers);
    }, [query, customer, allCustomers]);

    // Runs ERP's PDF code in a hidden WebView; resolves with the JSON the page posts back.
    const runJob = (j: StatementJob) => new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => { setJob(null); reject(new Error('timed out')); }, 60000);
        setJob({ job: j, done: (json: string) => { clearTimeout(timer); setJob(null); resolve(json); } });
    });

    const pickCustomer = async (c: Customer) => {
        setCustomer(c);
        setQuery(c.customer_name || c.name);
        setResults([]);
        setDoc(null);
        setError(null);
        setBuilding(true);
        // Blank dates: the statement runs from the fiscal year start to today.
        // Try each record of this customer until one gives a statement.
        const ids = (c as Customer & { ids?: string[] }).ids || [c.name];
        let last: { ok: false; error: string } | null = null;
        for (const id of ids) {
            try {
                const prep = await prepareStatement(kind, id, '', '');
                if (!prep.ok) { last = prep; continue; }
                const parsed = JSON.parse(await runJob(prep.job));
                if (parsed.error) { last = { ok: false, error: parsed.error }; continue; }
                const saved = await writeStatementPdf(prep.job.fileName, parsed.data);
                setBuilding(false);
                setDoc(saved);
                return;
            } catch {
                last = { ok: false, error: 'Could not build the statement.' };
            }
        }
        setBuilding(false);
        setError(last ? last.error : 'Could not build the statement.');
    };

    const chooseAnotherCustomer = () => {
        setCustomer(null);
        setDoc(null);
        setError(null);
        setQuery('');
    };

    const onBack = () => {
        if (customer) chooseAnotherCustomer();
        else router.back();
    };

    const share = async () => {
        if (!doc) return;
        try {
            const shared = await shareStatement(doc);
            if (!shared) Alert.alert('Not available', 'Sharing is not available on this device.');
        } catch {
            Alert.alert('Share failed', 'Could not share the PDF.');
        }
    };

    const save = async () => {
        if (!doc) return;
        const savedTo = (() => { try { return saveStatementToDownloads(doc); } catch { return ''; } })();
        if (savedTo) {
            Alert.alert('Saved', `${doc.fileName} was saved to Downloads.`);
            return;
        }
        try {
            const shared = await shareStatement(doc);
            if (!shared) Alert.alert('Not available', 'Could not save or share the PDF on this device.');
        } catch {
            Alert.alert('Download failed', 'Could not save or share the PDF.');
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader
                title={title}
                subtitle={customer ? (customer.customer_name || customer.name) : 'Choose a customer'}
                onBack={onBack}
                right={doc ? (
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.headerBtn} onPress={share} accessibilityLabel="Share PDF">
                            <Ionicons name="share-outline" size={20} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerBtn} onPress={save} accessibilityLabel="Download PDF">
                            <Ionicons name="download-outline" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                ) : undefined}
            />

            {job && (
                <WebView
                    originWhitelist={['*']}
                    source={{ html: job.job.html }}
                    javaScriptEnabled
                    onMessage={e => job.done(e.nativeEvent.data)}
                    style={{ width: 1, height: 1, opacity: 0 }}
                />
            )}

            {doc ? (
                <WebView
                    originWhitelist={['*']}
                    source={{ html: pdfViewerHtml(doc.base64) }}
                    javaScriptEnabled
                    style={{ flex: 1 }}
                />
            ) : building ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>Preparing statement…</Text>
                </View>
            ) : customer ? (
                <View style={styles.centered}>
                    <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
                    <Text style={[styles.hint, { color: colors.text }]}>{error || 'Could not build the statement.'}</Text>
                    <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={chooseAnotherCustomer}>
                        <Text style={styles.buttonText}>Choose another customer</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView contentContainerStyle={{ padding: s(16), gap: vs(10), paddingBottom: 120 + insets.bottom }} keyboardShouldPersistTaps="handled">
                    <View style={[styles.searchBox, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="search" size={16} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Search customer by name or ID"
                            placeholderTextColor={colors.placeholder}
                            value={query}
                            onChangeText={setQuery}
                            autoFocus
                        />
                        {loadingList && <ActivityIndicator size="small" color={colors.primary} />}
                    </View>

                    {results.map(c => (
                        <TouchableOpacity
                            key={c.name}
                            style={[styles.row, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => pickCustomer(c)}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.rowTitle, { color: colors.text }]}>{c.customer_name || c.name}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                        </TouchableOpacity>
                    ))}

                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    hint: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
    button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.md },
    buttonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 4 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500', paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: 14 },
    rowTitle: { fontSize: 15, fontWeight: '700' },
    rowSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
});
