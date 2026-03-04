import { FloatingNav } from '@/components/FloatingNav';
import MaintenanceList from '@/components/MaintenanceList';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { apiGet } from '@/utils/api';

interface MaintenanceRecord {
    name: string;
    customer: string;
    customer_name: string;
    mntc_date: string;
    mntc_time: string;
    completion_status: string;
    maintenance_type: string;
    customer_address: string;
    contact_person: string;
    territory: string;
    status: string;
    customer_feedback: string;
    company: string;
    location?: string;
    date_and_time?: string;
    purposes: Array<{
        item_code: string;
        item_name: string;
        description: string;
        work_done: string;
        service_person: string;
    }>;
    assigned_to: string[];
    // New fields from create_full_visit API
    follow_up_required?: number;
    follow_up_due_date?: string;
    follow_up_notes?: string;
    follow_up_type?: string;
    follow_up_status?: string;
    follow_up_owner?: string;
}

export default function MaintenanceScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMaintenanceRecords = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet('http://13.234.62.39:8080/api/method/create_full_visit', sessionCookies);

            if (!res.ok) {
                const errorData: any = res.data || {};
                const serverMsg = errorData.message || errorData._server_messages || 'No server message';
                throw new Error(`Server Error (${res.status}): ${serverMsg}`);
            }

            const data: any = res.data;
            if (data.data) {
                setRecords(data.data);
            } else if (data.message && data.message.data) {
                setRecords(data.message.data);
            } else if (data.message && Array.isArray(data.message)) {
                setRecords(data.message);
            } else {
                setRecords([]);
            }
            setError(null);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchMaintenanceRecords();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchMaintenanceRecords();
    };

    // Filter records for current month
    const currentMonthRecords = records.filter(v => {
        if (!v.mntc_date) return false;
        const vDate = new Date(v.mntc_date);
        const now = new Date();
        return vDate.getMonth() === now.getMonth() && vDate.getFullYear() === now.getFullYear();
    });

    const totalInteractions = currentMonthRecords.length;
    const uniqueCustomers = new Set(records.map(v => v.customer_name)).size;
    const newCustomersCount = new Set(
        currentMonthRecords.filter(v => v.maintenance_type === 'New' || v.maintenance_type === 'New Customer').map(v => v.customer_name)
    ).size;

    const stats = [
        { label: 'Total Customers', value: String(uniqueCustomers), trend: 'All Time', icon: 'people', gradient: ['#6366F1', '#4F46E5'] },
        { label: 'Interactions', value: String(totalInteractions), trend: 'This Month', icon: 'chatbubbles', gradient: ['#EC4899', '#D946EF'] },
        { label: 'New Growth', value: String(newCustomersCount), trend: 'This Month', icon: 'trending-up', gradient: ['#10B981', '#059669'] },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View
                style={[styles.headerGradient, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}
            >
                <SafeAreaView>
                    <View style={styles.header}>
                        <View style={styles.headerContent}>
                            <View>
                                <Text style={[styles.headerTitle, { color: colors.text }]}>Visits</Text>
                                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Relationship Management</Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.addButton, { backgroundColor: colors.primary }]}
                                onPress={() => router.push('/maintenance/create')}
                                activeOpacity={0.8}
                            >
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.2)', 'transparent']}
                                    style={StyleSheet.absoluteFill}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                />
                                <Ionicons name="add" size={20} color="#FFFFFF" />
                                <Text style={styles.addButtonText}>New Visit</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <ScrollView
                style={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollInner}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
            >
                <View>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.statsScroll}
                    >
                        {stats.map((stat, index) => (
                            <TouchableOpacity key={index} activeOpacity={0.9} style={styles.statWrapper}>
                                <LinearGradient
                                    colors={stat.gradient as any}
                                    style={styles.statCard}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <View style={styles.statIconBox}>
                                        <Ionicons name={stat.icon as any} size={20} color="#FFF" />
                                    </View>
                                    <View>
                                        <Text style={styles.statValue}>{stat.value}</Text>
                                        <Text style={styles.statLabel}>{stat.label}</Text>
                                    </View>
                                    <View style={styles.statFooter}>
                                        <Text style={styles.statTrend}>{stat.trend}</Text>
                                        <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.7)" />
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={[styles.sectionAccent, { backgroundColor: colors.primary }]} />
                        <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activities</Text>
                    </View>

                    {loading && !refreshing ? (
                        <View style={styles.loadingBox}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading visits...</Text>
                        </View>
                    ) : error ? (
                        <View style={styles.errorBox}>
                            <Ionicons name="alert-circle" size={40} color={colors.danger} />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
                                <Text style={styles.retryText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <MaintenanceList records={records} loading={false} />
                    )}
                </View>
            </ScrollView>

            <FloatingNav />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerGradient: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
    header: { paddingHorizontal: 24, paddingVertical: 20 },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -1 },
    headerSubtitle: { fontSize: 13, fontWeight: '600', opacity: 0.8 },
    addButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, gap: 6, overflow: 'hidden', elevation: 2 },
    addButtonText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
    scrollContent: { flex: 1 },
    scrollInner: { paddingTop: 24, paddingBottom: 110 },
    statsScroll: { paddingHorizontal: 24, gap: 16, paddingBottom: 10 },
    statWrapper: { width: 160, height: 180 },
    statCard: { flex: 1, borderRadius: 28, padding: 20, justifyContent: 'space-between' },
    statIconBox: { width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    statValue: { fontSize: 36, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
    statLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)', marginTop: -4 },
    statFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    statTrend: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' },
    section: { paddingHorizontal: 24, marginTop: 32 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    sectionAccent: { width: 4, height: 20, borderRadius: 2 },
    sectionTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    loadingBox: { padding: 60, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, fontWeight: '600' },
    errorBox: { padding: 40, alignItems: 'center', gap: 16, backgroundColor: 'rgba(255,0,0,0.02)', borderRadius: 24 },
    errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center', fontWeight: '500' },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#EF4444', borderRadius: 14 },
    retryText: { color: '#FFF', fontWeight: '700' }
});
