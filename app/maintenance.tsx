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
import { apiUrl } from '@/constants/config';

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
    purposes?: Array<{
        item_code: string;
        item_name: string;
        description: string;
        work_done: string;
        service_person: string;
    }>;
    maintenance_visit_purposes?: Array<{
        item_code: string;
        item_name: string;
        description: string;
        work_done: string;
        service_person: string;
    }>;
    assigned_to: string;
    sales_executive?: string;
    // New fields from user request
    new_customer?: string;
    new_address?: string;
    new_contact_number?: string;
    new_contact_email?: string;
    follow_up_required?: number;
    follow_up_due_date?: string;
    follow_up_notes?: string;
    follow_up_type?: string;
    total?: any;
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
            const res = await apiGet(apiUrl('/api/method/create_full_visit?limit_page_length=1000'), sessionCookies);

            if (!res.ok) {
                const errorData: any = res.data || {};
                const serverMsg = errorData.message || errorData._server_messages || 'No server message';
                throw new Error(`Server Error (${res.status}): ${serverMsg}`);
            }

            const data: any = res.data;
            let fetchedRecords: MaintenanceRecord[] = [];

            if (data.data) {
                fetchedRecords = data.data;
            } else if (data.message && data.message.data) {
                fetchedRecords = data.message.data;
            } else if (data.message && Array.isArray(data.message)) {
                fetchedRecords = data.message;
            }

            // Deduplicate by record name (ID)
            const uniqueRecords = fetchedRecords.filter((record, index, self) => {
                const recordId = record.name;
                if (!recordId) return true; // Keep if no name for safety/debugging
                return index === self.findIndex((r) => r.name === recordId);
            });

            console.log('[MaintenanceScreen] Total Fetched:', fetchedRecords.length, 'Unique:', uniqueRecords.length);
            setRecords(uniqueRecords);
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

    const stats = [
        { label: 'Total Customers', value: String(uniqueCustomers), trend: 'All Time', icon: 'people', gradient: ['#00BFA5', '#009688'] },
        { label: 'Interactions', value: String(totalInteractions), trend: 'This Month', icon: 'chatbubbles', gradient: ['#10B981', '#059669'] },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.headerGradient, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
                <SafeAreaView>
                    <View style={styles.header}>
                        <View>
                            <Text style={[styles.headerTitle, { color: colors.text }]}>Visits</Text>
                            <View style={styles.headerSubtitleRow}>
                                <View style={[styles.subtitleAccent, { backgroundColor: colors.primary }]} />
                                <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Relationship Management</Text>
                            </View>
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
                <View style={styles.statsContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.statsScroll}
                        decelerationRate="fast"
                    >
                        {stats.map((stat, index) => (
                            <TouchableOpacity key={index} activeOpacity={0.9} style={styles.statWrapper}>
                                <LinearGradient
                                    colors={stat.gradient as any}
                                    style={styles.statCard}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                >
                                    <View style={styles.statHeader}>
                                        <View style={styles.statIconBox}>
                                            <Ionicons name={stat.icon as any} size={22} color="#FFF" />
                                        </View>
                                        <Ionicons name="stats-chart" size={12} color="rgba(255,255,255,0.4)" />
                                    </View>
                                    
                                    <View style={styles.statBody}>
                                        <Text style={styles.statValueText}>{stat.value}</Text>
                                        <Text style={styles.statLabelText}>{stat.label}</Text>
                                    </View>
                                    
                                    <View style={styles.statFooterRow}>
                                        <View style={styles.statTrendBadge}>
                                            <Text style={styles.statTrendText}>{stat.trend}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward-circle" size={18} color="rgba(255,255,255,0.6)" />
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

            {/* New Floating Action Button */}
            <TouchableOpacity 
                style={[styles.fab, { backgroundColor: '#00BFA5' }]} 
                onPress={() => router.push('/maintenance/create')}
                activeOpacity={0.8}
            >
                <Ionicons name="add" size={32} color="#FFFFFF" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerGradient: { 
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)'
    },
    header: { paddingHorizontal: 24, paddingVertical: 16 },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: { fontSize: 36, fontWeight: '900', letterSpacing: -1.5 },
    headerSubtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    subtitleAccent: { width: 12, height: 2, borderRadius: 1 },
    headerSubtitle: { fontSize: 13, fontWeight: '800', opacity: 0.6, letterSpacing: 0.5, textTransform: 'uppercase' },
    fab: {
        position: 'absolute',
        bottom: 150,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#00BFA5',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
        zIndex: 50,
    },
    scrollContent: { flex: 1 },
    scrollInner: { paddingTop: 20, paddingBottom: 110 },
    statsContainer: { marginTop: 8 },
    statsScroll: { paddingHorizontal: 20, gap: 14, paddingBottom: 12 },
    statWrapper: { width: 200, height: 210 },
    statCard: { 
        flex: 1, 
        borderRadius: 36, 
        padding: 24, 
        justifyContent: 'space-between',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8
    },
    statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statIconBox: { 
        width: 48, 
        height: 48, 
        borderRadius: 18, 
        backgroundColor: 'rgba(255,255,255,0.25)', 
        justifyContent: 'center', 
        alignItems: 'center' 
    },
    statBody: { gap: 2 },
    statValueText: { fontSize: 44, fontWeight: '900', color: '#FFF', letterSpacing: -2 },
    statLabelText: { fontSize: 14, fontWeight: '800', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.2 },
    statFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    statTrendBadge: { 
        backgroundColor: 'rgba(255,255,255,0.15)', 
        paddingHorizontal: 12, 
        paddingVertical: 6, 
        borderRadius: 12 
    },
    statTrendText: { fontSize: 11, fontWeight: '900', color: '#FFF', textTransform: 'uppercase', opacity: 0.9 },
    section: { paddingHorizontal: 24, marginTop: 24 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
    sectionAccent: { width: 6, height: 24, borderRadius: 3 },
    sectionTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
    loadingBox: { padding: 60, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, fontWeight: '600' },
    errorBox: { padding: 40, alignItems: 'center', gap: 16, backgroundColor: 'rgba(255,0,0,0.02)', borderRadius: 24 },
    errorText: { fontSize: 14, color: '#EF4444', textAlign: 'center', fontWeight: '500' },
    retryBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#EF4444', borderRadius: 14 },
    retryText: { color: '#FFF', fontWeight: '700' }
});

