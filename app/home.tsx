import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { notificationService } from '../services/NotificationService';
import { apiPost } from '../utils/api';

import { DailySalesReportBody } from '@/components/dashboard/DailySalesReportBody';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { SideNav } from '@/components/SideNav';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { useResponsive } from '../hooks/useResponsive';
import { apiUrl } from '@/constants/config';

export default function HomeScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const { toggleTheme } = useTheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    const { s, vs, ms, width } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms, width });

    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

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
        await checkForNewPending(false);
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
                if (previousIds.length > 0 && !isInitialLoad) {
                    const newQuotes = quotes.filter((q: any) => !previousIds.includes(q.name));
                    // A live server can surface several genuinely new quotations in one
                    // poll (real sales activity, not a dedup bug) — one notification per
                    // quote turned into a burst of popups. Batch them into a single
                    // notification instead; only fall back to the detailed single-quote
                    // message when there's exactly one.
                    if (newQuotes.length === 1) {
                        const quote = newQuotes[0];
                        const formattedAmount = quote.grand_total
                            ? `${quote.currency || ''} ${Number(quote.grand_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                            : '';
                        await notificationService.postLocalNotification(
                            `📄 New Quotation`,
                            `${quote.customer_name} quotation of ${formattedAmount} for approval.`,
                            { id: quote.name },
                            "QUOTATION_WORKFLOW"
                        );
                    } else if (newQuotes.length > 1) {
                        const names = newQuotes.slice(0, 2).map((q: any) => q.customer_name).join(', ');
                        const rest = newQuotes.length - 2;
                        await notificationService.postLocalNotification(
                            `📄 ${newQuotes.length} New Quotations`,
                            `${names}${rest > 0 ? ` and ${rest} more` : ''} for approval.`,
                            { ids: newQuotes.map((q: any) => q.name) },
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
            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
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
                        <LinearGradient
                            colors={isDark ? ['#0B3D91', '#01579B'] : ['#0288D1', '#01579B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.headerCard}
                        >
                            <View style={styles.headerTopRow}>
                                <SideNav onDark />
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Image source={require('../assets/images/logo.png')} style={{ width: ms(26), height: ms(26), borderRadius: ms(6), marginRight: s(8) }} resizeMode="contain" />
                                    <Text style={{ fontSize: ms(17), fontWeight: '900', color: '#FFFFFF' }}>White Sync</Text>
                                </View>
                                <TouchableOpacity onPress={handleLogout} style={styles.profileButton}><View style={styles.avatar}><Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text></View></TouchableOpacity>
                            </View>
                            <Text style={styles.welcomeText}>WELCOME BACK</Text>
                            <Text style={styles.userNameText}>{userName || 'User'}</Text>
                        </LinearGradient>

                        <SectionHeader
                            title="Daily Sales Report"
                            subtitle="Sales & collection summary"
                            icon="bar-chart-outline"
                        />
                        <DailySalesReportBody />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { flex: 1 },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        headerCard: {
            marginHorizontal: s(16),
            marginTop: Platform.OS === 'android' ? vs(46) : vs(16),
            marginBottom: vs(18),
            borderRadius: ms(24),
            padding: ms(18),
            elevation: 6,
            shadowColor: '#01579B',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
        },
        headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vs(14) },
        welcomeText: { fontSize: ms(12), color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 1.5, marginBottom: vs(2), textTransform: 'uppercase' },
        deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: vs(150), paddingHorizontal: s(24) },
        deniedContent: { backgroundColor: colors.surface, borderRadius: ms(32), padding: ms(32), alignItems: 'center', elevation: 5 },
        deniedTitle: { fontSize: ms(22), fontWeight: '900', color: colors.text, marginBottom: vs(12) },
        deniedSubtitle: { fontSize: ms(14), color: colors.textSecondary, textAlign: 'center', marginBottom: vs(32) },
        deniedButton: { backgroundColor: colors.primary, paddingVertical: vs(14), paddingHorizontal: s(32), borderRadius: ms(16) },
        deniedButtonText: { color: '#FFF', fontSize: ms(15), fontWeight: '900' },
        userNameText: { fontSize: ms(24), fontWeight: 'bold', color: '#FFFFFF' },
        profileButton: { elevation: 4 },
        avatar: { width: ms(48), height: ms(48), borderRadius: ms(16), backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center', alignItems: 'center' },
        avatarText: { fontSize: ms(20), fontWeight: '900', color: '#FFF' },
        topActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: s(24), gap: s(8) },
        iconButton: { width: ms(40), height: ms(40), borderRadius: ms(20), backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    });
}

