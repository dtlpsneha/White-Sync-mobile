import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { FloatingNotifications } from '@/modules/floating-notifications';
import { localTodayIso } from '@/services/customerStatements';
import {
    BankLine,
    PAY_BANK_NAME,
    bankBookHtml,
    executiveFor,
    loadBankLines,
    loadExecutiveMap,
    ymdToIso,
} from '@/services/tallyData';

const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (ymd: string) => {
    const d = new Date(`${ymdToIso(ymd)}T00:00:00`);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
};
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Tally bank-book receipts for one day, as on the ERP Daily Sales Report "Payment Details" tab. */
export default function PaymentDetailsScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [dateIso, setDateIso] = useState(localTodayIso());
    const [iosPickerOpen, setIosPickerOpen] = useState(false);
    const [lines, setLines] = useState<BankLine[]>([]);
    const [execMap, setExecMap] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        loadExecutiveMap().then(setExecMap);
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const rows = await loadBankLines(dateIso.replace(/-/g, ''));
                if (!cancelled) setLines(rows);
            } catch {
                if (!cancelled) setError('Could not load payment details. Check the connection and try again.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [dateIso]);

    const openPicker = () => {
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: new Date(`${dateIso}T00:00:00`),
                mode: 'date',
                maximumDate: new Date(),
                onChange: (event, selected) => {
                    if (event.type === 'set' && selected) setDateIso(toIso(selected));
                },
            });
        } else {
            setIosPickerOpen(v => !v);
        }
    };

    /** Builds the bank-book PDF and returns its local file. */
    const makePdf = async () => {
        const ymd = dateIso.replace(/-/g, '');
        const printed = await Print.printToFileAsync({ html: bankBookHtml(ymd, lines) });
        const fileName = `Bank_Book_ICICI_47963_${ymd}.pdf`;
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

            <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={[styles.dateBox, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={openPicker}>
                    <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                    <Text style={[styles.dateText, { color: colors.text }]}>{dmy(dateIso.replace(/-/g, ''))}</Text>
                    {loading
                        ? <ActivityIndicator size="small" color={colors.primary} />
                        : <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />}
                </TouchableOpacity>
                {iosPickerOpen && Platform.OS === 'ios' && (
                    <DateTimePicker
                        value={new Date(`${dateIso}T00:00:00`)}
                        mode="date"
                        display="inline"
                        maximumDate={new Date()}
                        onChange={(_e, selected) => { if (selected) setDateIso(toIso(selected)); }}
                    />
                )}

                {error ? (
                    <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text>
                ) : loading ? null : lines.length === 0 ? (
                    <Text style={[styles.hint, { color: colors.textSecondary }]}>
                        No debit (receipt) transactions in {PAY_BANK_NAME} on {dmy(dateIso.replace(/-/g, ''))}.
                    </Text>
                ) : (
                    <>
                        <Text style={[styles.sub, { color: colors.textSecondary }]}>
                            {lines.length} receipt(s) on {dmy(dateIso.replace(/-/g, ''))}
                        </Text>
                        {lines.map((r, i) => (
                            <View
                                key={`${r[2]}-${i}`}
                                style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                            >
                                <View style={styles.cardTop}>
                                    <Text style={[styles.vch, { color: colors.text }]}>{r[1]} · {r[2]}</Text>
                                    <Text style={[styles.amount, { color: colors.primary }]}>{money(r[4])}</Text>
                                </View>
                                <Text style={[styles.particulars, { color: colors.text }]}>{r[3]}</Text>
                                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                                    Executive: {executiveFor(r, execMap) || '-'}
                                </Text>
                            </View>
                        ))}
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    pad: { padding: 16, gap: 10 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    dateBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14 },
    dateText: { flex: 1, fontSize: 15, paddingVertical: 12, fontWeight: '600' },
    hint: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 24 },
    sub: { fontSize: 12, fontWeight: '500' },
    card: { borderWidth: 1, borderRadius: Radius.md, padding: 12, gap: 4 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    vch: { fontSize: 12, fontWeight: '700' },
    particulars: { fontSize: 14, fontWeight: '700' },
    amount: { fontSize: 15, fontWeight: '800' },
});
