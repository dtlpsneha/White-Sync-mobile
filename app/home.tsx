import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    Easing,
    FadeInDown,
    FadeInUp,
    useAnimatedProps,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiPost } from '../utils/api';
import { apiUrl } from '@/constants/config';

import { AiBubble, AiSearchBar } from '@/components/AiSearchBar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications, type PersistentNotification } from '@/context/NotificationsContext';
import Svg, { Circle, G } from 'react-native-svg';

import { useResponsive } from '../hooks/useResponsive';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Cancelled needs its own red, distinct from the theme's `danger` token — Review
 * already uses `danger` (they're the same shade, `#F4511E`), and collapsing both onto
 * one color would make two different statuses read as one on the dashboard.
 */
const CANCELLED_COLOR = '#C62828';


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

export default function HomeScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const { toggleTheme } = useTheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms, width } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms, width });

    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const [statsMap, setStatsMap] = useState<Record<string, any>>({});
    const [summaryStats, setSummaryStats] = useState({
        totalValue: '₹0',
        totalQuotes: 0,
        totalCustomers: 0,
        conversionRate: '0%',
        avgQuoteValue: '₹0',
    });
    const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const [lastSeenPendingIds, setLastSeenPendingIds] = useState<string[]>([]);
    const lastSeenPendingIdsRef = useRef<string[]>([]);
    const [isManager, setIsManager] = useState(false);
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        lastSeenPendingIdsRef.current = lastSeenPendingIds;
    }, [lastSeenPendingIds]);

    // Poll only while the app is actually in the foreground. Previously this
    // kept firing two requests every 30s even when backgrounded.
    useEffect(() => {
        if (loading || !hasSession || permissionDenied) return;

        let interval: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (interval) return;
            // Was 30s — on a live server with frequent real quotation activity,
            // that meant a fresh network request plus a burst of separate
            // notifications every half-minute. 3 minutes keeps the dashboard
            // reasonably current without hammering battery/network.
            interval = setInterval(() => {
                fetchStats();
                checkForNewPending(false);
            }, 180000);
        };

        const stop = () => {
            if (interval) clearInterval(interval);
            interval = null;
        };

        if (AppState.currentState === 'active') start();

        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active') start();
            else stop();
        });

        return () => {
            stop();
            subscription.remove();
        };
    }, [loading, hasSession, permissionDenied]);

    const loadData = async () => {
        setLoading(true);
        const sessionActive = await checkSession();
        setHasSession(sessionActive);
        if (sessionActive) {
            await loadUserData();
            const stored = await SecureStore.getItemAsync('last_seen_pending_ids');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setLastSeenPendingIds(parsed);
                    lastSeenPendingIdsRef.current = parsed;
                } catch (e) { }
            }
            await fetchStats();
            await checkForNewPending(true);
        }
        setLoading(false);
    };

    const checkSession = async () => {
        const session = await SecureStore.getItemAsync('session_cookies');
        if (!session) {
            router.replace('/');
            return false;
        }
        return true;
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchStats(), checkForNewPending(false)]);
        setRefreshing(false);
    };

    const loadUserData = async () => {
        try {
            const name = await SecureStore.getItemAsync('user_name');
            setUserName(name || 'User');
            const isManagerStr = await SecureStore.getItemAsync('is_manager');
            setIsManager(isManagerStr === 'true');
        } catch (error) { }
    };

    const fetchStats = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) { router.replace('/'); return; }

            const res = await apiPost(apiUrl('/api/method/get_dashboard_stats'), {}, sessionCookies);

            if (res.status === 401 || res.status === 403) {
                console.log('[Home] Session expired, logging out...');
                await SecureStore.deleteItemAsync('session_cookies');
                router.replace('/');
                return;
            }

            if (!res.ok) {
                console.warn('[Home] Stats fetch failed with status:', res.status);
                return;
            }

            const data: any = res.data;
            if (data && data.success && data.data) {
                const d = data.data;
                setPermissionDenied(false);

                const newStatsMap: Record<string, any> = {};
                let totalQuotes = 0;
                let totalValue = 0;
                let approvedQuotes = 0;

                Object.keys(d).forEach(key => {
                    const statusKeyUpper = key.toUpperCase();
                    if (['DRAFT', 'REOPEN', 'RE-OPEN', 'RESUBMIT', 'SUBMIT'].includes(statusKeyUpper)) {
                        return; // Skip these as requested
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
                setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            }
        } catch (error) {
            console.error('[Home] Fetch stats error:', error);
        }
    };

    const checkForNewPending = async (isInitialLoad = false) => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) return;

            const res = await apiPost(apiUrl('/api/method/get_quote_resource'), {}, sessionCookies);
            const data: any = res.data;

            let quotes: any[] = [];
            if (data && data.message && data.message.success && Array.isArray(data.message.data)) {
                quotes = data.message.data;
            }

            if (quotes && quotes.length > 0) {
                const currentPendingIds = quotes.map((q: any) => q.name);

                // Always read from SecureStore to avoid race conditions with state/ref
                const stored = await SecureStore.getItemAsync('last_seen_pending_ids');
                const previousIds: string[] = stored ? JSON.parse(stored) : [];

                // Skip notifications on initial load to avoid "Dashboard Notification" annoyance
                // Local notification removed — FCM push (sent server-side only to the
                // assigned quotation_approver's device) handles alerting the right person.
                // Posting a local notification here fired for every user whose poll
                // happened to surface a pending quote, regardless of whether they were
                // the approver.

                // Store every ID seen this poll, not a truncated slice — a cap
                // here (there used to be one, capped to the first 50) meant
                // every quote past the cap was permanently treated as "new"
                // on every subsequent poll, since it could never be found in
                // the stored list again.
                setLastSeenPendingIds(currentPendingIds);
                lastSeenPendingIdsRef.current = currentPendingIds;
                await SecureStore.setItemAsync('last_seen_pending_ids', JSON.stringify(currentPendingIds));
            }
        } catch (error) { }
    };


    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout', style: 'destructive', onPress: async () => {
                    // Must clear the same keys as the Profile screen's logout.
                    // This path previously left is_manager / show_all_quotes /
                    // user_id behind, so the next account to sign in on this
                    // device inherited the previous user's permissions if its
                    // profile fetch failed.
                    await Promise.all([
                        SecureStore.deleteItemAsync('session_cookies'),
                        SecureStore.deleteItemAsync('user_name'),
                        SecureStore.deleteItemAsync('is_manager'),
                        SecureStore.deleteItemAsync('show_all_quotes'),
                        SecureStore.deleteItemAsync('user_id'),
                        SecureStore.deleteItemAsync('last_seen_pending_ids'),
                    ]);
                    router.replace('/');
                }
            }
        ]);
    };

    if (loading && !refreshing) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.text} /></View>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 120 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                {permissionDenied ? (
                    <View style={styles.deniedContainer}>
                        <View style={styles.deniedContent}>
                            <Ionicons name="lock-closed-outline" size={48} color="#F4511E" />
                            <Text style={styles.deniedTitle}>Access Restricted</Text>
                            <Text style={styles.deniedSubtitle}>Session expired. Please log in again.</Text>
                            <TouchableOpacity style={styles.deniedButton} onPress={handleLogout}><Text style={styles.deniedButtonText}>Return to Login</Text></TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <>
                        <View style={styles.header}>
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: vs(8) }}>
                                    <Image source={require('../assets/images/logo.png')} style={{ width: ms(28), height: ms(28), borderRadius: ms(6), marginRight: s(8) }} resizeMode="contain" />
                                    <Text style={{ fontSize: ms(18), fontWeight: '900', color: colors.primary }}>White Sync</Text>
                                </View>
                                <Text style={styles.welcomeText}>WELCOME BACK</Text>
                                <Text style={styles.userNameText}>{userName || 'User'}</Text>
                                <View style={styles.liveIndicatorContainer}><View style={styles.liveDot} /><Text style={styles.liveText}>Last updated: {lastUpdated}</Text></View>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
                                <TouchableOpacity onPress={() => router.push('/profile' as any)} style={styles.profileButton}><View style={styles.avatar}><Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text></View></TouchableOpacity>
                            </View>
                        </View>

                        <View style={styles.aiSearchWrap}>
                            <AiSearchBar />
                        </View>

                        <SectionHeader title="Quick Navigation" subtitle="Tap a section to open it" />
                        <Animated.View entering={FadeInUp.delay(500)} style={styles.navSection}>
                            {([
                                [
                                    { label: 'Quotation', icon: 'document-text-outline', color: '#F59E0B', route: '/quotations', mode: 'replace' as const },
                                    { label: 'Customer Purchase Order', icon: 'cart-outline', color: '#00BFA5', route: '/sales-orders', mode: 'replace' as const },
                                ],
                                [
                                    { label: 'Customer Visit', icon: 'calendar-outline', color: '#8B5CF6', route: '/maintenance', mode: 'replace' as const },
                                    { label: 'Daily Sales Report (Cumulative)', icon: 'bar-chart-outline', color: '#F97316', route: '/daily-sales-report', mode: 'push' as const },
                                ],
                                [
                                    { label: 'Sales Invoice History (Detailed)', icon: 'receipt-outline', color: '#0891B2', route: '/daily-sales-report/invoice-history', mode: 'push' as const },
                                    { label: 'Habasit Calculator', icon: 'calculator-outline', color: '#10B981', route: '/price-calculator', mode: 'push' as const },
                                ],
                            ]).map((row, rowIdx) => (
                                <View key={rowIdx} style={styles.navRow}>
                                    {row.map((item, colIdx) => (
                                        <TouchableOpacity
                                            key={colIdx}
                                            style={[styles.navBox, { backgroundColor: `${item.color}15`, borderColor: `${item.color}45` }]}
                                            onPress={() => item.mode === 'push' ? router.push(item.route as any) : router.replace(item.route as any)}
                                            activeOpacity={0.7}
                                        >
                                            <View style={[styles.navIconWrap, { backgroundColor: item.color }]}>
                                                <Ionicons name={item.icon as any} size={ms(22)} color="#FFF" />
                                            </View>
                                            <Text style={[styles.navLabel, { color: colors.text }]}>
                                                {item.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                    {row.length === 1 && <View style={styles.navBoxSpacer} />}
                                </View>
                            ))}
                        </Animated.View>

                    </>
                )}
            </ScrollView>
            {!permissionDenied && <AiBubble />}
        </SafeAreaView>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { flex: 1 },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Platform.OS === 'android' ? vs(50) : vs(20), paddingHorizontal: s(24), marginBottom: vs(12) },
        welcomeText: { fontSize: ms(12), color: '#00BFA5', fontWeight: '900', letterSpacing: 1.5, marginBottom: vs(2), textTransform: 'uppercase' },
        liveIndicatorContainer: { flexDirection: 'row', alignItems: 'center', marginTop: vs(4), gap: s(6) },
        liveDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: '#4CAF50' },
        liveText: { fontSize: ms(10), color: colors.textSecondary, fontWeight: '500' },
        deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: vs(150), paddingHorizontal: s(24) },
        deniedContent: { backgroundColor: colors.surface, borderRadius: ms(32), padding: ms(32), alignItems: 'center', elevation: 5 },
        deniedTitle: { fontSize: ms(22), fontWeight: '900', color: colors.text, marginBottom: vs(12) },
        deniedSubtitle: { fontSize: ms(14), color: colors.textSecondary, textAlign: 'center', marginBottom: vs(32) },
        deniedButton: { backgroundColor: colors.primary, paddingVertical: vs(14), paddingHorizontal: s(32), borderRadius: ms(16) },
        deniedButtonText: { color: '#FFF', fontSize: ms(15), fontWeight: '900' },
        userNameText: { fontSize: ms(24), fontWeight: 'bold', color: colors.text },
        profileButton: { elevation: 4 },
        avatar: { width: ms(48), height: ms(48), borderRadius: ms(16), backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
        avatarText: { fontSize: ms(20), fontWeight: '900', color: '#FFF' },
        topActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: s(24), gap: s(8) },
        iconButton: { width: ms(40), height: ms(40), borderRadius: ms(20), backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border, position: 'relative' as const },
        notificationBadge: { position: 'absolute', top: -6, right: -6, width: ms(20), height: ms(20), borderRadius: ms(10), justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.background },
        notificationBadgeText: { fontSize: ms(10), fontWeight: '900', color: '#FFF' },
        aiSearchWrap: {
        paddingHorizontal: 20,
        marginBottom: 18,
    },
    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s(16), paddingBottom: s(16), gap: s(16) },
        donutCard: { margin: s(16), backgroundColor: colors.surface, borderRadius: ms(32), padding: ms(24), elevation: 5 },
        donutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: vs(24) },
        donutTitle: { fontSize: ms(20), fontWeight: '900', color: colors.text },
        donutSubtitle: { fontSize: ms(12), color: colors.textSecondary, marginTop: vs(2) },
        detailsButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingVertical: vs(6), paddingHorizontal: s(12), borderRadius: ms(10), gap: s(4) },
        detailsButtonText: { color: '#FFF', fontSize: ms(12), fontWeight: '800' },
        chartWrapper: { alignItems: 'center', marginBottom: vs(24) },
        donutStatsRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: vs(20) },
        donutStat: { flex: 1, alignItems: 'center' },
        donutStatBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border },
        donutStatValue: { fontSize: ms(16), fontWeight: '900', color: colors.text },
        donutStatLabel: { fontSize: ms(10), color: colors.textSecondary, marginTop: vs(4), fontWeight: '700' },
        metricsContainer: { padding: s(16), gap: vs(12) },
        metricCard: { flexDirection: 'row', alignItems: 'center', padding: ms(16), borderRadius: ms(24), gap: s(16) },
        metricIcon: { width: ms(40), height: ms(40), borderRadius: ms(16), justifyContent: 'center', alignItems: 'center' },
        metricLabel: { fontSize: ms(12), color: colors.textSecondary, fontWeight: '700' },
        metricValue: { fontSize: ms(18), fontWeight: '900' },
        navSection: { paddingHorizontal: s(16), paddingBottom: s(24), gap: s(10) },
        navRow: { flexDirection: 'row', gap: s(10) },
        navBox: {
            flex: 1,
            borderRadius: ms(18),
            borderWidth: 1.5,
            paddingVertical: ms(16),
            paddingHorizontal: ms(12),
            alignItems: 'center',
            gap: vs(10),
            minHeight: ms(100),
            justifyContent: 'center',
        },
        navBoxSpacer: { flex: 1 },
        navIconWrap: {
            width: ms(48),
            height: ms(48),
            borderRadius: ms(16),
            justifyContent: 'center',
            alignItems: 'center',
        },
        navLabel: {
            fontSize: ms(11),
            fontWeight: '700',
            textAlign: 'center',
            lineHeight: ms(16),
            color: '#334155',
        },
    });
}

