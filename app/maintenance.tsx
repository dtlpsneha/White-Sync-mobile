import MaintenanceList from '@/components/MaintenanceList';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
    const { s, vs, ms } = useResponsive();
    const styles = getStyles({ s, vs, ms });

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

    // Reached via router.replace (see SideNav), so nothing sits beneath it
    // on the navigation stack — without this, Android's hardware/gesture
    // back button exits the app instead of going to Home like the
    // on-screen back arrow does.
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                router.replace('/home');
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [router])
    );

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
    const uniqueCustomers = new Set(
        records.map(v => v.customer_name || v.customer || v.new_customer).filter(Boolean)
    ).size;

    const followUps = records.filter(v => Number(v.follow_up_required) === 1).length;
    const partial = records.filter(v => (v.completion_status || '').toLowerCase() === 'partially completed').length;

    const stats = [
        { label: 'TOTAL CUSTOMERS', value: String(uniqueCustomers), note: 'All time', icon: 'people-outline', color: '#4F46E5' },
        { label: 'INTERACTIONS', value: String(totalInteractions), note: 'This month', icon: 'chatbubbles-outline', color: '#10B981' },
        { label: 'FOLLOW-UPS', value: String(followUps), note: 'Required', icon: 'notifications-outline', color: '#F59E0B' },
        { label: 'PARTIALLY COMPLETED', value: String(partial), note: 'Visits', icon: 'hourglass-outline', color: '#EF4444' },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader
                title="Customer Visit"
                subtitle="Relationship Management"
                onBack={() => router.replace('/home')}
            />

            <ScrollView
                style={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollInner}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                }
            >
                <View style={styles.statGrid}>
                    {stats.map((stat) => (
                        <View
                            key={stat.label}
                            style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.card(theme)]}
                        >
                            <View style={[styles.statAccent, { backgroundColor: stat.color }]} />
                            <View style={styles.statTop}>
                                <Text style={[styles.statLabel, { color: colors.textSecondary }]} numberOfLines={1}>{stat.label}</Text>
                                <Ionicons name={stat.icon as any} size={ms(20)} color={stat.color} />
                            </View>
                            <Text style={[styles.statValue, { color: stat.color }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                            <Text style={[styles.statNote, { color: stat.color }]} numberOfLines={1}>{stat.note}</Text>
                        </View>
                    ))}
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

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.primary }, Shadow.raised(theme)]}
                onPress={() => router.push('/maintenance/create')}
                activeOpacity={0.85}
                accessibilityLabel="Add Visit"
            >
                <Ionicons name="add" size={32} color="#FFFFFF" />
            </TouchableOpacity>

        </View>
    );
}

function getStyles({ s, vs, ms }: { s: (n: number) => number; vs: (n: number) => number; ms: (n: number) => number }) {
    return StyleSheet.create({
        container: { flex: 1 },
        scrollContent: { flex: 1 },
        scrollInner: { paddingTop: vs(8), paddingBottom: vs(120) },
        fab: {
            position: 'absolute',
            bottom: vs(40),
            right: s(24),
            width: ms(60),
            height: ms(60),
            borderRadius: ms(30),
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 50,
        },
        statGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: s(16), gap: s(10), marginTop: vs(14) },
        statTile: {
            width: '48.4%',
            borderRadius: Radius.lg,
            borderWidth: 1,
            paddingVertical: ms(14),
            paddingRight: ms(14),
            paddingLeft: ms(18),
            overflow: 'hidden',
            minHeight: ms(108),
            justifyContent: 'space-between',
        },
        statAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
        statTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(6) },
        statLabel: { fontSize: ms(10), fontWeight: '800', letterSpacing: 0.7, flexShrink: 1 },
        statValue: { fontSize: ms(28), fontWeight: '900', letterSpacing: -0.5 },
        statNote: { fontSize: ms(11), fontWeight: '700' },
        section: { paddingHorizontal: s(20), marginTop: vs(22) },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: s(10), marginBottom: vs(18) },
        sectionAccent: { width: 5, height: ms(18), borderRadius: 3 },
        sectionTitle: { fontSize: ms(16), fontWeight: '900', letterSpacing: -0.3 },
        loadingBox: { padding: ms(50), alignItems: 'center', gap: 12 },
        loadingText: { fontSize: ms(13), fontWeight: '600' },
        errorBox: { padding: ms(32), alignItems: 'center', gap: 14, backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: Radius.lg },
        errorText: { fontSize: ms(13), color: '#EF4444', textAlign: 'center', fontWeight: '500' },
        retryBtn: { paddingHorizontal: s(22), paddingVertical: vs(11), backgroundColor: '#EF4444', borderRadius: Radius.md },
        retryText: { color: '#FFF', fontWeight: '700' }
    });
}

