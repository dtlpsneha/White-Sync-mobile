import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Dimensions, ScrollView, Image, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { notificationService } from '../services/NotificationService';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
    const router = useRouter();
    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState('Weekly');

    // Stats State
    const [stats, setStats] = useState({
        products: 0,
        orders: 0,
        pending: 0,
        clients: 0,
        totalValue: '0'
    });
    const [lastSeenPendingIds, setLastSeenPendingIds] = useState<string[]>([]);


    useEffect(() => {
        loadData();

        // Polling for new pending quotations
        const interval = setInterval(() => {
            checkForNewPending();
        }, 60000); // Check every minute

        return () => clearInterval(interval);
    }, []);


    const loadData = async () => {
        setLoading(true);
        const hasSession = await checkSession();
        if (hasSession) {
            // Load persisted IDs first
            const stored = await SecureStore.getItemAsync('last_seen_pending_ids');
            if (stored) {
                try {
                    setLastSeenPendingIds(JSON.parse(stored));
                } catch (e) {
                    console.warn('[Home] Failed to parse stored IDs:', e);
                    setLastSeenPendingIds([]);
                }
            }
            await Promise.all([loadUserData(), fetchStats()]);

            // Run initial check to populate/update IDs
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
        await fetchStats();
        setRefreshing(false);
    };

    const loadUserData = async () => {
        try {
            const name = await SecureStore.getItemAsync('user_name');
            setUserName(name || 'Manikandan');
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    };

    const fetchStats = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            // Helper to fetch count
            const fetchCount = async (resource: string, filters: string = '') => {
                try {
                    let url = `http://13.234.62.39:8080/api/resource/${resource}?fields=["name"]&limit_page_length=5000`;
                    if (filters) {
                        url += `&filters=${encodeURIComponent(filters)}`;
                    }
                    const res = await fetch(url, { headers });
                    const data = await res.json();
                    return data.data ? data.data.length : 0;
                } catch (e) {
                    console.warn(`Failed to fetch ${resource} count`, e);
                    return 0;
                }
            };

            // Helper to fetch sum
            const fetchSum = async (resource: string, field: string) => {
                try {
                    const url = `http://13.234.62.39:8080/api/resource/${resource}?fields=["${field}"]&limit_page_length=5000`;
                    const res = await fetch(url, { headers });
                    const data = await res.json();
                    if (data.data) {
                        const total = data.data.reduce((acc: number, item: any) => acc + (item[field] || 0), 0);
                        return total.toLocaleString('en-IN', { maximumFractionDigits: 0, style: 'currency', currency: 'INR' });
                    }
                    return '0';
                } catch (e) {
                    console.warn(`Failed to fetch ${resource} sum`, e);
                    return '0';
                }
            };

            const [items, quotations, pendingQuotes, customers, revenueVal] = await Promise.all([
                fetchCount('Item'),
                fetchCount('Quotation'),
                fetchCount('Quotation', JSON.stringify([['status', '=', 'Open']])), // Changed Pending to Open
                fetchCount('Customer'),
                fetchSum('Quotation', 'grand_total')
            ]);

            setStats({
                products: items,
                orders: quotations,
                pending: pendingQuotes,
                clients: customers,
                totalValue: revenueVal
            });

        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const checkForNewPending = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            if (!sessionCookies) return;

            const headers = {
                'Content-Type': 'application/json',
                'Cookie': sessionCookies
            };

            console.log('[Home-Watcher] Checking for new pending/open quotations...');

            // Fetch both Pending workflow state and Open status
            // Use or_filters to catch both cases
            const fields = JSON.stringify(["name", "customer_name", "grand_total", "currency", "workflow_state", "status"]);
            const filters = JSON.stringify([["docstatus", "=", 0]]); // Drafts
            const orFilters = JSON.stringify([
                ["workflow_state", "=", "Pending"],
                ["status", "=", "Open"]
            ]);

            const url = `http://13.234.62.39:8080/api/resource/Quotation?fields=${encodeURIComponent(fields)}&filters=${encodeURIComponent(filters)}&or_filters=${encodeURIComponent(orFilters)}&order_by=creation desc&limit_page_length=20`;

            const res = await fetch(url, { headers });
            const data = await res.json();

            if (data.data && data.data.length > 0) {

                const currentPendingIds = data.data.map((q: any) => q.name);

                // If we have previous seen IDs, check for new ones
                if (lastSeenPendingIds.length > 0) {
                    const newQuotes = data.data.filter((q: any) => !lastSeenPendingIds.includes(q.name));

                    if (newQuotes.length > 0) {
                        console.log(`[Home] Found ${newQuotes.length} NEW pending quotations!`);

                        for (const quote of newQuotes) {
                            await notificationService.postLocalNotification(
                                "New Pending Quotation",
                                `New quotation ${quote.name} for ${quote.customer_name} requires your approval.`,
                                { id: quote.name },
                                "QUOTATION_WORKFLOW"
                            );
                        }
                    }
                }

                // Update seen IDs and persist
                setLastSeenPendingIds(currentPendingIds);
                await SecureStore.setItemAsync('last_seen_pending_ids', JSON.stringify(currentPendingIds));
            }
        } catch (error) {

            console.warn('[Home] Background check failed:', error);
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

    const getChartData = (period: string) => {
        switch (period) {
            case 'Monthly':
                return {
                    labels: ['W1', 'W2', 'W3', 'W4'],
                    data: [45, 30, 55, 40]
                };
            case 'Today':
                return {
                    labels: ['9am', '12pm', '3pm', '6pm'],
                    data: [15, 35, 20, 50]
                };
            case 'Weekly':
            default:
                return {
                    labels: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
                    data: [32, 28, 38, 22, 52, 25, 28] // Matching the image roughly
                };
        }
    };

    if (loading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={{ paddingBottom: 100 }}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
            }
        >
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeText}>Welcome Back!</Text>
                    <Text style={styles.userNameText}>{userName || 'User'}</Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.profileButton}>
                    {/* Placeholder Avatar */}
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Grid Container */}
            <View style={styles.gridContainer}>
                {/* Card 1: Quotations (Black) */}
                <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.card, styles.cardBlack]}>
                    <TouchableOpacity style={styles.cardInner} onPress={() => router.push('/quotations')}>
                        <View>
                            <Text style={styles.cardValueWhite}>{stats.orders}</Text>
                            <Text style={styles.cardLabelWhite}>Quotations</Text>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: '30%', backgroundColor: '#FFF' }]} />
                            </View>
                            <View style={styles.progressLabels}>
                                <Text style={styles.progressTextWhite}>0%</Text>
                                <Text style={styles.progressTextWhite}>30%</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Animated.View>

                {/* Card 2: Pending (White) */}
                <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.card, styles.cardWhite]}>
                    <TouchableOpacity style={styles.cardInner} onPress={() => router.push({ pathname: '/quotations', params: { filter: 'Pending' } })}>
                        <View>
                            <Text style={styles.cardValueBlack}>{stats.pending}</Text>
                            <Text style={styles.cardLabelGray}>Pending</Text>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBgGray}>
                                <View style={[styles.progressBarFill, { width: '50%', backgroundColor: '#FF9F43' }]} />
                            </View>
                            <View style={styles.progressLabels}>
                                <Text style={styles.progressTextGray}>0%</Text>
                                <Text style={styles.progressTextGray}>50%</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Animated.View>

                {/* Card 3: Total Clients (White) */}
                <Animated.View entering={FadeInDown.delay(300).springify()} style={[styles.card, styles.cardWhite]}>
                    <TouchableOpacity style={styles.cardInner} onPress={() => console.log('Clients')}>
                        <View>
                            <Text style={styles.cardValueBlack}>{stats.clients}</Text>
                            <Text style={styles.cardLabelGray}>Total Clients</Text>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBgGray}>
                                <View style={[styles.progressBarFill, { width: '70%', backgroundColor: '#C4C4C4' }]} />
                            </View>
                            <View style={styles.progressLabels}>
                                <Text style={styles.progressTextGray}>0%</Text>
                                <Text style={styles.progressTextGray}>70%</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Animated.View>

                {/* Card 4: Revenue (White) */}
                <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.card, styles.cardWhite]}>
                    <TouchableOpacity style={styles.cardInner}>
                        <View>
                            <Text style={[styles.cardValueBlack, { fontSize: 22 }]} numberOfLines={1}>{stats.totalValue}</Text>
                            <Text style={styles.cardLabelGray}>Total Value</Text>
                        </View>
                        <View style={styles.progressContainer}>
                            <View style={styles.progressBarBgGray}>
                                <View style={[styles.progressBarFill, { width: '70%', backgroundColor: '#F8B4B4' }]} />
                            </View>
                            <View style={styles.progressLabels}>
                                <Text style={styles.progressTextGray}>0%</Text>
                                <Text style={styles.progressTextGray}>70%</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Animated.View>
            </View>

            {/* Debug Section */}
            <View style={{ padding: 24, marginTop: 10 }}>
                <TouchableOpacity
                    style={{
                        backgroundColor: '#7367F0',
                        padding: 16,
                        borderRadius: 16,
                        alignItems: 'center',
                        shadowColor: '#7367F0',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
                        elevation: 4
                    }}
                    onPress={async () => {
                        const { status } = await Notifications.getPermissionsAsync();
                        console.log('[Home-Debug] Notification Status:', status);

                        await notificationService.postLocalNotification(
                            "DASHBOARD TEST",
                            "This is a test notification from the Dashboard.",
                            { from: 'home' }
                        );

                        Alert.alert("Debug", `Notification Permission: ${status.toUpperCase()}. \n\nNotification triggered! Check your notification drawer.`);
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="notifications-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 16 }}>DEBUG: Test Notification</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 24,
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1C1C1E',
    },
    profileButton: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E1E1E1',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#FFF',
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#666',
    },
    gridContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 24,
        gap: 16,
    },
    card: {
        width: (width - 48 - 16) / 2, // (Screen width - padding - gap) / 2
        height: 160,
        borderRadius: 24,
        padding: 20,
        shadowColor: '#000',
        elevation: 5,
    },
    cardBlack: {
        backgroundColor: '#000',
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 10,
    },
    cardWhite: {
        backgroundColor: '#FFF',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
    },
    cardInner: {
        flex: 1,
        justifyContent: 'space-between',
    },
    cardValueWhite: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 4,
    },
    cardLabelWhite: {
        fontSize: 14,
        color: '#CCC',
        fontWeight: '500',
    },
    cardValueBlack: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1C1C1E',
        marginBottom: 4,
    },
    cardLabelGray: {
        fontSize: 14,
        color: '#8E8E93',
        fontWeight: '500',
    },
    progressContainer: {
        marginTop: 10,
    },
    progressBarBg: {
        height: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 4,
        marginBottom: 6,
    },
    progressBarBgGray: {
        height: 8,
        backgroundColor: '#F2F2F7',
        borderRadius: 4,
        marginBottom: 6,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    progressTextWhite: {
        color: '#CCC',
        fontSize: 10,
        fontWeight: '600',
    },
    progressTextGray: {
        color: '#8E8E93',
        fontSize: 10,
        fontWeight: '600',
    },

    // Chart
    chartSection: {
        marginTop: 32,
        paddingHorizontal: 24,
    },
    chartHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    // headerTitle: { ... } removed (duplicate)
    welcomeText: {
        fontSize: 16,
        color: '#8E8E93',
        fontWeight: '600',
        marginBottom: 4,
    },
    userNameText: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#1C1C1E',
    },
    chartTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1C1C1E',
    },
    periodSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 4,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    periodText: {
        fontSize: 12,
        color: '#8E8E93',
        paddingHorizontal: 10,
        fontWeight: '600',
    },
    periodActive: {
        backgroundColor: '#000',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 8,
    },
    periodActiveText: {
        fontSize: 12,
        color: '#FFF',
        fontWeight: 'bold',
    },
    periodInactive: {
        paddingVertical: 6,
        paddingHorizontal: 12,
    },
    chartContainer: {
        backgroundColor: '#FFF',
        borderRadius: 24,
        padding: 20,
        flexDirection: 'row',
        height: 280,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 10,
        elevation: 3,
    },
    yAxis: {
        justifyContent: 'space-between',
        paddingBottom: 24, // space for x-axis
        marginRight: 12,
    },
    graphArea: {
        flex: 1,
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#F2F2F7',
        position: 'relative',
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: '#F8F9FA',
    },
    xAxis: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 8,
    },
    axisLabel: {
        fontSize: 10,
        color: '#8E8E93',
    }
});
