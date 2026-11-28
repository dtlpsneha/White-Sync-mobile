import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert, Modal } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isOrderStatus, OrderSteps } from '@/components/orders/OrderSteps';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { apiGet } from '@/utils/api';
import { API_BASE_URL, apiUrl } from '@/constants/config';
import { pdfViewerHtml, saveStatementToDownloads } from '@/services/customerStatements';
import { getOrderFiles, type OrderFile } from '@/services/orderFiles';
import { attachmentReads, stillReading, type FileRead } from '@/services/attachmentsApi';
import { FileReadView } from '@/components/FileReadView';

const IMAGE_HOST = API_BASE_URL;

type OrderItem = { item_code: string; item_name?: string; brand?: string; qty: number; rate: number; amount: number; uom?: string };
type OrderTax = { description: string; rate: number; tax_amount: number };
type OrderDoc = {
    name: string;
    customer: string;
    customer_name?: string;
    status?: string;
    workflow_state?: string;
    docstatus?: number;
    transaction_date: string;
    items: OrderItem[];
    taxes?: OrderTax[];
    total?: number;
    net_total?: number;
    total_taxes_and_charges?: number;
    grand_total: number;
    attach?: string | null;
};
type Attached = { uri: string; fileName: string; isPdf: boolean; base64: string };

const money = (n: number | undefined | null) =>
    `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const dmy = (iso: string) => {
    const [y, m, d] = (iso || '').split('-');
    return y && m && d ? `${d}-${m}-${y}` : iso || '';
};

export default function SalesOrderDetailScreen() {
    // `stage` comes from My Orders: where this order stands, shown as the five steps.
    const { id, stage } = useLocalSearchParams();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();

    const [order, setOrder] = useState<OrderDoc | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [viewer, setViewer] = useState<Attached | null>(null);
    // Every file on the order (the app attaches each chosen file separately); null = could not load.
    const [files, setFiles] = useState<OrderFile[] | null>([]);
    const [busyFile, setBusyFile] = useState<string | null>(null);
    // What SmartOps read from each file (OCR); null = SmartOps could not be asked.
    const [reads, setReads] = useState<FileRead[] | null>(null);
    const polls = useRef(0);

    const orderId = Array.isArray(id) ? id[0] : id;

    // On every focus, so returning from "Edit" shows the saved changes.
    useFocusEffect(
        useCallback(() => {
            if (orderId) load(orderId);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [orderId])
    );

    const load = async (name: string) => {
        setLoading(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(apiUrl(`/api/resource/Sales Order/${encodeURIComponent(name)}`), cookies);
            const doc: any = (res.data as any)?.data;
            setOrder(res.ok && doc ? doc : null);
            if (res.ok && doc) {
                setFiles(await getOrderFiles(name, doc.attach));
                polls.current = 0;
                attachmentReads('Sales Order', name).then(setReads);
            }
        } catch {
            setOrder(null);
        } finally {
            setLoading(false);
        }
    };

    // While a file is still being read, look again every 5 s (for up to 3 minutes).
    useEffect(() => {
        if (!orderId || !stillReading(reads) || polls.current >= 36) return;
        const t = setTimeout(() => {
            polls.current += 1;
            attachmentReads('Sales Order', orderId).then(r => { if (r) setReads(r); });
        }, 5000);
        return () => clearTimeout(t);
    }, [reads, orderId]);

    const statusText = (o: OrderDoc) => o.workflow_state || o.status || (o.docstatus === 0 ? 'Draft' : o.docstatus === 1 ? 'Submitted' : 'Cancelled');

    const statusColor = (s: string) => {
        const l = (s || '').toLowerCase();
        if (l.includes('approved') || l.includes('complete') || l.includes('submitted') || l.includes('deliver')) return colors.success;
        if (l.includes('cancel')) return colors.danger;
        if (l.includes('draft')) return colors.textSecondary;
        return colors.primary;
    };

    // Downloads the attachment into the app's cache (with the login cookie) so it can be viewed, saved or shared.
    const fetchAttachment = async (url: string): Promise<Attached> => {
        const cookies = await SecureStore.getItemAsync('session_cookies');
        const full = url.startsWith('http') ? url : `${IMAGE_HOST}${url}`;
        const fileName = url.split('/').pop() || 'attachment';
        const uri = `${(FileSystem as any).cacheDirectory}${fileName}`;
        const dl = await (FileSystem as any).downloadAsync(full, uri, { headers: { Cookie: cookies || '' } });
        if (dl.status !== 200) throw new Error('download');
        const isPdf = fileName.toLowerCase().endsWith('.pdf');
        const base64 = isPdf ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }) : '';
        return { uri, fileName, isPdf, base64 };
    };

    // Opens one file in the viewer (downloaded with the login cookie).
    const viewAttachment = async (f: OrderFile) => {
        if (busy) return;
        setBusy(true);
        setBusyFile(f.name);
        try {
            setViewer(await fetchAttachment(f.url));
        } catch {
            Alert.alert('Error', 'Could not open the attachment.');
        } finally {
            setBusy(false);
            setBusyFile(null);
        }
    };

    // Download and share work on the file open in the viewer.
    const downloadAttachment = () => {
        const a = viewer;
        if (!a) return;
        const saved = (() => { try { return saveStatementToDownloads({ fileName: a.fileName, uri: a.uri, base64: a.base64 }); } catch { return ''; } })();
        if (saved) Alert.alert('Saved', `${a.fileName} was saved to Downloads.`);
        else Alert.alert('Not saved', 'Could not save the file to Downloads.');
    };

    const shareAttachment = async () => {
        const a = viewer;
        if (!a) return;
        try {
            if (!(await Sharing.isAvailableAsync())) { Alert.alert('Not available', 'Sharing is not available on this device.'); return; }
            await Sharing.shareAsync(a.uri, { mimeType: a.isPdf ? 'application/pdf' : undefined, dialogTitle: a.fileName });
        } catch {
            Alert.alert('Error', 'Could not share the file.');
        }
    };

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!order) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textSecondary }}>Customer Purchase Order not found</Text>
                <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/sales-orders'))} style={[styles.btn, { backgroundColor: colors.primary, marginTop: 14 }]}>
                    <Text style={styles.btnText}>Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const status = statusText(order);
    const sColor = statusColor(status);
    const isDraft = (order.docstatus ?? 0) === 0 && !status.toLowerCase().includes('cancel');
    const taxes = (order.taxes || []).filter(t => Number(t.tax_amount || 0) !== 0 || Number(t.rate || 0) !== 0);
    const taxTotal = Number(order.total_taxes_and_charges || 0);
    const fileCount = files?.length ?? 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Top bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/sales-orders'))} style={styles.iconBtn} hitSlop={8}>
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.topTitle, { color: colors.text }]} numberOfLines={1}>{order.name}</Text>
                {isDraft ? (
                    <TouchableOpacity onPress={() => router.push(`/sales-orders/create?edit_id=${order.name}` as any)} style={styles.iconBtn} hitSlop={8}>
                        <Ionicons name="create-outline" size={22} color={colors.primary} />
                    </TouchableOpacity>
                ) : <View style={styles.iconBtn} />}
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 + insets.bottom }}>
                {/* Customer and status */}
                <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.rowBetween}>
                        <View style={[styles.pill, { backgroundColor: sColor + '18' }]}>
                            <View style={[styles.dot, { backgroundColor: sColor }]} />
                            <Text style={[styles.pillText, { color: sColor }]}>{status}</Text>
                        </View>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>{dmy(order.transaction_date)}</Text>
                    </View>
                    <Text style={[styles.customer, { color: colors.text }]}>{order.customer_name || order.customer}</Text>
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>{order.customer}</Text>
                </View>

                {/* Where it stands (opened from My Orders) */}
                {isOrderStatus(stage) && (
                    <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <OrderSteps status={stage} colors={colors} />
                    </View>
                )}

                {/* Items */}
                <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Items</Text>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>{order.items.length} line{order.items.length === 1 ? '' : 's'}</Text>
                    </View>
                    {order.items.map((it, i) => (
                        <View key={`${it.item_code}-${i}`} style={[styles.itemRow, { borderTopColor: colors.border }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.itemName, { color: colors.text }]}>{it.item_name || it.item_code}</Text>
                                <Text style={[styles.muted, { color: colors.textSecondary }]}>
                                    {[it.brand, it.item_name && it.item_name !== it.item_code ? it.item_code : ''].filter(Boolean).join(' · ')}
                                </Text>
                                <Text style={[styles.muted, { color: colors.textSecondary, marginTop: 4 }]}>
                                    {it.qty} {it.uom || 'Nos'} × {money(it.rate)}
                                </Text>
                            </View>
                            <Text style={[styles.itemAmount, { color: colors.text }]}>{money(it.amount)}</Text>
                        </View>
                    ))}
                </View>

                {/* Totals and taxes */}
                <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Summary</Text>
                    <View style={styles.totalLine}>
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>Net total</Text>
                        <Text style={[styles.totalValue, { color: colors.text }]}>{money(order.net_total ?? order.total)}</Text>
                    </View>
                    {taxes.length > 0 ? (
                        taxes.map((t, i) => (
                            <View key={`${t.description}-${i}`} style={styles.totalLine}>
                                <Text style={[styles.muted, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                                    {t.description}{Number(t.rate) ? ` @ ${t.rate}%` : ''}
                                </Text>
                                <Text style={[styles.totalValue, { color: colors.text }]}>{money(t.tax_amount)}</Text>
                            </View>
                        ))
                    ) : taxTotal !== 0 ? (
                        <View style={styles.totalLine}>
                            <Text style={[styles.muted, { color: colors.textSecondary }]}>Taxes</Text>
                            <Text style={[styles.totalValue, { color: colors.text }]}>{money(taxTotal)}</Text>
                        </View>
                    ) : null}
                    <View style={[styles.grandRow, { borderTopColor: colors.border }]}>
                        <Text style={[styles.grandLabel, { color: colors.text }]}>Grand total</Text>
                        <Text style={[styles.grandValue, { color: colors.primary }]}>{money(order.grand_total)}</Text>
                    </View>
                </View>

                {/* Attachments: every file on the order, tap one to view, then download or share */}
                <View style={[styles.card, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.rowBetween}>
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Attachments</Text>
                        <View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}>
                            <Ionicons name="attach" size={13} color={colors.primaryVariant} />
                            <Text style={[styles.countText, { color: colors.primaryVariant }]}>{files ? fileCount : '—'}</Text>
                        </View>
                    </View>
                    {files === null ? (
                        <TouchableOpacity onPress={() => orderId && load(orderId)}>
                            <Text style={[styles.muted, { color: colors.danger }]}>Could not load the files. Tap to try again.</Text>
                        </TouchableOpacity>
                    ) : fileCount === 0 ? (
                        <Text style={[styles.muted, { color: colors.textSecondary }]}>No files attached to this order.</Text>
                    ) : files.map(f => (
                        <View key={f.name} style={[styles.fileBlock, { borderColor: colors.border }]}>
                            <TouchableOpacity style={styles.fileHead} onPress={() => viewAttachment(f)} disabled={busy}>
                                <Ionicons name={f.isPdf ? 'document-text' : 'image'} size={26} color={colors.primary} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>{f.fileName}</Text>
                                    <Text style={[styles.muted, { color: colors.textSecondary }]}>{f.isPdf ? 'PDF' : 'Image'} · Tap to view</Text>
                                </View>
                                {busyFile === f.name ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="eye-outline" size={20} color={colors.textSecondary} />}
                            </TouchableOpacity>
                            {reads !== null && (
                                <View style={[styles.readBox, { borderTopColor: colors.border }]}>
                                    <FileReadView read={reads.find(r => r.file_url === f.url)} theme={theme} />
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Viewer for the attachment */}
            <Modal visible={!!viewer} animationType="slide" onRequestClose={() => setViewer(null)}>
                <View style={[styles.container, { backgroundColor: '#111827' }]}>
                    <View style={[styles.viewerBar, { paddingTop: insets.top + 8 }]}>
                        <TouchableOpacity onPress={() => setViewer(null)} style={styles.iconBtn} hitSlop={8}>
                            <Ionicons name="close" size={24} color="#FFF" />
                        </TouchableOpacity>
                        <Text style={styles.viewerTitle} numberOfLines={1}>{viewer?.fileName}</Text>
                        <TouchableOpacity onPress={downloadAttachment} style={styles.iconBtn} hitSlop={8}>
                            <Ionicons name="download-outline" size={22} color="#FFF" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={shareAttachment} style={styles.iconBtn} hitSlop={8}>
                            <Ionicons name="share-social-outline" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                    {viewer?.isPdf ? (
                        <WebView originWhitelist={['*']} source={{ html: pdfViewerHtml(viewer.base64) }} javaScriptEnabled style={{ flex: 1 }} />
                    ) : viewer ? (
                        <Image source={{ uri: viewer.uri }} style={{ flex: 1 }} resizeMode="contain" />
                    ) : null}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1 },
    topTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', marginHorizontal: 8 },
    iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    viewerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 10, backgroundColor: '#111827' },
    viewerTitle: { flex: 1, color: '#FFF', fontSize: 14, fontWeight: '700', marginHorizontal: 6 },
    card: { borderRadius: Radius.lg, borderWidth: 1, padding: 16, gap: 8 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
    customer: { fontSize: 18, fontWeight: '900', marginTop: 6 },
    muted: { fontSize: 12, fontWeight: '600' },
    sectionTitle: { fontSize: 15, fontWeight: '900' },
    itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 12, borderTopWidth: 1 },
    itemName: { fontSize: 14, fontWeight: '800' },
    itemAmount: { fontSize: 14, fontWeight: '900' },
    totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
    totalValue: { fontSize: 14, fontWeight: '800' },
    grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, marginTop: 8, paddingTop: 12 },
    grandLabel: { fontSize: 15, fontWeight: '900' },
    grandValue: { fontSize: 20, fontWeight: '900' },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: Radius.md, padding: 12 },
    fileBlock: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
    fileHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
    readBox: { borderTopWidth: 1, padding: 12 },
    countPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
    countText: { fontSize: 12, fontWeight: '800' },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, paddingVertical: 10 },
    actionText: { fontSize: 14, fontWeight: '800' },
    btn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: Radius.md },
    btnText: { color: '#FFF', fontWeight: '800' },
});
