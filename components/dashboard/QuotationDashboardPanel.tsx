/**
 * QuotationDashboardPanel.tsx — the quote-status KPI grid, donut chart, and
 * performance metrics that used to live directly on the Home screen. Moved
 * here so it can be dropped into the Quotations screen's side drawer without
 * needing Home's own state/polling.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    Easing,
    FadeInUp,
    useAnimatedProps,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';

import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { apiUrl } from '@/constants/config';
import { apiPost } from '@/utils/api';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { SectionHeader } from '@/components/dashboard/SectionHeader';

const CANCELLED_COLOR = '#C62828';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DonutSegment = ({ center, radius, strokeWidth, color, percentage, rotation, progress }: any) => {
    const circumference = 2 * Math.PI * radius;

    const animatedProps = useAnimatedProps(() => {
        const segmentOffset = circumference - (circumference * percentage * progress.value);
        return {
            strokeDashoffset: segmentOffset,
        };
    });

    return (
        <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            fill="none"
            transform={`rotate(${rotation}, ${center}, ${center})`}
            strokeLinecap="round"
        />
    );
};

const DonutChart = ({ data, colors, centerText, strokeWidth = 12 }: { data: number[], colors: string[], centerText?: string, strokeWidth?: number }) => {
    const isDark = useColorScheme() === 'dark';
    const total = data.reduce((acc, val) => acc + val, 0);
    const radius = 70;
    const center = radius + strokeWidth;
    const progress = useSharedValue(0);
    const { ms } = useResponsive();

    useEffect(() => {
        progress.value = 0;
        progress.value = withTiming(1, {
            duration: 1500,
            easing: Easing.out(Easing.exp)
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    if (total === 0) {
        return (
            <View style={{ width: center * 2, height: center * 2, justifyContent: 'center', alignItems: 'center' }}>
                <Svg width={center * 2} height={center * 2}>
                    <Circle
                        cx={center}
                        cy={center}
                        r={radius}
                        stroke={isDark ? '#334155' : '#E6E6E6'}
                        strokeWidth={strokeWidth}
                        fill="none"
                    />
                </Svg>
                <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ fontSize: ms(24), fontWeight: '900', color: isDark ? '#FFF' : '#263238' }}>0</Text>
                    <Text style={{ fontSize: ms(10), color: isDark ? '#94A3B8' : '#78909C', fontWeight: '700', textTransform: 'uppercase' }}>Total</Text>
                </View>
            </View>
        );
    }

    const size = center * 2 + 10;
    const actualCenter = size / 2;
    let accumulatedAngle = 0;

    return (
        <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <G rotation="-90" origin={`${actualCenter}, ${actualCenter}`}>
                    {data.map((value, index) => {
                        if (value === 0) return null;
                        const percentage = value / total;
                        const rotation = accumulatedAngle;
                        accumulatedAngle += percentage * 360;

                        return (
                            <DonutSegment
                                key={index}
                                center={actualCenter}
                                radius={radius}
                                strokeWidth={strokeWidth}
                                color={colors[index]}
                                percentage={percentage}
                                rotation={rotation}
                                progress={progress}
                            />
                        );
                    })}
                </G>
            </Svg>
            <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ fontSize: ms(28), fontWeight: '900', color: isDark ? '#FFF' : '#263238' }}>{centerText ?? total}</Text>
                <Text style={{ fontSize: ms(10), color: isDark ? '#94A3B8' : '#78909C', fontWeight: '700', textTransform: 'uppercase' }}>Total Quotes</Text>
            </View>
        </View>
    );
};

export function QuotationDashboardPanel({ onSelectFilter }: { onSelectFilter: (statusKey: string) => void }) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = useMemo(() => getStyles(theme, { s, vs, ms }), [theme, s, vs, ms]);

    const [statsMap, setStatsMap] = useState<Record<string, any>>({});
    const [summaryStats, setSummaryStats] = useState({
        totalValue: '₹0',
        totalQuotes: 0,
        totalCustomers: 0,
        conversionRate: '0%',
        avgQuoteValue: '₹0',
    });
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);

    useEffect(() => { fetchStats(); }, []);

    // A single failed request here must never sign the user out — only an
    // explicit Logout tap should end the session. A 401/403 on this one
    // endpoint (transient, misconfigured, or a genuinely expired session)
    // surfaces as an in-panel error with Retry instead, matching how every
    // other screen in this app already handles fetch failures.
    const fetchStats = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) { setFetchError('Not signed in.'); setLoading(false); return; }

            const res = await apiPost(apiUrl('/api/method/get_dashboard_stats'), {}, sessionCookies);

            if (!res.ok) {
                setFetchError('Could not load the dashboard. Please try again.');
                setLoading(false);
                return;
            }

            const data: any = res.data;
            if (data && data.success && data.data) {
                const d = data.data;

                const newStatsMap: Record<string, any> = {};
                let totalQuotes = 0;
                let totalValue = 0;
                let approvedQuotes = 0;

                Object.keys(d).forEach(key => {
                    const statusKeyUpper = key.toUpperCase();
                    if (['DRAFT', 'REOPEN', 'RE-OPEN', 'RESUBMIT', 'SUBMIT'].includes(statusKeyUpper)) {
                        return;
                    }

                    const statusData = d[key];
                    const quotes = statusData?.quotes || 0;
                    const value = statusData?.values || 0;

                    newStatsMap[key] = {
                        quotes,
                        value,
                        customers: 0,
                        executives: 0,
                        change: statusData?.percentage_change || 0
                    };

                    totalQuotes += quotes;
                    totalValue += value;
                    if (statusKeyUpper === 'APPROVED') {
                        approvedQuotes = quotes;
                    }
                });

                const conversionRate = totalQuotes > 0 ? ((approvedQuotes / totalQuotes) * 100).toFixed(0) + '%' : '0%';
                const avgQuoteValueNumeric = totalQuotes > 0 ? (totalValue / totalQuotes) : 0;

                setStatsMap(newStatsMap);
                setSummaryStats({
                    totalValue: totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                    totalQuotes,
                    totalCustomers: 0,
                    conversionRate,
                    avgQuoteValue: avgQuoteValueNumeric.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                });
            }
        } catch (error) {
            console.error('[QuotationDashboardPanel] Fetch stats error:', error);
            setFetchError('Could not load the dashboard. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (loading && !fetchError) {
        return (
            <View>
                <SectionHeader
                    title="Quotations"
                    subtitle="Live status overview — tap a card to filter"
                />
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: vs(30), marginBottom: vs(10) }} />
            </View>
        );
    }

    if (fetchError) {
        return (
            <View>
                <SectionHeader
                    title="Quotations"
                    subtitle="Live status overview — tap a card to filter"
                />
                <View style={styles.errorState}>
                    <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
                    <Text style={[styles.errorText, { color: colors.textSecondary }]}>{fetchError}</Text>
                    <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.surfaceSecondary }]} onPress={fetchStats}>
                        <Text style={[styles.retryText, { color: colors.textSecondary }]}>Retry</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View>
            <SectionHeader
                title="Quotations"
                subtitle="Live status overview — tap a card to filter"
            />
            <View style={styles.kpiGrid}>
                {Object.keys(statsMap).map((statusKey, index) => {
                    const status = statsMap[statusKey];
                    const isPending = statusKey.toUpperCase() === 'PENDING';
                    const isApproved = statusKey.toUpperCase() === 'APPROVED';
                    const isReview = statusKey.toUpperCase() === 'REVIEW' || statusKey.toUpperCase() === 'DECLINED';
                    const isCancelled = statusKey.toUpperCase() === 'CANCELLED' || statusKey.toUpperCase() === 'REJECTED';

                    const cardColor = isPending ? colors.info :
                        isApproved ? colors.success :
                            isReview ? colors.danger :
                                isCancelled ? CANCELLED_COLOR :
                                    colors.secondary;

                    const iconName = isPending ? 'time-outline' :
                        isApproved ? 'trending-up-outline' :
                            isReview ? 'trending-down-outline' :
                                isCancelled ? 'close-circle-outline' :
                                    'document-text-outline';

                    return (
                        <KpiCard
                            key={statusKey}
                            title={statusKey}
                            icon={iconName as any}
                            color={cardColor}
                            delay={100 * (index + 1)}
                            onPress={() => onSelectFilter(statusKey)}
                            rows={[
                                { icon: 'document-text-outline', label: 'Quotes', value: String(status.quotes) },
                                { icon: 'cash-outline', label: 'Values', value: status.value.toLocaleString('en-IN') },
                                { icon: 'people-outline', label: 'Customers', value: String(status.customers) },
                            ]}
                        />
                    );
                })}
            </View>

            <SectionHeader
                title="Quotation Performance"
                subtitle="Approval trends across all quotations"
            />
            <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.donutCard}>
                <View style={styles.donutHeader}>
                    <View><Text style={styles.donutTitle}>Donut Chart</Text><Text style={styles.donutSubtitle}>Quote distribution overview</Text></View>
                </View>
                <View style={styles.chartWrapper}>
                    <DonutChart
                        data={Object.keys(statsMap).map(k => statsMap[k].quotes)}
                        colors={Object.keys(statsMap).map(k => {
                            const uk = k.toUpperCase();
                            if (uk === 'PENDING') return colors.info;
                            if (uk === 'APPROVED') return colors.success;
                            if (uk === 'REVIEW' || uk === 'DECLINED') return colors.danger;
                            if (uk === 'CANCELLED' || uk === 'REJECTED') return CANCELLED_COLOR;
                            return colors.secondary;
                        })}
                        centerText={summaryStats.totalQuotes.toString()}
                    />
                </View>
                <View style={styles.donutStatsRow}>
                    <View style={styles.donutStat}><Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{summaryStats.totalQuotes}</Text><Text style={styles.donutStatLabel}>Total Quotes</Text></View>
                    <View style={[styles.donutStat, styles.donutStatBorder, { flex: 1.5 }]}><Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{summaryStats.totalValue.replace('INR', '₹')}</Text><Text style={styles.donutStatLabel}>Total Value</Text></View>
                    <View style={styles.donutStat}><Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{summaryStats.totalCustomers}</Text><Text style={styles.donutStatLabel}>Customers</Text></View>
                </View>
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(600)} style={styles.metricsContainer}>
                <View style={[styles.metricCard, { backgroundColor: '#E0F2F1', borderLeftColor: '#00BFA5', borderLeftWidth: ms(4) }]}><View style={[styles.metricIcon, { backgroundColor: '#00BFA5' }]}><Ionicons name="trending-up" size={ms(16)} color="#FFF" /></View><View><Text style={styles.metricLabel}>Approved Rate</Text><Text style={[styles.metricValue, { color: '#00695C' }]}>{summaryStats.conversionRate}</Text></View></View>
                <View style={[styles.metricCard, { backgroundColor: '#E1F5FE', borderLeftColor: '#0277BD', borderLeftWidth: ms(4) }]}><View style={[styles.metricIcon, { backgroundColor: '#0277BD' }]}><Ionicons name="cash-outline" size={ms(16)} color="#FFF" /></View><View><Text style={styles.metricLabel}>Avg. Quote Value</Text><Text style={[styles.metricValue, { color: '#01579B' }]}>{summaryStats.avgQuoteValue}</Text></View></View>
            </Animated.View>
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s(16), paddingBottom: s(16), gap: s(16) },
        donutCard: { margin: s(16), backgroundColor: colors.surface, borderRadius: ms(32), padding: ms(24), elevation: 5 },
        donutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: vs(24) },
        donutTitle: { fontSize: ms(20), fontWeight: '900', color: colors.text },
        donutSubtitle: { fontSize: ms(12), color: colors.textSecondary, marginTop: vs(2) },
        chartWrapper: { alignItems: 'center', marginBottom: vs(24) },
        donutStatsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: vs(20) },
        donutStat: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: s(4) },
        donutStatBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
        donutStatValue: { fontSize: ms(16), fontWeight: '900', color: colors.text },
        donutStatLabel: { fontSize: ms(10), color: colors.textSecondary, marginTop: vs(4), fontWeight: '700' },
        metricsContainer: { padding: s(16), gap: vs(12) },
        metricCard: { flexDirection: 'row', alignItems: 'center', padding: ms(16), borderRadius: ms(24), gap: s(16) },
        metricIcon: { width: ms(40), height: ms(40), borderRadius: ms(16), justifyContent: 'center', alignItems: 'center' },
        metricLabel: { fontSize: ms(12), color: colors.textSecondary, fontWeight: '700' },
        metricValue: { fontSize: ms(18), fontWeight: '900' },
        errorState: { alignItems: 'center', paddingVertical: vs(50), gap: 12, paddingHorizontal: s(24) },
        errorText: { fontSize: ms(13), fontWeight: '600', textAlign: 'center' },
        retryBtn: { paddingHorizontal: s(16), paddingVertical: vs(8), borderRadius: ms(999), marginTop: vs(4) },
        retryText: { fontSize: ms(12), fontWeight: '700' },
    });
}
