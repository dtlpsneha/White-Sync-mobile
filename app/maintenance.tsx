import MaintenanceList from '@/components/MaintenanceList';
import { CustomerVisit, loadVisits, syncPendingVisits } from '@/services/visitExtras';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandStats, StatusPill } from '@/components/ui/Midnight';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
    const insets = useSafeAreaInsets();
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

    const [savedVisits, setSavedVisits] = useState<CustomerVisit[]>([]);
    useFocusEffect(
        useCallback(() => {
            syncPendingVisits().then(loadVisits).then(setSavedVisits);
        }, [])
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
        { label: 'TOTAL CUSTOMERS', value: String(uniqueCustomers), note: 'All time', icon: 'people-outline', color: '#1F2421' },
        { label: 'INTERACTIONS', value: String(totalInteractions), note: 'This month', icon: 'chatbubbles-outline', color: '#2F7D5B' },
        { label: 'FOLLOW-UPS', value: String(followUps), note: 'Required', icon: 'notifications-outline', color: '#D99A14' },
        { label: 'PARTIALLY COMPLETED', value: String(partial), note: 'Visits', icon: 'hourglass-outline', color: '#C8423B' },
    ];

    const syncedCount = savedVisits.filter(v => !!v.erp_name).length;
    const notSynced = savedVisits.length - syncedCount;
    const [show, setShow] = useState<'all' | 'synced' | 'pending'>('all');
    const shown = useMemo(
        () => savedVisits.filter(v => (show === 'all' ? true : show === 'synced' ? !!v.erp_name : !v.erp_name)),
        [savedVisits, show],
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader
                title="Customer Visit"
                subtitle="Saved on this phone"
                align="left"
                onBack={() => router.replace('/home')}
            >
                <BandStats
                    items={[
                        { label: 'Saved', value: String(savedVisits.length), note: 'visits on phone' },
                        { label: 'Synced', value: String(syncedCount), note: 'sent to ERP', color: colors.mint },
                        { label: 'Not synced', value: String(notSynced), note: 'retry on open', color: colors.amber },
                    ]}
                />
            </ScreenHeader>

            <ScrollView
                style={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollInner}
            >
                <View style={styles.chips}>
                    {([
                        ['all', 'All', savedVisits.length],
                        ['synced', 'Synced', syncedCount],
                        ['pending', 'Not synced', notSynced],
                    ] as const).map(([key, text, n]) => {
                        const on = show === key;
                        return (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setShow(key)}
                                style={[styles.chip, { backgroundColor: on ? colors.ink : colors.surface, borderColor: on ? colors.ink : colors.border }]}
                            >
                                <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]}>{text}</Text>
                                <Text style={[styles.chipCount, { color: on ? '#FFF' : colors.textSecondary }]}>{n}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {shown.length === 0 ? (
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        {savedVisits.length === 0 ? 'No visits saved yet. Tap + to add a visit.' : 'No visits in this list.'}
                    </Text>
                ) : shown.map(v => {
                    const synced = !!v.erp_name;
                    const edge = synced ? colors.success : colors.danger;
                    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.date_of_visit || '');
                    const day = m ? String(Number(m[3])) : '—';
                    const mon = m ? MONTHS[Number(m[2]) - 1] : '';
                    const who = [v.executive || '-', v.along_with.length ? `with ${v.along_with.join(', ')}` : ''].filter(Boolean).join(' · ');
                    return (
                        <View key={v.id} style={[styles.visitCard, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <View style={[styles.edge, { backgroundColor: edge }]} />
                            <View style={styles.visitHead}>
                                <View style={[styles.dateTile, { backgroundColor: colors.ink }]}>
                                    <Text style={styles.dateDay}>{day}</Text>
                                    <Text style={[styles.dateMon, { color: colors.amber }]}>{mon}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.visitTitle, { color: colors.text }]} numberOfLines={2}>
                                        {v.customer_planned.length ? v.customer_planned.join(', ') : 'No customers listed'}
                                    </Text>
                                    <Text style={[styles.visitSub, { color: colors.textSecondary }]} numberOfLines={1}>{who}</Text>
                                </View>
                                <StatusPill text={synced ? 'Synced' : 'Not synced'} color={edge} />
                            </View>
                            <TouchableOpacity
                                style={[styles.reportBtn, { backgroundColor: colors.background }]}
                                onPress={() => router.push({ pathname: '/maintenance/completion-report', params: { id: v.id } } as any)}
                            >
                                <Ionicons name="document-text-outline" size={16} color={colors.primaryVariant} />
                                <Text style={[styles.reportBtnText, { color: colors.primaryVariant }]}>{v.completion ? 'Open visit record' : 'Completion Report'}</Text>
                                <Ionicons name="chevron-forward" size={16} color={colors.primaryVariant} />
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </ScrollView>

            <TouchableOpacity
                style={[styles.fab, { backgroundColor: colors.primary, bottom: Math.max(insets.bottom, 12) + 24 }]}
                onPress={() => router.push('/maintenance/create')}
                activeOpacity={0.85}
                accessibilityLabel="Add Visit"
            >
                <Ionicons name="add" size={30} color="#FFFFFF" />
            </TouchableOpacity>

        </View>
    );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function getStyles({ s, vs, ms }: { s: (n: number) => number; vs: (n: number) => number; ms: (n: number) => number }) {
    return StyleSheet.create({
        container: { flex: 1 },
        scrollContent: { flex: 1 },
        scrollInner: { paddingTop: vs(16), paddingBottom: vs(120), paddingHorizontal: s(16), gap: 12 },
        chips: { flexDirection: 'row', gap: 8, marginBottom: 2 },
        chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 7, borderRadius: Radius.pill, borderWidth: 1 },
        chipText: { fontSize: 12.5, fontWeight: '700' },
        chipCount: { fontSize: 12, fontWeight: '800', opacity: 0.7 },
        fab: {
            position: 'absolute',
            bottom: vs(40),
            right: s(22),
            width: ms(60),
            height: ms(60),
            borderRadius: ms(20),
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 50,
            shadowColor: '#E4572E',
            shadowOpacity: 0.4,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
        },
        visitCard: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, paddingLeft: 18, gap: 10, overflow: 'hidden' },
        edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
        visitHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        dateTile: { width: 46, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
        dateDay: { color: '#FFF', fontSize: 18, fontWeight: '800', lineHeight: 20 },
        dateMon: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 2 },
        visitTitle: { fontSize: 14.5, fontWeight: '800' },
        visitSub: { fontSize: 12, fontWeight: '500', marginTop: 2 },
        emptyText: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 40 },
        reportBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
        reportBtnText: { flex: 1, fontWeight: '800', fontSize: 13 },
    });
}
