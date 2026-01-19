import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Dimensions, ScrollView, Image, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
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
        // Draw the segment based on progress
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
                    <Text style={{ fontSize: 24, fontWeight: '900', color: isDark ? '#FFF' : '#263238' }}>0</Text>
                    <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#78909C', fontWeight: '700', textTransform: 'uppercase' }}>Total</Text>
                </View>
            </View>
        );
    }

    const size = center * 2 + 10; // Extra padding to prevent clipping
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
                <Text style={{ fontSize: 28, fontWeight: '900', color: isDark ? '#FFF' : '#263238' }}>{centerText ?? total}</Text>
                <Text style={{ fontSize: 10, color: isDark ? '#94A3B8' : '#78909C', fontWeight: '700', textTransform: 'uppercase' }}>Total Quotes</Text>
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
    const [selectedPeriod, setSelectedPeriod] = useState('Weekly');
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

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        lastSeenPendingIdsRef.current = lastSeenPendingIds;
    }, [lastSeenPendingIds]);



    useEffect(() => {
        if (!loading && hasSession && !permissionDenied) {
            console.log('[Home] Starting background data refresher...');
            const interval = setInterval(() => {
                fetchStats();
                checkForNewPending();
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
                } catch (e) {
                    console.warn('[Home] Failed to parse stored IDs:', e);
                }
            }
            await fetchStats();
            await checkForNewPending();
        }
        setLoading(false);
    };

    const checkSession = async () => {
        const session = await SecureStore.getItemAsync('session_cookies');
        if (!session) {
            console.log('[HomeScreen] No session found, redirecting to login...');
            router.replace('/');
            return false;
        }
        return true;
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([fetchStats(), checkForNewPending()]);
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
                console.log('[Home] Loaded User Roles:', roles);
            }

            const isManagerStr = await SecureStore.getItemAsync('is_manager');
            setIsManager(isManagerStr === 'true');
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    };

    const fetchStats = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) {
                setPermissionDenied(true);
                return;
            }

            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            headers['Cookie'] = sessionCookies;

            console.log('[Home] Fetching dashboard stats...');
            const url = `http://13.234.62.39:8080/api/method/get_dashboard_stats`;
            const res = await fetch(url, { method: 'POST', headers });

            if (res.status === 401 || res.status === 403) {
                setPermissionDenied(true);
                return;
            }

            const data = await res.json();

            if (data.success && data.data) {
                const d = data.data;
                setPermissionDenied(false);

                const pending = {
                    quotes: d.PENDING?.quotes || 0,
                    value: d.PENDING?.values || 0,
                    customers: d.PENDING?.customers || 0,
                    executives: d.PENDING?.executives || 0,
                    change: d.PENDING?.percentage_change || 0
                };
                const approved = {
                    quotes: d.APPROVED?.quotes || 0,
                    value: d.APPROVED?.values || 0,
                    customers: d.APPROVED?.customers || 0,
                    executives: d.APPROVED?.executives || 0,
                    change: d.APPROVED?.percentage_change || 0
                };
                const declined = {
                    quotes: d.DECLINED?.quotes || 0,
                    value: d.DECLINED?.values || 0,
                    customers: d.DECLINED?.customers || 0,
                    executives: d.DECLINED?.executives || 0,
                    change: d.DECLINED?.percentage_change || 0
                };
                const cancelled = {
                    quotes: d.CANCELLED?.quotes || 0,
                    value: d.CANCELLED?.values || 0,
                    customers: d.CANCELLED?.customers || 0,
                    executives: d.CANCELLED?.executives || 0,
                    change: d.CANCELLED?.percentage_change || 0
                };

                const totalQuotes = pending.quotes + approved.quotes + declined.quotes + cancelled.quotes;
                const totalValue = pending.value + approved.value + declined.value + cancelled.value;
                const totalCustomers = pending.customers + approved.customers + declined.customers + cancelled.customers;

                const conversionRate = totalQuotes > 0 ? ((approved.quotes / totalQuotes) * 100).toFixed(0) + '%' : '0%';
                const avgQuoteValue = totalQuotes > 0 ? (totalValue / totalQuotes) : 0;

                setStats({
                    pending,
                    approved,
                    declined,
                    cancelled,
                    totalValue: totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),
                    totalQuotes: totalQuotes,
                    totalCustomers: totalCustomers,
                    conversionRate: conversionRate,
                    avgQuoteValue: avgQuoteValue.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' }),

                });

                if (data.user_name) {
                    setUserName(data.user_name);
                    await SecureStore.setItemAsync('user_name', data.user_name);
                }

                setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
                console.log('[Home] Dashboard stats updated.');
            } else {
                console.warn('[Home] API success=false or missing data:', data.message);
                if (data.message === "Invalid Session") {
                    setPermissionDenied(true);
                }
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        }
    };

    const checkForNewPending = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) return;

            const headers = { 'Content-Type': 'application/json', 'Cookie': sessionCookies };


            const showAllStr = await SecureStore.getItemAsync('show_all_quotes');
            const showAll = showAllStr === 'true';

            const url = `http://13.234.62.39:8080/api/method/get_quote_resource`;
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ show_quotation_type: showAll ? 'all' : 'respective_user' })
            });
            const data = await res.json();

            let quotes = [];
            if (Array.isArray(data.message)) quotes = data.message;
            else if (data.message && Array.isArray(data.message.data)) quotes = data.message.data;
            else if (data.data && Array.isArray(data.data)) quotes = data.data;

            if (quotes && quotes.length > 0) {
                const loggedInUser = await SecureStore.getItemAsync('user_id');
                if (isManager && !showAll) {
                    quotes = quotes.filter((q: any) => q.temporary_approver === loggedInUser);
                }

                const currentPendingIds = quotes.map((q: any) => q.name);
                const previousIds = lastSeenPendingIdsRef.current;

                if (previousIds.length > 0) {
                    const newQuotes = quotes.filter((q: any) => !previousIds.includes(q.name));
                    if (newQuotes.length > 0) {
                        for (const quote of newQuotes) {
                            const formattedAmount = quote.grand_total ? `${quote.currency || ''} ${Number(quote.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '';
                            let formattedTime = 'now';
                            if (quote.creation) {
                                const d = new Date(quote.creation.replace(' ', 'T'));
                                const day = String(d.getDate()).padStart(2, '0');
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const year = String(d.getFullYear()).slice(-2);
                                const hours = String(d.getHours()).padStart(2, '0');
                                const mins = String(d.getMinutes()).padStart(2, '0');
                                formattedTime = `${day}:${month}:${year} ${hours}:${mins}`;
                            }
                            await notificationService.postLocalNotification(
                                `📄 New Quotation`,
                                `${quote.customer_name} quotation of ${formattedAmount} submitted on ${formattedTime} for approval.`,
                                { id: quote.name },
                                "QUOTATION_WORKFLOW"
                            );
                        }
                    }
                }
                setLastSeenPendingIds(currentPendingIds);
                await SecureStore.setItemAsync('last_seen_pending_ids', JSON.stringify(currentPendingIds));
            }
        } catch (error) {
            console.warn('[Home-Watcher] Background check failed:', error);
        }
    };



    const handleLogout = async () => {
        Alert.alert(
            'Logout',
            'Are you sure you want to logout?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await SecureStore.deleteItemAsync('session_cookies');
                            await SecureStore.deleteItemAsync('user_name');
                            await SecureStore.deleteItemAsync('user_roles');
                            await SecureStore.deleteItemAsync('last_seen_pending_ids');
                            if (router.canGoBack()) router.dismissAll();
                            router.replace('/');
                        } catch (error) {
                            alert('Logout failed: ' + String(error));
                        }
                    }
                }
            ]
        );
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.text} />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
            }
        >
            <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />

            {permissionDenied ? (
                <View style={styles.deniedContainer}>
                    <View style={styles.deniedContent}>
                        <View style={styles.deniedIconBox}>
                            <Ionicons name="lock-closed-outline" size={48} color="#F4511E" />
                        </View>
                        <Text style={styles.deniedTitle}>Access Restricted</Text>
                        <Text style={styles.deniedSubtitle}>
                            Your session has expired or you do not have permission to view this dashboard. Please log in again.
                        </Text>
                        <TouchableOpacity style={styles.deniedButton} onPress={handleLogout}>
                            <Text style={styles.deniedButtonText}>Return to Login</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <>
                    {/* Header */}
                    <View style={styles.header}>
                        <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Image source={require('../assets/images/logo.png')} style={{ width: 28, height: 28, borderRadius: 6, marginRight: 8 }} resizeMode="contain" />
                                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.primary, letterSpacing: -0.5 }}>White Sync</Text>
                            </View>
                            <Text style={styles.welcomeText}>WELCOME BACK</Text>
                            <Text style={styles.userNameText}>{userName || 'User'}</Text>
                            <View style={styles.liveIndicatorContainer}>
                                <View style={styles.liveDot} />
                                <Text style={styles.liveText}>Last updated: {lastUpdated}</Text>
                            </View>
                        </View>
                        <TouchableOpacity onPress={handleLogout} style={styles.profileButton}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text>
                            </View>
                        </TouchableOpacity>
                    </View>

                    {/* Settings/Theme Toggle Floating */}
                    <View style={styles.topActions}>
                        <TouchableOpacity onPress={toggleTheme} style={styles.iconButton}>
                            <Ionicons
                                name={theme === 'dark' ? 'sunny-outline' : 'moon-outline'}
                                size={20}
                                color={colors.text}
                            />
                        </TouchableOpacity>

                    </View>

                    {/* Status Grid */}
                    <View style={styles.gridContainer}>
                        {/* Pending Card */}
                        <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.statusCard, { backgroundColor: '#0277BD' }]}>
                            <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Pending' } })}>
                                <View style={styles.statusHeader}>
                                    <Text style={styles.statusTitle}>PENDING</Text>
                                    <View style={styles.statusIconContainer}>
                                        <Ionicons name="time-outline" size={18} color="#FFF" />
                                    </View>
                                </View>
                                <View style={styles.statusBody}>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Quotes:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.pending.quotes}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="cash-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Values:</Text>
                                        </View>
                                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.pending.value.toLocaleString('en-IN')}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Customers:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.pending.customers}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Approved Card */}
                        <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.statusCard, { backgroundColor: '#00BFA5' }]}>
                            <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Approved' } })}>
                                <View style={styles.statusHeader}>
                                    <Text style={styles.statusTitle}>APPROVED</Text>
                                    <View style={styles.statusIconContainer}>
                                        <Ionicons name="trending-up-outline" size={18} color="#FFF" />
                                    </View>
                                </View>
                                <View style={styles.statusBody}>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Quotes:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.approved.quotes}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="cash-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Values:</Text>
                                        </View>
                                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.approved.value.toLocaleString('en-IN')}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Customers:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.approved.customers}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Declined Card -> Review Card */}
                        <Animated.View entering={FadeInDown.delay(300).springify()} style={[styles.statusCard, { backgroundColor: '#F4511E' }]}>
                            <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Review' } })}>
                                <View style={styles.statusHeader}>
                                    <Text style={styles.statusTitle}>REVIEW</Text>
                                    <View style={styles.statusIconContainer}>
                                        <Ionicons name="trending-down-outline" size={18} color="#FFF" />
                                    </View>
                                </View>
                                <View style={styles.statusBody}>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Quotes:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.declined.quotes}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="cash-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Values:</Text>
                                        </View>
                                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.declined.value.toLocaleString('en-IN')}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Customers:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.declined.customers}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Cancelled Card */}
                        <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.statusCard, { backgroundColor: '#C62828' }]}>
                            <TouchableOpacity style={styles.cardContent} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Cancelled' } })}>
                                <View style={styles.statusHeader}>
                                    <Text style={styles.statusTitle}>CANCELLED</Text>
                                    <View style={styles.statusIconContainer}>
                                        <Ionicons name="time-outline" size={18} color="#FFF" />
                                    </View>
                                </View>
                                <View style={styles.statusBody}>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="document-text-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Quotes:</Text>
                                        </View>
                                        <Text style={stats.cancelled.quotes > 0 ? styles.statValue : styles.statValue}> {stats.cancelled.quotes}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="cash-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Values:</Text>
                                        </View>
                                        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{stats.cancelled.value.toLocaleString('en-IN')}</Text>
                                    </View>
                                    <View style={styles.statRow}>
                                        <View style={styles.statLabelContainer}>
                                            <Ionicons name="people-outline" size={16} color="rgba(255,255,255,0.8)" />
                                            <Text style={styles.statLabel}>Customers:</Text>
                                        </View>
                                        <Text style={styles.statValue}>{stats.cancelled.customers}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    {/* Donut Chart Card */}
                    <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.donutCard}>
                        <View style={styles.donutHeader}>
                            <View>
                                <Text style={styles.donutTitle}>Donut Chart</Text>
                                <Text style={styles.donutSubtitle}>Quote distribution overview</Text>
                            </View>
                            <TouchableOpacity style={styles.detailsButton} onPress={() => router.push('/quotations')}>
                                <Text style={styles.detailsButtonText}>View Details</Text>
                                <Ionicons name="arrow-forward-outline" size={14} color="#FFF" style={{ transform: [{ rotate: '-45deg' }] }} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.chartWrapper}>
                            <DonutChart
                                data={[stats.pending.quotes, stats.approved.quotes, stats.declined.quotes, stats.cancelled.quotes]}
                                colors={['#0277BD', '#00BFA5', '#F4511E', '#C62828']}
                                centerText={stats.totalQuotes.toString()}
                                strokeWidth={12}
                            />
                            <View style={styles.legendContainer}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#0277BD' }]} />
                                    <Text style={styles.legendText}>Pending</Text>
                                    <Text style={styles.legendValue}>{stats.pending.quotes}</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#00BFA5' }]} />
                                    <Text style={styles.legendText}>Approved</Text>
                                    <Text style={styles.legendValue}>{stats.approved.quotes}</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#F4511E' }]} />
                                    <Text style={styles.legendText}>Declined</Text>
                                    <Text style={styles.legendValue}>{stats.declined.quotes}</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#C62828' }]} />
                                    <Text style={styles.legendText}>Cancelled</Text>
                                    <Text style={styles.legendValue}>{stats.cancelled.quotes}</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.donutStatsRow}>
                            <View style={styles.donutStat}>
                                <Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{stats.totalQuotes}</Text>
                                <Text style={styles.donutStatLabel}>Total Quotes</Text>
                            </View>
                            <View style={[styles.donutStat, styles.donutStatBorder, { flex: 1.5 }]}>
                                <Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{stats.totalValue.replace('INR', '₹')}</Text>
                                <Text style={styles.donutStatLabel}>Total Value</Text>
                            </View>
                            <View style={styles.donutStat}>
                                <Text style={styles.donutStatValue} numberOfLines={1} adjustsFontSizeToFit>{stats.totalCustomers}</Text>
                                <Text style={styles.donutStatLabel}>Customers</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Bottom Metrics */}
                    <Animated.View entering={FadeInUp.delay(600).duration(800)} style={styles.metricsContainer}>
                        <Animated.View entering={FadeInDown.delay(700).springify()} style={[styles.metricCard, { backgroundColor: '#E0F2F1', borderLeftColor: '#00BFA5', borderLeftWidth: 4 }]}>
                            <View style={[styles.metricIcon, { backgroundColor: '#00BFA5' }]}>
                                <Ionicons name="trending-up" size={16} color="#FFF" />
                            </View>
                            <View>
                                <Text style={styles.metricLabel}>Approved Rate</Text>
                                <Text style={[styles.metricValue, { color: '#00695C' }]}>{stats.conversionRate}</Text>
                            </View>
                        </Animated.View>
                        <Animated.View entering={FadeInDown.delay(800).springify()} style={[styles.metricCard, { backgroundColor: '#E1F5FE', borderLeftColor: '#0277BD', borderLeftWidth: 4 }]}>
                            <View style={[styles.metricIcon, { backgroundColor: '#0277BD' }]}>
                                <Ionicons name="cash-outline" size={16} color="#FFF" />
                            </View>
                            <View>
                                <Text style={styles.metricLabel}>Avg. Quote Value</Text>
                                <Text style={[styles.metricValue, { color: '#01579B' }]}>{stats.avgQuoteValue}</Text>
                            </View>
                        </Animated.View>
                    </Animated.View>

                    <View style={{ height: 100 }} />
                    <FloatingNav />
                </>
            )
            }
        </ScrollView >
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms, width }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        loadingContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 60,
            paddingHorizontal: 24,
            marginBottom: 12,
        },
        welcomeText: {
            fontSize: 12,
            color: '#00BFA5',
            fontWeight: '900',
            letterSpacing: 1.5,
            marginBottom: 2,
            textTransform: 'uppercase',
        },
        liveIndicatorContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            gap: 6,
        },
        liveDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#4CAF50',
            shadowColor: '#4CAF50',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 4,
        },
        liveText: {
            fontSize: 10,
            color: colors.textSecondary,
            fontWeight: '500',
        },
        deniedContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            paddingTop: 150,
            paddingHorizontal: 24,
        },
        deniedContent: {
            backgroundColor: colors.surface,
            borderRadius: 32,
            padding: 32,
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 20 },
            shadowOpacity: 0.1,
            shadowRadius: 30,
            elevation: 10,
            borderWidth: 1,
            borderColor: colors.border,
        },
        deniedIconBox: {
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(244, 81, 30, 0.1)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 24,
        },
        deniedTitle: {
            fontSize: 22,
            fontWeight: '900',
            color: colors.text,
            marginBottom: 12,
        },
        deniedSubtitle: {
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 32,
        },
        deniedButton: {
            backgroundColor: colors.primary,
            paddingVertical: 14,
            paddingHorizontal: 32,
            borderRadius: 16,
        },
        deniedButtonText: {
            color: '#FFF',
            fontSize: 15,
            fontWeight: '900',
        },
        changeDot: {
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#FFF',
            marginRight: 4,
        },
        userNameText: {
            fontSize: 24,
            fontWeight: 'bold',
            color: colors.text,
        },
        avatar: {
            width: 48,
            height: 48,
            borderRadius: 16,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 2,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
        },
        avatarText: {
            fontSize: ms(20),
            fontWeight: '900',
            color: '#FFF',
        },
        profileButton: {
            elevation: 4,
        },
        topActions: {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            paddingHorizontal: 24,
            gap: 8,
            marginBottom: 16,
        },
        iconButton: {
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.surface,
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
        },
        gridContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: 20,
            justifyContent: 'space-between',
        },
        statusCard: {
            width: (width - s(40) - s(12)) / 2,
            minHeight: vs(210), // Increased height and used minHeight
            borderRadius: ms(24),
            marginBottom: vs(12),
            padding: s(16),
            shadowColor: '#000',
            shadowOffset: { width: 0, height: vs(12) },
            shadowOpacity: isDark ? 0.3 : 0.15,
            shadowRadius: ms(15),
            elevation: 10,
        },
        cardContent: {
            flex: 1,
            justifyContent: 'flex-start',
            gap: 16,
        },
        statusHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        statusTitle: {
            fontSize: ms(14),
            fontWeight: '800',
            color: '#FFF',
            letterSpacing: 0.5,
        },
        statusIconContainer: {
            width: 32,
            height: 32,
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.2)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        statusBody: {
            marginTop: 12,
            gap: 8,
        },
        statRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: vs(24), // Ensure some height even if empty
        },
        statLabelContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4, // Reduced gap slightly
            flexShrink: 0, // Labels should not shrink
            marginRight: 4,
        },
        statLabel: {
            fontSize: ms(11),
            color: 'rgba(255,255,255,0.8)',
        },
        statValue: {
            flex: 1, // Take up remaining space
            fontSize: ms(12), // Slightly smaller font for values
            fontWeight: '900',
            color: '#FFF',
            textAlign: 'right',
        },
        statusFooter: {
            marginTop: 12,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.2)',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        vsText: {
            fontSize: 10,
            color: 'rgba(255,255,255,0.8)',
        },
        changeBadge: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
        },
        changeText: {
            fontSize: 12,
            fontWeight: 'bold',
            color: '#FFF',
        },
        donutCard: {
            margin: s(20),
            backgroundColor: colors.surface,
            borderRadius: ms(28),
            padding: s(24),
            shadowColor: '#01579B',
            shadowOffset: { width: 0, height: vs(15) },
            shadowOpacity: 0.08,
            shadowRadius: ms(25),
            elevation: 10,
            borderWidth: 1,
            borderColor: colors.border,
        },
        donutHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
        },
        donutTitle: {
            fontSize: 20,
            fontWeight: 'bold',
            color: colors.text,
        },
        donutSubtitle: {
            fontSize: 12,
            color: colors.textSecondary,
        },
        detailsButton: {
            backgroundColor: isDark ? colors.surfaceSecondary : colors.primary,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            elevation: 4,
        },
        detailsButtonText: {
            color: '#FFF',
            fontSize: 12,
            fontWeight: 'bold',
        },
        chartWrapper: {
            alignItems: 'center',
            paddingVertical: 20,
        },
        legendContainer: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 12,
            marginTop: 20,
        },
        legendItem: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        legendDot: {
            width: 10,
            height: 10,
            borderRadius: 5,
        },
        legendText: {
            fontSize: 10,
            color: colors.textSecondary,
            fontWeight: '500',
            flex: 1,
        },
        legendValue: {
            fontSize: 10,
            color: colors.text,
            fontWeight: '800',
            marginLeft: 8,
        },
        donutStatsRow: {
            flexDirection: 'row',
            marginTop: 24,
            paddingTop: 24,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        donutStat: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
        },
        donutStatBorder: {
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
        },
        donutStatValue: {
            fontSize: 18,
            fontWeight: '900',
            color: colors.text,
        },
        donutStatLabel: {
            fontSize: 10,
            color: colors.textSecondary,
            marginTop: 4,
        },
        metricsContainer: {
            paddingHorizontal: 20,
            paddingBottom: 20,
            gap: 12,
        },
        metricCard: {
            flexDirection: 'row',
            alignItems: 'center',
            padding: 16,
            borderRadius: 16,
            gap: 16,
            backgroundColor: colors.surface,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 4,
        },
        metricIcon: {
            width: 44,
            height: 44,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
        },
        metricLabel: {
            fontSize: 12,
            color: colors.textSecondary,
        },
        metricValue: {
            fontSize: 18,
            fontWeight: 'bold',
            color: colors.text,
        },
    });
}
