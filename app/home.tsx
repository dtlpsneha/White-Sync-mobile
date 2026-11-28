import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, type ScrollViewInstance } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiPost } from '../utils/api';
import { apiUrl } from '@/constants/config';

import { AiBubble, AiSearchBar } from '@/components/AiSearchBar';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { Colors, Gradients } from '@/constants/theme';
import { enterItem } from '@/constants/motion';
import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications, type PersistentNotification } from '@/context/NotificationsContext';
import Svg, { Circle, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { useResponsive } from '../hooks/useResponsive';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Card that springs down on press and gives a light haptic tap. */
function Tappable({ onPress, style, children }: { onPress: () => void; style?: any; children: React.ReactNode }) {
    const scale = useSharedValue(1);
    const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    return (
        <AnimatedPressable
            onPressIn={() => { scale.value = withSpring(0.96, { damping: 15, stiffness: 320 }); }}
            onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 260 }); }}
            onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
                onPress();
            }}
            style={[style, pressStyle]}
        >
            {children}
        </AnimatedPressable>
    );
}

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

type HomeSnapshot = {
    userName: string | null;
    isManager: boolean;
    statsMap: Record<string, any>;
    summaryStats: { totalValue: string; totalQuotes: number; totalCustomers: number; conversionRate: string; avgQuoteValue: string };
    lastUpdated: string;
};

/**
 * Last figures Home showed, kept for the life of the app. Coming back to Home
 * draws these at once and refreshes in the background, instead of a blank
 * loading screen every time.
 */
let homeCache: HomeSnapshot | null = null;

export default function HomeScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const { toggleTheme } = useTheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms, width } = useResponsive();
    const insets = useSafeAreaInsets();
    const styles = getStyles(theme, { s, vs, ms, width });

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
    // First visit this app session? Only then do the sections animate in.
    const firstVisit = useRef(!homeCache).current;
    const [userName, setUserName] = useState<string | null>(homeCache?.userName ?? null);
    const [loading, setLoading] = useState(!homeCache);
    const [statsReady, setStatsReady] = useState(!!homeCache);
    const [refreshing, setRefreshing] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const [statsMap, setStatsMap] = useState<Record<string, any>>(homeCache?.statsMap ?? {});
    const [summaryStats, setSummaryStats] = useState(homeCache?.summaryStats ?? {
        totalValue: '₹0',
        totalQuotes: 0,
        totalCustomers: 0,
        conversionRate: '0%',
        avgQuoteValue: '₹0',
    });
    const pendingQuotes = Object.entries(statsMap).find(([k]) => k.toUpperCase() === 'PENDING')?.[1]?.quotes ?? 0;
    const [lastUpdated, setLastUpdated] = useState<string>(homeCache?.lastUpdated ?? '…');

    const [lastSeenPendingIds, setLastSeenPendingIds] = useState<string[]>([]);
    const lastSeenPendingIdsRef = useRef<string[]>([]);
    const [isManager, setIsManager] = useState(homeCache?.isManager ?? false);
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
        const sessionActive = await checkSession();
        setHasSession(sessionActive);
        if (!sessionActive) return;
        await loadUserData();
        const stored = await SecureStore.getItemAsync('last_seen_pending_ids');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                setLastSeenPendingIds(parsed);
                lastSeenPendingIdsRef.current = parsed;
            } catch (e) { }
        }
        // Everything above is read from the phone, so the screen can show now.
        // Figures from ERPNext fill in when they arrive (or update the cached ones).
        setLoading(false);
        await fetchStats();
        await checkForNewPending(true);
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
            homeCache = {
                statsMap: {},
                summaryStats: { totalValue: '₹0', totalQuotes: 0, totalCustomers: 0, conversionRate: '0%', avgQuoteValue: '₹0' },
                lastUpdated: '…',
                ...homeCache,
                userName: name || 'User',
                isManager: isManagerStr === 'true',
            };
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
                const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const nextSummary = {
                    totalValue: totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                    totalQuotes,
                    totalCustomers: 0,
                    conversionRate,
                    avgQuoteValue: avgQuoteValueNumeric.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                };
                setLastUpdated(stamp);
                setStatsReady(true);
                homeCache = {
                    userName: homeCache?.userName ?? null,
                    isManager: homeCache?.isManager ?? false,
                    ...homeCache,
                    statsMap: newStatsMap,
                    summaryStats: nextSummary,
                    lastUpdated: stamp,
                };
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

    // On first layout Android can leave this page scrolled to the bottom once the
    // content is taller than the screen, hiding the header. Pin to the top while the
    // content settles (first ~2s), then leave scrolling entirely to the user.
    const scrollRef = useRef<ScrollViewInstance>(null);
    const settleUntil = useRef(0);
    const pinToTopWhileSettling = () => {
        if (!settleUntil.current) settleUntil.current = Date.now() + 2000;
        if (Date.now() < settleUntil.current) scrollRef.current?.scrollTo({ y: 0, animated: false });
    };

    if (loading && !refreshing) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.text} /></View>;
    }

    return (
        <SafeAreaView style={styles.container} edges={['left', 'right']}>
            <LinearGradient
                pointerEvents="none"
                colors={[colors.background, colors.background]}
                style={styles.bgTint}
            />
            <ScrollView
                ref={scrollRef}
                onContentSizeChange={pinToTopWhileSettling}
                style={styles.scrollContent}
                contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
                <StatusBar style="light" />
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
                        <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + ms(14) }]}>
                            <View pointerEvents="none" style={styles.heroDeco}>
                                <View style={[styles.heroCircle, { width: ms(170), height: ms(170), right: -ms(40), top: -ms(50) }]} />
                                <View style={[styles.heroCircle, { width: ms(110), height: ms(110), right: ms(60), bottom: -ms(50), opacity: 0.6 }]} />
                            </View>
                            <View style={styles.heroTop}>
                                <View style={styles.heroBrand}>
                                    <Image source={require('../assets/images/logo.png')} style={{ width: ms(28), height: ms(28), borderRadius: ms(8), marginRight: s(8), backgroundColor: '#FFF' }} resizeMode="contain" />
                                    <Text style={styles.heroBrandText}>White Sync</Text>
                                </View>
                                <TouchableOpacity onPress={() => router.push('/profile' as any)} activeOpacity={0.8} style={styles.heroAvatar}>
                                    <Text style={styles.heroAvatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.heroWelcome}>{greeting},</Text>
                            <Text style={styles.heroName} numberOfLines={1}>{userName || 'User'}</Text>
                            <View style={styles.heroUpdated}>
                                <View style={styles.liveDot} />
                                <Text style={styles.heroUpdatedText}>Updated {lastUpdated}</Text>
                            </View>
                        </LinearGradient>

                        <View style={styles.aiSearchWrap}>
                            <AiSearchBar />
                        </View>

                        <SectionHeader title="Overview" subtitle="Your quotations at a glance" accentBar />
                        <View style={styles.statGrid}>
                            {([
                                { label: 'TOTAL QUOTES', value: statsReady ? String(summaryStats.totalQuotes) : '—', icon: 'documents', colors: ['#3A413C', '#1F2421'] as const, filter: undefined },
                                { label: 'PENDING', value: statsReady ? String(pendingQuotes) : '—', icon: 'time', colors: ['#F2B134', '#D99A14'] as const, filter: 'PENDING' },
                                { label: 'APPROVAL RATE', value: statsReady ? summaryStats.conversionRate : '—', icon: 'checkmark-done', colors: ['#3F8F6B', '#2F5D50'] as const, filter: 'APPROVED' },
                                { label: 'TOTAL VALUE', value: statsReady ? summaryStats.totalValue : '—', icon: 'cash', colors: ['#F07A55', '#E4572E'] as const, filter: undefined },
                            ]).map((t, i) => (
                                <Animated.View key={t.label} entering={firstVisit ? enterItem(i) : undefined} style={styles.statCell}>
                                    {/* Overview figures are for reading only; they do not open another page. */}
                                    <View style={styles.statTileWrap}>
                                        <LinearGradient colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.statTile}>
                                            <Ionicons name={t.icon as any} size={ms(70)} color="rgba(255,255,255,0.16)" style={styles.statBgIcon} />
                                            <View style={styles.statTop}>
                                                <View style={styles.statIconChip}>
                                                    <Ionicons name={t.icon as any} size={ms(16)} color="#FFF" />
                                                </View>
                                            </View>
                                            <View>
                                                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{t.value}</Text>
                                                <Text style={styles.statLabel} numberOfLines={1}>{t.label}</Text>
                                            </View>
                                        </LinearGradient>
                                    </View>
                                </Animated.View>
                            ))}
                        </View>

                        <SectionHeader title="Quick Navigation" subtitle="Tap a section to open it" accentBar />
                        <View style={styles.navSection}>
                            {([
                                { label: 'TEAM CHAT', sub: 'Jobs & messages with the office', icon: 'chatbubbles', from: '#F07A55', to: '#E4572E', route: '/team', mode: 'push' as const },
                                { label: 'CUSTOMER VISIT PLANNED', sub: 'Field visit records', icon: 'calendar', from: '#A97BCB', to: '#8E5BB5', route: '/maintenance', mode: 'replace' as const },
                                { label: 'QUOTATION / PROFORMA REQUEST', sub: 'Brand, customer, item & quantity', icon: 'create', from: '#F2B134', to: '#D99A14', route: '/quotation-request', mode: 'push' as const },
                                { label: 'QUOTATION CREATED', sub: 'Create & track quotations', icon: 'document-text', from: '#F2B134', to: '#D99A14', route: '/quotations', mode: 'replace' as const },
                                { label: 'CUSTOMER PURCHASE ORDER', sub: 'Orders from customers', icon: 'cart', from: '#3F8F6B', to: '#2F5D50', route: '/sales-orders', mode: 'replace' as const },
                                { label: 'MY ORDERS', sub: 'Order → invoice → dispatch, with LRs', icon: 'git-network', from: '#F07A55', to: '#E4572E', route: '/my-orders', mode: 'push' as const },
                                { label: 'SALES INVOICE HISTORY (DETAILED)', sub: 'Line-item invoice detail', icon: 'receipt', from: '#5B95C6', to: '#3E7CB1', route: '/daily-sales-report/invoice-history', mode: 'push' as const },
                                { label: 'SERVICE INVOICES', sub: 'LC service invoices', icon: 'construct', from: '#A97BCB', to: '#8E5BB5', route: '/daily-sales-report/invoice-history?service=1', mode: 'push' as const },
                                { label: 'DAILY SALES INVOICE (CUMULATIVE)', sub: 'Brand-wise daily totals', icon: 'bar-chart', from: '#F07A55', to: '#E4572E', route: '/daily-sales-report', mode: 'push' as const },
                                { label: 'HABASIT CALCULATOR', sub: 'Belt price estimate', icon: 'calculator', from: '#3F8F6B', to: '#2F5D50', route: '/price-calculator', mode: 'push' as const },
                            ]).map((item, i) => (
                                <Animated.View key={item.label} entering={firstVisit ? enterItem(4 + i) : undefined}>
                                    <Tappable
                                        style={[styles.navRowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                        onPress={() => item.mode === 'push' ? router.push(item.route as any) : router.replace(item.route as any)}
                                    >
                                        <View style={[styles.navRowAccent, { backgroundColor: item.to }]} />
                                        <LinearGradient colors={[item.from, item.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navRowIcon}>
                                            <Ionicons name={item.icon as any} size={ms(24)} color="#FFF" />
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.navRowTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
                                            <Text style={[styles.navRowSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sub}</Text>
                                        </View>
                                        <View style={[styles.navRowChevron, { backgroundColor: colors.surfaceSecondary }]}>
                                            <Ionicons name="chevron-forward" size={16} color={item.to} />
                                        </View>
                                    </Tappable>
                                </Animated.View>
                            ))}
                        </View>

                        <SectionHeader title="Stock & Payments" subtitle="Tally stock list and bank receipts" accentBar />
                        <View style={styles.navSection}>
                            {([
                                { label: 'STOCK LIST', sub: 'Tally stock by brand and item', icon: 'cube', from: '#3F8F6B', to: '#2F5D50', route: '/stock-list' },
                                { label: 'PAYMENT DETAILS', sub: 'ICICI bank receipts by date', icon: 'card', from: '#5B95C6', to: '#3E7CB1', route: '/payment-details' },
                            ]).map((item, i) => (
                                <Animated.View key={item.route} entering={firstVisit ? enterItem(6) : undefined}>
                                    <Tappable
                                        style={[styles.navRowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                        onPress={() => router.push(item.route as any)}
                                    >
                                        <View style={[styles.navRowAccent, { backgroundColor: item.to }]} />
                                        <LinearGradient colors={[item.from, item.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navRowIcon}>
                                            <Ionicons name={item.icon as any} size={ms(24)} color="#FFF" />
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.navRowTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
                                            <Text style={[styles.navRowSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sub}</Text>
                                        </View>
                                        <View style={[styles.navRowChevron, { backgroundColor: colors.surfaceSecondary }]}>
                                            <Ionicons name="chevron-forward" size={16} color={item.to} />
                                        </View>
                                    </Tappable>
                                </Animated.View>
                            ))}
                        </View>

                        <SectionHeader title="Customer Statements" subtitle="Outstanding bills and ledger PDFs" accentBar />
                        <View style={styles.navSection}>
                            {([
                                { label: 'LEDGER PDF', sub: 'Sales & receipts, 1 April to today', icon: 'list', from: '#3A413C', to: '#1F2421', kind: 'ledger' },
                                { label: 'OUTSTANDING PDF', sub: 'Unpaid bills', icon: 'time', from: '#F2B134', to: '#D99A14', kind: 'outstanding' },
                            ]).map((item, i) => (
                                <Animated.View key={item.kind} entering={firstVisit ? enterItem(6) : undefined}>
                                    <Tappable
                                        style={[styles.navRowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                        onPress={() => router.push({ pathname: '/customer-statement', params: { kind: item.kind } } as any)}
                                    >
                                        <View style={[styles.navRowAccent, { backgroundColor: item.to }]} />
                                        <LinearGradient colors={[item.from, item.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.navRowIcon}>
                                            <Ionicons name={item.icon as any} size={ms(24)} color="#FFF" />
                                        </LinearGradient>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[styles.navRowTitle, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{item.label}</Text>
                                            <Text style={[styles.navRowSub, { color: colors.textSecondary }]} numberOfLines={1}>{item.sub}</Text>
                                        </View>
                                        <View style={[styles.navRowChevron, { backgroundColor: colors.surfaceSecondary }]}>
                                            <Ionicons name="chevron-forward" size={16} color={item.to} />
                                        </View>
                                    </Tappable>
                                </Animated.View>
                            ))}
                        </View>

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
        liveDot: { width: ms(6), height: ms(6), borderRadius: ms(3), backgroundColor: '#7FD1A8' },
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
        marginTop: -ms(28),
        marginBottom: 6,
        zIndex: 2,
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
        bgTint: { position: 'absolute', top: 0, left: 0, right: 0, height: vs(430) },
        heroDeco: { ...StyleSheet.absoluteFill, borderBottomLeftRadius: ms(32), borderBottomRightRadius: ms(32), overflow: 'hidden' },
        heroCircle: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(228,87,46,0.18)' },
        navSection: { paddingHorizontal: s(16), paddingBottom: s(24), gap: s(10) },
        navRowCard: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(14),
            paddingVertical: ms(13),
            paddingRight: ms(14),
            paddingLeft: ms(16),
            borderRadius: ms(22),
            borderWidth: 1,
            overflow: 'hidden',
        },
        navRowAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
        navRowIcon: {
            width: ms(46),
            height: ms(46),
            borderRadius: ms(14),
            justifyContent: 'center',
            alignItems: 'center',
        },
        navRowTitle: { fontSize: ms(13), fontWeight: '800', letterSpacing: 0.3 },
        navRowSub: { fontSize: ms(11), fontWeight: '500', marginTop: 2 },
        navRowChevron: { width: ms(30), height: ms(30), borderRadius: ms(10), justifyContent: 'center', alignItems: 'center' },
        statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s(16), paddingBottom: s(20), gap: s(10) },
        statCell: { width: '48.4%' },
        statTileWrap: { borderRadius: ms(22), elevation: 5, shadowColor: '#1F2421', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
        statTile: { borderRadius: ms(22), padding: ms(14), minHeight: ms(112), justifyContent: 'space-between', overflow: 'hidden' },
        statBgIcon: { position: 'absolute', right: -ms(8), bottom: -ms(10) },
        statTop: { flexDirection: 'row', alignItems: 'center' },
        statIconChip: { width: ms(30), height: ms(30), borderRadius: ms(10), backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center' },
        statValue: { fontSize: ms(25), fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
        statLabel: { fontSize: ms(10), fontWeight: '800', color: 'rgba(255,255,255,0.85)', letterSpacing: 0.9, marginTop: 2 },
        hero: {
            borderBottomLeftRadius: ms(32),
            borderBottomRightRadius: ms(32),
            paddingHorizontal: s(20),
            paddingBottom: ms(46),
            elevation: 6,
            shadowColor: '#1F2421',
            shadowOpacity: 0.3,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
        },
        heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vs(18) },
        heroBrand: { flexDirection: 'row', alignItems: 'center' },
        heroBrandText: { fontSize: ms(15), fontWeight: '900', color: '#FFF', letterSpacing: 0.3 },
        heroAvatar: {
            width: ms(44),
            height: ms(44),
            borderRadius: ms(22),
            backgroundColor: '#FFFFFF',
            justifyContent: 'center',
            alignItems: 'center',
        },
        heroAvatarText: { fontSize: ms(18), fontWeight: '900', color: '#1F2421' },
        heroWelcome: { fontSize: ms(14), fontWeight: '600', color: '#E9DFCF' },
        heroName: { fontSize: ms(26), fontWeight: '900', color: '#FFF', marginTop: vs(2) },
        heroUpdated: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: s(6), marginTop: vs(12), backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
        heroUpdatedText: { fontSize: ms(11), color: '#E9DFCF', fontWeight: '700' },
    });
}

