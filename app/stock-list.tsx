import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    STOCK_BRANDS,
    STOCK_TARGET_WAREHOUSE,
    StockData,
    StockItem,
    loadStockData,
    lotsBreakdown,
    stockBrandOf,
    stockTotal,
    storesQty,
} from '@/services/tallyData';

const qty = (n: number) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const money = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Tally Stock List: brand -> items -> item detail, as on the ERP Daily Sales Report tab. */
export default function StockListScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [data, setData] = useState<StockData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [brand, setBrand] = useState<string | null>(null);
    const [itemCode, setItemCode] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [onlyStock, setOnlyStock] = useState(true);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await loadStockData());
        } catch {
            setError('Could not load stock data. Check the connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const brandCounts = useMemo(() => {
        const counts: Record<string, { all: number; stock: number }> = {};
        (data?.items || []).forEach(it => {
            const k = stockBrandOf(it) || '';
            counts[k] = counts[k] || { all: 0, stock: 0 };
            counts[k].all++;
            if (stockTotal(data!, it.item_code) > 0) counts[k].stock++;
        });
        return counts;
    }, [data]);

    const visibleItems: StockItem[] = useMemo(() => {
        if (!data || !brand) return [];
        const q = search.trim().toLowerCase();
        return data.items
            .filter(it => stockBrandOf(it) === brand)
            .filter(it => !onlyStock || stockTotal(data, it.item_code) > 0)
            .filter(it => !q || `${it.item_code} ${it.item_name || ''}`.toLowerCase().includes(q))
            .sort((a, b) => (a.item_code < b.item_code ? -1 : 1));
    }, [data, brand, search, onlyStock]);

    const listTotal = useMemo(
        () => (data ? visibleItems.reduce((s, it) => s + stockTotal(data, it.item_code), 0) : 0),
        [data, visibleItems],
    );

    const onBack = () => {
        if (itemCode) setItemCode(null);
        else if (brand) { setBrand(null); setSearch(''); }
        else router.back();
    };

    // Android back gesture / button: step back inside this screen (item -> items -> brands)
    // before leaving it, instead of jumping straight to the dashboard.
    useFocusEffect(useCallback(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (itemCode) { setItemCode(null); return true; }
            if (brand) { setBrand(null); setSearch(''); return true; }
            return false;
        });
        return () => sub.remove();
    }, [itemCode, brand]));

    const subtitle = itemCode ? 'Item detail' : brand ? brand : 'Stock by brand';
    const item = data && itemCode ? data.items.find(i => i.item_code === itemCode) : undefined;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <ScreenHeader
                title="Tally Stock List"
                subtitle={subtitle}
                onBack={onBack}
                rightIcon="refresh"
                onRightPress={load}
            />

            {loading ? (
                <View style={styles.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : error ? (
                <View style={styles.centered}>
                    <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
                    <Text style={[styles.hint, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={load}>
                        <Text style={styles.buttonText}>Try again</Text>
                    </TouchableOpacity>
                </View>
            ) : !data ? null : itemCode && item ? (
                <ScrollView contentContainerStyle={styles.pad}>
                    <Text style={[styles.code, { color: colors.textSecondary }]}>{item.item_code}</Text>
                    <Text style={[styles.name, { color: colors.text }]}>{item.item_name}</Text>
                    <Text style={[styles.sub, { color: colors.textSecondary }]}>{brand} · UOM {item.stock_uom}</Text>

                    <View style={[styles.table, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Row label="Warehouse" value="Tally Stock List" header colors={colors} />
                        {(data.binsByItem[item.item_code] || [])
                            .slice()
                            .sort((a, b) => (a.warehouse < b.warehouse ? -1 : 1))
                            .map(b => {
                                const v = b.warehouse === STOCK_TARGET_WAREHOUSE ? storesQty(data, item.item_code) : Number(b.actual_qty || 0);
                                return <Row key={b.warehouse} label={b.warehouse} value={qty(v)} negative={v < 0} colors={colors} />;
                            })}
                        <Row label="Total (Tally)" value={qty(stockTotal(data, item.item_code))} bold colors={colors} />
                    </View>
                    <Text style={[styles.sub, { color: colors.textSecondary }]}>Stores - W&C = Tally total less the other warehouses in ERP.</Text>

                    <LotsSection data={data} code={item.item_code} colors={colors} />
                </ScrollView>
            ) : brand ? (
                <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
                    <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="search" size={16} color={colors.textSecondary} />
                        <TextInput
                            style={[styles.searchInput, { color: colors.text }]}
                            placeholder="Search item code or name"
                            placeholderTextColor={colors.placeholder}
                            value={search}
                            onChangeText={setSearch}
                        />
                    </View>
                    <TouchableOpacity style={styles.toggle} onPress={() => setOnlyStock(v => !v)}>
                        <Ionicons name={onlyStock ? 'checkbox' : 'square-outline'} size={18} color={colors.primary} />
                        <Text style={[styles.sub, { color: colors.text }]}>Only items with stock</Text>
                    </TouchableOpacity>

                    {visibleItems.length === 0 ? (
                        <Text style={[styles.hint, { color: colors.textSecondary }]}>No items match.</Text>
                    ) : visibleItems.map(it => {
                        const t = stockTotal(data, it.item_code);
                        return (
                            <TouchableOpacity
                                key={it.item_code}
                                style={[styles.itemRow, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                                onPress={() => setItemCode(it.item_code)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.itemCode, { color: colors.textSecondary }]} numberOfLines={1}>{it.item_code}</Text>
                                    <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={2}>{it.item_name}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.itemQty, { color: t < 0 ? colors.danger : colors.text }]}>{qty(t)}</Text>
                                    <Text style={[styles.sub, { color: colors.textSecondary }]}>{it.stock_uom}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}

                    {visibleItems.length > 0 && (
                        <View style={[styles.totalBar, { backgroundColor: colors.primarySoft }]}>
                            <Text style={[styles.itemName, { color: colors.text }]}>Total ({visibleItems.length} items)</Text>
                            <Text style={[styles.itemQty, { color: colors.primary }]}>{qty(listTotal)}</Text>
                        </View>
                    )}
                </ScrollView>
            ) : (
                <ScrollView contentContainerStyle={styles.pad}>
                    {STOCK_BRANDS.map(b => {
                        const c = brandCounts[b] || { all: 0, stock: 0 };
                        return (
                            <TouchableOpacity
                                key={b}
                                style={[styles.brandCard, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
                                onPress={() => setBrand(b)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.itemName, { color: colors.text }]}>{b}</Text>
                                    <Text style={[styles.sub, { color: colors.textSecondary }]}>{c.all} items · {c.stock} with stock</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

function LotsSection({ data, code, colors }: { data: StockData; code: string; colors: any }) {
    const b = lotsBreakdown(data, code);
    if (!data.lots[code]) return <Text style={[styles.sub, { color: colors.textSecondary }]}>Purchase rate detail is not loaded yet.</Text>;
    if (!b) return <Text style={[styles.sub, { color: colors.textSecondary }]}>No stock on hand, so there are no purchase rates to show.</Text>;
    return (
        <View style={{ marginTop: 16, gap: 8 }}>
            <Text style={[styles.itemName, { color: colors.text }]}>Purchase rates of the {qty(b.qty)} Nos on hand</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Average rate {money(b.average)} per Nos, value {money(b.value)}
            </Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {b.rateCount > 1 ? `The stock on hand was bought at ${b.rateCount} different rates.` : 'All of the stock on hand was bought at the same rate.'}
            </Text>
            {b.untraced > 0 && <Text style={[styles.sub, { color: colors.danger }]}>{qty(b.untraced)} Nos are not traced to any purchase in Tally.</Text>}
            <View style={[styles.table, Shadow.card('light'), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.lotRow, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.lotHead, styles.lotMain, { color: colors.text }]}>Date · Source · Voucher</Text>
                    <Text style={[styles.lotHead, styles.lotNum, { color: colors.text }]}>Qty</Text>
                    <Text style={[styles.lotHead, styles.lotNum, { color: colors.text }]}>Rate</Text>
                    <Text style={[styles.lotHead, styles.lotNum, { color: colors.text }]}>Value</Text>
                </View>
                {b.used.map((u, i) => (
                    <View key={`${u.voucher}-${i}`} style={[styles.lotRow, { borderTopColor: colors.border }]}>
                        <View style={styles.lotMain}>
                            <Text style={[styles.cell, { color: colors.text }]}>{u.date}</Text>
                            <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>{u.source} · {u.voucher}</Text>
                        </View>
                        <Text style={[styles.lotNumText, styles.lotNum, { color: colors.text }]}>{qty(u.qty)}</Text>
                        <Text style={[styles.lotNumText, styles.lotNum, { color: colors.text }]}>{money(u.rate)}</Text>
                        <Text style={[styles.lotNumText, styles.lotNum, { color: colors.text }]}>{money(u.value)}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

function Row({ label, value, header, bold, negative, colors }: any) {
    return (
        <View style={[styles.row, { borderTopColor: colors.border, backgroundColor: header ? colors.primarySoft : 'transparent' }]}>
            <Text style={[styles.cell, { color: colors.text, fontWeight: header || bold ? '800' : '600', flex: 1 }]} numberOfLines={2}>{label}</Text>
            <Text style={[styles.cell, { color: negative ? colors.danger : colors.text, fontWeight: header || bold ? '800' : '700', textAlign: 'right' }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
    pad: { padding: 16, gap: 10 },
    hint: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
    button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: Radius.md },
    buttonText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14 },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
    toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    brandCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.lg, padding: 16 },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: 12 },
    itemCode: { fontSize: 11, fontWeight: '600' },
    itemName: { fontSize: 14, fontWeight: '700' },
    itemQty: { fontSize: 14, fontWeight: '800' },
    sub: { fontSize: 12, fontWeight: '500' },
    totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Radius.md, padding: 14, marginTop: 6 },
    code: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
    name: { fontSize: 22, fontWeight: '800' },
    table: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden', marginTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
    cell: { fontSize: 13 },
    lotRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'transparent' },
    lotHead: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
    lotMain: { flex: 1, minWidth: 0 },
    lotNum: { width: 64, textAlign: 'right' },
    lotNumText: { fontSize: 12, fontWeight: '700' },
});
