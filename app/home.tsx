import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Dimensions, ScrollView, Image, RefreshControl, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { apiPost } from '../utils/api';
import { notificationService } from '../services/NotificationService';
import Animated, {
    FadeInUp,
    FadeInDown,
    useSharedValue,
    useAnimatedProps,
    withTiming,
    interpolate,
    Easing
} from 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import Svg, { G, Circle, Rect, Path } from 'react-native-svg';
import { FloatingNav } from '@/components/FloatingNav';

import { useResponsive } from '../hooks/useResponsive';

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

    const [stats, setStats] = useState({
        pending: { quotes: 0, value: 0, customers: 0, executives: 0, change: 0 },
        approved: { quotes: 0, value: 0, customers: 0, executives: 0, change: 0 },
        declined: { quotes: 0, value: 0, customers: 0, executives: 0, change: 0 },
        cancelled: { quotes: 0, value: 0, customers: 0, executives: 0, change: 0 },
        totalValue: '₹0',
        totalQuotes: 0,
        totalCustomers: 0,
        conversionRate: '0%',
        avgQuoteValue: '₹0',
    });
    const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    const [lastSeenPendingIds, setLastSeenPendingIds] = useState<string[]>([]);
    const lastSeenPendingIdsRef = useRef<string[]>([]);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [isManager, setIsManager] = useState(false);
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        lastSeenPendingIdsRef.current = lastSeenPendingIds;
    }, [lastSeenPendingIds]);

    useEffect(() => {
        if (!loading && hasSession && !permissionDenied) {
            const interval = setInterval(() => {
                fetchStats();
                checkForNewPending(false);
            }, 30000);
            return () => clearInterval(interval);
        }
    }, [loading, hasSession, userRoles, permissionDenied]);

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
            const rolesString = await SecureStore.getItemAsync('user_roles');
            if (rolesString) {
                const roles = JSON.parse(rolesString);
                setUserRoles(roles);
            }
            const isManagerStr = await SecureStore.getItemAsync('is_manager');
            setIsManager(isManagerStr === 'true');
        } catch (error) { }
    };

    const fetchStats = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) { router.replace('/'); return; }

            const res = await apiPost(`http://13.234.62.39:8080/api/method/get_dashboard_stats`, {}, sessionCookies);

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
                const pending = { quotes: d.PENDING?.quotes || 0, value: d.PENDING?.values || 0, customers: 0, executives: 0, change: d.PENDING?.percentage_change || 0 };
                const approved = { quotes: d.APPROVED?.quotes || 0, value: d.APPROVED?.values || 0, customers: 0, executives: 0, change: d.APPROVED?.percentage_change || 0 };
                const declined = { quotes: d.REVIEW?.quotes || 0, value: d.REVIEW?.values || 0, customers: 0, executives: 0, change: d.REVIEW?.percentage_change || 0 };
                const cancelled = { quotes: d.CANCELLED?.quotes || 0, value: d.CANCELLED?.values || 0, customers: 0, executives: 0, change: d.CANCELLED?.percentage_change || 0 };
                const totalQuotes = pending.quotes + approved.quotes + declined.quotes + cancelled.quotes;
                const totalValue = pending.value + approved.value + declined.value + cancelled.value;
                const totalCustomers = 0;
                const conversionRate = totalQuotes > 0 ? ((approved.quotes / totalQuotes) * 100).toFixed(0) + '%' : '0%';
                const avgQuoteValue = totalQuotes > 0 ? (totalValue / totalQuotes) : 0;
                setStats({
                    pending, approved, declined, cancelled,
                    totalValue: totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                    totalQuotes, totalCustomers, conversionRate,
                    avgQuoteValue: avgQuoteValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
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

            const res = await apiPost(`http://13.234.62.39:8080/api/method/get_quote_resource`, {}, sessionCookies);
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
                if (previousIds.length > 0 && !isInitialLoad) {
                    const newQuotes = quotes.filter((q: any) => !previousIds.includes(q.name));
                    for (const quote of newQuotes) {
                        const formattedAmount = quote.grand_total
                            ? `${quote.currency || ''} ${Number(quote.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '';
                        await notificationService.postLocalNotification(
                            `📄 New Quotation`,
                            `${quote.customer_name} quotation of ${formattedAmount} for approval.`,
                            { id: quote.name },
                            "QUOTATION_WORKFLOW"
                        );
                    }
                }

                const truncatedIds = currentPendingIds.slice(0, 50);
                setLastSeenPendingIds(truncatedIds);
                lastSeenPendingIdsRef.current = truncatedIds;
                await SecureStore.setItemAsync('last_seen_pending_ids', JSON.stringify(truncatedIds));
            }
        } catch (error) { }
    };


    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout', style: 'destructive', onPress: async () => {
                    await SecureStore.deleteItemAsync('session_cookies');
                    await SecureStore.deleteItemAsync('user_name');
                    await SecureStore.deleteItemAsync('user_roles');
                    await SecureStore.deleteItemAsync('last_seen_pending_ids');
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
                            <TouchableOpacity onPress={handleLogout} style={styles.profileButton}><View style={styles.avatar}><Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text></View></TouchableOpacity>
                        </View>

                        <View style={styles.topActions}><TouchableOpacity onPress={toggleTheme} style={styles.iconButton}><Ionicons name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={ms(20)} color={colors.text} /></TouchableOpacity></View>

                        <View style={styles.gridContainer}>
                            <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.statusCard, { backgroundColor: '#0277BD' }]}>
                                <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Pending' } })}>
                                    <View style={styles.statusHeader}><Text style={styles.statusTitle}>PENDING</Text><View style={styles.statusIconContainer}><Ionicons name="time-outline" size={ms(18)} color="#FFF" /></View></View>
                                    <View style={styles.statusBody}>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="document-text-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Quotes</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.pending.quotes}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="cash-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Values</Text></View><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.pending.value.toLocaleString('en-IN')}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="people-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Customers</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.pending.customers}</Text></View>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.statusCard, { backgroundColor: '#00BFA5' }]}>
                                <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Approved' } })}>
                                    <View style={styles.statusHeader}><Text style={styles.statusTitle}>APPROVED</Text><View style={styles.statusIconContainer}><Ionicons name="trending-up-outline" size={ms(18)} color="#FFF" /></View></View>
                                    <View style={styles.statusBody}>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="document-text-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Quotes</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.approved.quotes}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="cash-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Values</Text></View><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.approved.value.toLocaleString('en-IN')}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="people-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Customers</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.approved.customers}</Text></View>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.delay(300).springify()} style={[styles.statusCard, { backgroundColor: '#F4511E' }]}>
                                <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Review' } })}>
                                    <View style={styles.statusHeader}><Text style={styles.statusTitle}>REVIEW</Text><View style={styles.statusIconContainer}><Ionicons name="trending-down-outline" size={ms(18)} color="#FFF" /></View></View>
                                    <View style={styles.statusBody}>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="document-text-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Quotes</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.declined.quotes}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="cash-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Values</Text></View><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.declined.value.toLocaleString('en-IN')}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="people-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Customers</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.declined.customers}</Text></View>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>

                            <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.statusCard, { backgroundColor: '#C62828' }]}>
                                <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Cancelled' } })}>
                                    <View style={styles.statusHeader}><Text style={styles.statusTitle}>CANCELLED</Text><View style={styles.statusIconContainer}><Ionicons name="time-outline" size={ms(18)} color="#FFF" /></View></View>
                                    <View style={styles.statusBody}>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="document-text-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Quotes</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.cancelled.quotes}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="cash-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Values</Text></View><Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.cancelled.value.toLocaleString('en-IN')}</Text></View>
                                        <View style={styles.statRow}><View style={styles.statLabelContainer}><Ionicons name="people-outline" size={ms(14)} color="rgba(255,255,255,0.8)" /><Text style={styles.statLabel} adjustsFontSizeToFit numberOfLines={1}>Customers</Text></View><Text style={styles.statValue} numberOfLines={1}>{stats.cancelled.customers}</Text></View>
                                    </View>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>

                        <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.donutCard}>
                            <View style={styles.donutHeader}>
                                <View><Text style={styles.donutTitle}>Donut Chart</Text><Text style={styles.donutSubtitle}>Quote distribution overview</Text></View>
                                <TouchableOpacity style={styles.detailsButton} onPress={() => router.push('/quotations')}><Text style={styles.detailsButtonText}>View Details</Text><Ionicons name="arrow-forward-outline" size={ms(14)} color="#FFF" style={{ transform: [{ rotate: '-45deg' }] }} /></TouchableOpacity>
                            </View>
                            <View style={styles.chartWrapper}><DonutChart data={[stats.pending.quotes, stats.approved.quotes, stats.declined.quotes, stats.cancelled.quotes]} colors={['#0277BD', '#00BFA5', '#F4511E', '#C62828']} centerText={stats.totalQuotes.toString()} /></View>
                            <View style={styles.donutStatsRow}>
                                <View style={styles.donutStat}><Text style={styles.donutStatValue}>{stats.totalQuotes}</Text><Text style={styles.donutStatLabel}>Total Quotes</Text></View>
                                <View style={[styles.donutStat, styles.donutStatBorder, { flex: 1.5 }]}><Text style={styles.donutStatValue}>{stats.totalValue.replace('INR', '₹')}</Text><Text style={styles.donutStatLabel}>Total Value</Text></View>
                                <View style={styles.donutStat}><Text style={styles.donutStatValue}>{stats.totalCustomers}</Text><Text style={styles.donutStatLabel}>Customers</Text></View>
                            </View>
                        </Animated.View>

                        <Animated.View entering={FadeInUp.delay(600)} style={styles.metricsContainer}>
                            <View style={[styles.metricCard, { backgroundColor: '#E0F2F1', borderLeftColor: '#00BFA5', borderLeftWidth: ms(4) }]}><View style={[styles.metricIcon, { backgroundColor: '#00BFA5' }]}><Ionicons name="trending-up" size={ms(16)} color="#FFF" /></View><View><Text style={styles.metricLabel}>Approved Rate</Text><Text style={[styles.metricValue, { color: '#00695C' }]}>{stats.conversionRate}</Text></View></View>
                            <View style={[styles.metricCard, { backgroundColor: '#E1F5FE', borderLeftColor: '#0277BD', borderLeftWidth: ms(4) }]}><View style={[styles.metricIcon, { backgroundColor: '#0277BD' }]}><Ionicons name="cash-outline" size={ms(16)} color="#FFF" /></View><View><Text style={styles.metricLabel}>Avg. Quote Value</Text><Text style={[styles.metricValue, { color: '#01579B' }]}>{stats.avgQuoteValue}</Text></View></View>
                        </Animated.View>
                    </>
                )}
            </ScrollView>
            <FloatingNav />
        </SafeAreaView>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms, width }: any) {
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
        iconButton: { width: ms(40), height: ms(40), borderRadius: ms(20), backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
        gridContainer: { flexDirection: 'row', flexWrap: 'wrap', padding: s(16), gap: s(16) },
        statusCard: {
            width: (width - s(52)) / 2,
            borderRadius: ms(24),
            overflow: 'hidden',
            aspectRatio: 0.85,
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
        },
        cardContent: { flex: 1, padding: ms(20) },
        statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        statusTitle: { fontSize: ms(12), fontWeight: '900', color: '#FFF', opacity: 0.9, letterSpacing: 0.5 },
        statusIconContainer: { width: ms(32), height: ms(32), borderRadius: ms(12), backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
        statusBody: { flex: 1, justifyContent: 'center', gap: vs(12) },
        statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: s(8) },
        statLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: s(4), flex: 1.1 },
        statLabel: { fontSize: ms(10), color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
        statValue: { fontSize: ms(16), fontWeight: '900', color: '#FFF', flex: 2.8, textAlign: 'right' },
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
        metricValue: { fontSize: ms(18), fontWeight: '900' }
    });
}
