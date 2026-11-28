import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FloatingNotifications } from '@/modules/floating-notifications';
import { localTodayIso } from '@/services/customerStatements';
import {
    BankLine,
    PAY_BANK_NAME,
    bankBookHtml,
    bankCustomerNames,
    executiveFor,
    loadAllBankLines,
    loadExecutiveMap,
    ymdToIso,
} from '@/services/tallyData';

const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftIso = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toIso(d);
};

/** Bank receipts by customer and date range, as on the ERP Daily Sales Report "Payment Details" tab. */
export default function PaymentDetailsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const today = localTodayIso();
    const [customer, setCustomer] = useState('ALL');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [fromIso, setFromIso] = useState(today);
    const [toIsoDate, setToIsoDate] = useState(today);
    const [allLines, setAllLines] = useState<BankLine[]>([]);
    const [execMap, setExecMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [iosField, setIosField] = useState<'from' | 'to' | null>(null);

    useEffect(() => {
        loadExecutiveMap().then(setExecMap).catch(() => { /* names fall back to codes */ });
        loadAllBankLines()
            .then(setAllLines)
            .catch(() => setError('Could not load payment details. Check the connection and try again.'))
            .finally(() => setLoading(false));
    }, []);

    const customerNames = useMemo(() => bankCustomerNames(allLines), [allLines]);
    const typed = customer.trim().toUpperCase();
    const options = useMemo(() => {
        const hits = !typed || typed === 'ALL' ? customerNames : customerNames.filter(n => n.toUpperCase().includes(typed));
        return ['ALL', ...hits];
    }, [customerNames, typed]);

    const isAll = customer.trim().toUpperCase() === 'ALL';
    const who = isAll ? 'All customers' : customer.trim();
    const rangeValid = fromIso <= toIsoDate;

    const lines = useMemo(() => {
        if (!rangeValid) return [];
        const f = fromIso.replace(/-/g, '');
        const t = toIsoDate.replace(/-/g, '');
        return allLines.filter(r => {
            if (r[0] < f || r[0] > t) return false;
            if (isAll) return true;
            return String(r[3] || '').split(', ').some(n => n.trim() === customer.trim());
        });
    }, [allLines, fromIso, toIsoDate, customer, isAll, rangeValid]);

    const total = lines.reduce((s, r) => s + r[4], 0);

    const summary = !customer.trim()
        ? 'Type a customer name, or ALL.'
        : !rangeValid
            ? 'Choose a valid From and To date.'
            : lines.length
                ? `${lines.length} receipt(s) from ${who} between ${dmy(fromIso)} and ${dmy(toIsoDate)}. Total ${money(total)}`
                : `No receipts from ${who} between ${dmy(fromIso)} and ${dmy(toIsoDate)}.`;

    /** Builds the bank-book PDF for the selected customer and range. */
    const makePdf = async () => {
        const f = fromIso.replace(/-/g, '');
        const t = toIsoDate.replace(/-/g, '');
        const printed = await Print.printToFileAsync({ html: bankBookHtml(f, t, who, lines) });
        const name = (isAll ? 'All' : customer.trim().replace(/[^A-Za-z0-9]+/g, '_')) + '_' + f + '_' + t;
        const fileName = `Bank_Book_${name}.pdf`;
        const uri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.deleteAsync(uri, { idempotent: true });
        await FileSystem.moveAsync({ from: printed.uri, to: uri });
        return { uri, fileName };
    };

    const share = async () => {
        if (!lines.length || busy) return;
        setBusy(true);
        try {
            const { uri } = await makePdf();
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
            } else {
                Alert.alert('Not available', 'Sharing is not available on this device.');
            }
        } catch {
            Alert.alert('Share failed', 'Could not create the PDF.');
        } finally {
            setBusy(false);
        }
    };

    const download = async () => {
        if (!lines.length || busy) return;
        setBusy(true);
        try {
            const { uri, fileName } = await makePdf();
            const saved = FloatingNotifications.saveToDownloads(uri.replace(/^file:\/\//, ''), fileName);
            if (saved) Alert.alert('Saved', `${fileName} was saved to Downloads.`);
            else Alert.alert('Download failed', 'Could not save the PDF to Downloads.');
        } catch {
            Alert.alert('Download failed', 'Could not save the PDF to Downloads.');
        } finally {
            setBusy(false);
        }
    };

    const openPicker = (value: string, setValue: (v: string) => void, field: 'from' | 'to') => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: new Date(`${value}T00:00:00`),
                mode: 'date',
                maximumDate: new Date(`${today}T00:00:00`),
                onChange: (event, selected) => {
                    if (event.type === 'set' && selected) setValue(toIso(selected));
                },
            });
        } else {
            setIosField(v => (v === field ? null : field));
        }
    };

    const dateRow = (label: string, value: string, setValue: (v: string) => void, field: 'from' | 'to') => (
        <View style={styles.dateField}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
            <TouchableOpacity
                style={[styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => openPicker(value, setValue, field)}
                accessibilityLabel={`${label} date`}
            >
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={[styles.dateText, { color: colors.text }]}>{dmy(value)}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title="Payment Details"
                subtitle={PAY_BANK_NAME}
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                right={
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.headerBtn} onPress={share} disabled={!lines.length || busy} accessibilityLabel="Share PDF">
                            <Ionicons name="share-outline" size={20} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerBtn} onPress={download} disabled={!lines.length || busy} accessibilityLabel="Download PDF">
                            <Ionicons name="download-outline" size={20} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                }
            />

            <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
                <Text style={[styles.label, { color: colors.textSecondary }]}>Customer</Text>
                <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="search" size={18} color={colors.primary} />
                    <TextInput
                        style={[styles.searchInput, { color: colors.text }]}
                        value={customer}
                        onChangeText={v => { setCustomer(v); setPickerOpen(true); }}
                        onFocus={() => setPickerOpen(true)}
                        placeholder="Type customer name, or ALL"
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="characters"
                    />
                </View>
                {pickerOpen && (
                    <View style={[styles.menu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                            {options.length <= 1 && typed && typed !== 'ALL' ? (
                                <Text style={[styles.sub, { color: colors.textSecondary, padding: 12 }]}>No customer matches. Try another name.</Text>
                            ) : options.map(o => (
                                <TouchableOpacity
                                    key={o}
                                    style={[styles.option, { borderBottomColor: colors.border }]}
                                    onPress={() => { setCustomer(o); setPickerOpen(false); }}
                                >
                                    <Text style={[styles.optionText, { color: colors.text, fontWeight: o === customer ? '800' : '600' }]}>{o}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}

                <View style={styles.dateRow}>
                    {dateRow('From', fromIso, setFromIso, 'from')}
                    {dateRow('To', toIsoDate, setToIsoDate, 'to')}
                </View>
                {iosField && Platform.OS === 'ios' && (
                    <DateTimePicker
                        value={new Date(`${iosField === 'from' ? fromIso : toIsoDate}T00:00:00`)}
                        mode="date"
                        display="inline"
                        maximumDate={new Date(`${today}T00:00:00`)}
                        onChange={(_e, selected) => {
                            if (selected) (iosField === 'from' ? setFromIso : setToIsoDate)(toIso(selected));
                        }}
                    />
                )}

                {loading ? (
                    <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
                ) : (
                    <Text style={[styles.sub, { color: colors.textSecondary }]}>{error || summary}</Text>
                )}

                {!loading && !error && lines.map((r, i) => (
                    <View key={`${r[2]}-${i}`} style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={styles.cardTop}>
                            <Text style={[styles.vch, { color: colors.text }]}>{dmy(ymdToIso(r[0]))} · {r[1]} · {r[2]}</Text>
                            <Text style={[styles.amount, { color: colors.primary }]}>{money(r[4])}</Text>
                        </View>
                        <Text style={[styles.particulars, { color: colors.text }]}>{r[3]}</Text>
                        <Text style={[styles.sub, { color: colors.textSecondary }]}>Executive: {executiveFor(r, execMap) || '-'}</Text>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 10 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14 },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 12 },
    menu: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
    option: { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
    optionText: { fontSize: 14 },
    dateRow: { flexDirection: 'row', gap: 10 },
    dateField: { flex: 1, gap: 4 },
    dateBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 12 },
    arrowBtn: { width: 36, height: 44, justifyContent: 'center', alignItems: 'center' },
    dateText: { flex: 1, fontSize: 14, fontWeight: '700' },
    sub: { fontSize: 12, fontWeight: '600' },
    card: { borderWidth: 1, borderRadius: Radius.md, padding: 12, gap: 4 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    vch: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
    particulars: { fontSize: 14, fontWeight: '700' },
    amount: { fontSize: 15, fontWeight: '800' },
});
