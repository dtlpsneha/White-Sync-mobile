import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { DailySummaryRow, brandLabel, getDailySummary } from '@/services/dailySalesReportApi';

const NAVY = '#0E1E3B';
const DANGER = '#DC3545';

function formatAmount(value: number | undefined) {
    const n = (value || 0) / 100000;
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const BreakdownRow = ({ label, caption, value, alt, colors, styles }: any) => (
    <View style={[styles.bRow, alt && { backgroundColor: colors.surfaceSecondary }]}>
        <View>
            <Text style={[styles.bRowLabel, { color: colors.text }]}>{label}</Text>
            <Text style={[styles.bRowCaption, { color: colors.textSecondary }]}>{caption}</Text>
        </View>
        <Text style={[styles.bRowValue, { color: colors.text }]}>{value}</Text>
    </View>
);

export default function BrandDetailScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ brand: string; fiscalYear: string; month: string; date: string; salesExecutive?: string }>();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = useMemo(() => getStyles({ s, vs, ms }), [s, vs, ms]);

    const [row, setRow] = useState<DailySummaryRow | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await getDailySummary({
                fiscalYear: params.fiscalYear,
                month: params.month,
                date: params.date,
                salesExecutive: params.salesExecutive,
            });
            if (res.ok) {
                const match = res.data.rows.find(r => r.brand === params.brand) || null;
                setRow(match);
            }
            setLoading(false);
        })();
    }, [params.brand, params.fiscalYear, params.month, params.date, params.salesExecutive]);

    const onShare = async () => {
        if (!row) return;
        const name = brandLabel(row.brand);
        const message =
            `${name} — Daily Sales Report\n\n` +
            `Total Sales (Up to Date): ₹${formatAmount(row.sales_mtd)} L\n` +
            `Total Collection (Up to Date): ₹${formatAmount(row.collection_mtd)} L\n` +
            `Payment Pending: ₹${formatAmount(row.payment_pending)} L\n\n` +
            `As on ${params.date}`;
        try {
            await Share.share({ message });
        } catch {
            // user cancelled or share sheet unavailable — nothing to recover
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <SafeAreaView style={{ backgroundColor: colors.surface }} edges={['top']}>
                <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.topbarTitle, { color: colors.text }]}>{brandLabel(params.brand || '').toUpperCase()}</Text>
                    <View style={{ width: 30 }} />
                </View>
            </SafeAreaView>

            {loading ? (
                <ActivityIndicator size="large" color={NAVY} style={{ marginTop: 60 }} />
            ) : !row ? (
                <View style={styles.emptyState}>
                    <Ionicons name="alert-circle-outline" size={40} color={colors.textSecondary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No data for this brand in the selected period.</Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={[styles.statCard, { backgroundColor: 'rgba(220,53,69,0.10)', borderColor: 'transparent' }]}>
                        <View style={styles.statTop}>
                            <Text style={[styles.statLabel, { color: '#7A2020' }]}>Payment Pending</Text>
                            <View style={[styles.statIconCircle, { backgroundColor: 'rgba(220,53,69,0.16)' }]}>
                                <Ionicons name="warning-outline" size={15} color={DANGER} />
                            </View>
                        </View>
                        <Text style={[styles.statValue, { color: DANGER }]}>₹{formatAmount(row.payment_pending)} L</Text>
                        <Text style={[styles.statCaption, { color: '#7A2020' }]}>Requires immediate attention</Text>
                    </View>

                    <View style={[styles.sectionHeader, { backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name="bar-chart-outline" size={15} color={colors.text} />
                        <Text style={[styles.sectionHeaderText, { color: colors.text }]}>Sales Breakdown</Text>
                    </View>
                    <View style={[styles.breakdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <BreakdownRow label="As On" caption="Today's figures" value={`₹${formatAmount(row.sales_as_on)} L`} colors={colors} styles={styles} />
                        <BreakdownRow label="Up to Date" caption="Current month" value={`₹${formatAmount(row.sales_mtd)} L`} alt colors={colors} styles={styles} />
                        <BreakdownRow label="FY Up to Date" caption="Financial year" value={`₹${formatAmount(row.sales_fytd)} L`} colors={colors} styles={styles} />
                    </View>

                    <View style={[styles.sectionHeader, { backgroundColor: colors.surfaceSecondary }]}>
                        <Ionicons name="wallet-outline" size={15} color={colors.text} />
                        <Text style={[styles.sectionHeaderText, { color: colors.text }]}>Collection Breakdown</Text>
                    </View>
                    <View style={[styles.breakdownList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <BreakdownRow label="As On" caption="Today's figures" value={`₹${formatAmount(row.collection_as_on)} L`} colors={colors} styles={styles} />
                        <BreakdownRow label="Up to Date" caption="Current month" value={`₹${formatAmount(row.collection_mtd)} L`} alt colors={colors} styles={styles} />
                        <BreakdownRow label="FY Up to Date" caption="Financial year" value={`₹${formatAmount(row.collection_fytd)} L`} colors={colors} styles={styles} />
                    </View>

                    <TouchableOpacity style={[styles.shareBtn, { backgroundColor: NAVY }]} onPress={onShare}>
                        <Ionicons name="share-social-outline" size={16} color="#fff" />
                        <Text style={styles.shareBtnText}>Share Summary</Text>
                    </TouchableOpacity>
                </ScrollView>
            )}
        </View>
    );
}

function getStyles({ s, vs, ms }: { s: (n: number) => number; vs: (n: number) => number; ms: (n: number) => number }) {
    return StyleSheet.create({
        container: { flex: 1 },
        topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: s(16), paddingVertical: vs(14), borderBottomWidth: 1 },
        backBtn: { width: 30, height: 30, justifyContent: 'center' },
        topbarTitle: { fontSize: ms(16), fontWeight: '800', letterSpacing: 0.4 },

        emptyState: { alignItems: 'center', paddingTop: vs(80), gap: 12, paddingHorizontal: s(24) },
        emptyText: { fontSize: ms(13), fontWeight: '600', textAlign: 'center' },

        scrollContent: { padding: 18, paddingBottom: 40 },

        statCard: { borderWidth: 1, borderRadius: ms(20), padding: ms(16), marginBottom: vs(12) },
        statTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
        statLabel: { fontSize: ms(11), fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
        statIconCircle: { width: ms(32), height: ms(32), borderRadius: 999, justifyContent: 'center', alignItems: 'center' },
        statValue: { fontSize: ms(24), fontWeight: '800', marginTop: vs(12), marginBottom: 4 },
        statCaption: { fontSize: ms(12.5), fontWeight: '600' },

        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: ms(12), padding: ms(11), marginTop: vs(20) },
        sectionHeaderText: { fontSize: ms(13.5), fontWeight: '800' },

        breakdownList: { borderWidth: 1, borderTopWidth: 0, borderBottomLeftRadius: ms(16), borderBottomRightRadius: ms(16), overflow: 'hidden' },
        bRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: ms(14) },
        bRowLabel: { fontSize: ms(12.5), fontWeight: '800', letterSpacing: 0.3, marginBottom: 2 },
        bRowCaption: { fontSize: ms(11.5), fontWeight: '600' },
        bRowValue: { fontSize: ms(16), fontWeight: '800' },

        shareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: ms(14), paddingVertical: vs(15), marginTop: vs(22) },
        shareBtnText: { color: '#fff', fontSize: ms(13.5), fontWeight: '800' },
    });
}
