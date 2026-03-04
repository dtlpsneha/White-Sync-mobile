import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

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

interface MaintenanceListProps {
    records: MaintenanceRecord[];
    loading: boolean;
}

const MaintenanceList = ({ records, loading }: MaintenanceListProps) => {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    const handleRecordPress = (record: MaintenanceRecord) => {
        router.push({
            pathname: `/maintenance/[id]`,
            params: { id: record.name }
        });
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
        } catch (e) { return dateStr; }
    };

    const renderItem = ({ item, index }: { item: MaintenanceRecord, index: number }) => {
        const isFollowUp = item.follow_up_required === 1;
        const isCompleted = item.completion_status === 'Completed';

        return (
            <Animated.View>
                <TouchableOpacity
                    style={[styles.item, { backgroundColor: colors.surface }]}
                    onPress={() => handleRecordPress(item)}
                    activeOpacity={0.9}
                >
                    <LinearGradient
                        colors={isDark ? ['rgba(255,255,255,0.05)', 'transparent'] : ['rgba(0,0,0,0.01)', 'transparent']}
                        style={StyleSheet.absoluteFill}
                    />

                    <View style={styles.itemHeader}>
                        <View style={styles.titleContainer}>
                            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                                {item.customer_name || item.customer || 'Generic Customer'}
                            </Text>
                            <Text style={[styles.recordId, { color: colors.textSecondary }]}>{item.name}</Text>
                        </View>
                        <View style={[styles.typeBadge, {
                            backgroundColor: (item.maintenance_type === 'New' || item.maintenance_type === 'New Customer') ? colors.primary : colors.surfaceSecondary,
                        }]}>
                            <Text style={[styles.typeText, { color: (item.maintenance_type === 'New' || item.maintenance_type === 'New Customer') ? '#FFFFFF' : colors.textSecondary }]}>
                                {item.maintenance_type || 'Visit'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.infoGrid}>
                        <View style={styles.infoItem}>
                            <View style={[styles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                                <Ionicons name="location" size={14} color={colors.primary} />
                            </View>
                            <Text style={[styles.infoText, { color: colors.textSecondary }]} numberOfLines={1}>
                                {item.customer_address || 'Coimbatore'}
                            </Text>
                        </View>
                        <View style={styles.infoItem}>
                            <View style={[styles.iconBox, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                                <Ionicons name="calendar" size={14} color={colors.primary} />
                            </View>
                            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                                {formatDate(item.mntc_date)}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <View style={styles.statusContainer}>
                            <View style={[styles.statusDot, { backgroundColor: isCompleted ? colors.success : colors.danger }]} />
                            <Text style={[styles.statusLabel, { color: isCompleted ? colors.success : colors.danger }]}>
                                {item.completion_status || 'Pending'}
                            </Text>
                        </View>

                        <View style={styles.badgesRow}>
                            {isFollowUp && (
                                <View style={[styles.badge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                                    <Ionicons name="notifications" size={10} color="#EA580C" style={{ marginRight: 4 }} />
                                    <Text style={[styles.badgeText, { color: '#EA580C' }]}>Follow-up</Text>
                                </View>
                            )}
                            <View style={[styles.badge, { backgroundColor: isDark ? '#334155' : '#F1F5F9', borderColor: colors.border }]}>
                                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                                    {item.purposes?.[0]?.item_code || 'Service'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {isFollowUp && item.follow_up_due_date && (
                        <View style={[styles.followUpBar, { backgroundColor: isDark ? '#2D1D13' : '#FFFBF0' }]}>
                            <Text style={[styles.followUpText, { color: '#B45309' }]}>
                                Next: {formatDate(item.follow_up_due_date)} • {item.follow_up_type || 'Check-in'}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </Animated.View>
        );
    };

    return (
        <View style={styles.container}>
            {loading ? (
                <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
                <View style={styles.listContent}>
                    {records.length === 0 ? (
                        <View style={styles.emptyContainer}>
                            <Ionicons name="document-text-outline" size={48} color={colors.placeholder} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recent visits found.</Text>
                        </View>
                    ) : (
                        records.map((item, index) => (
                            <React.Fragment key={item.name}>
                                {renderItem({ item, index })}
                            </React.Fragment>
                        ))
                    )}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    centerContainer: { padding: 40, justifyContent: 'center', alignItems: 'center' },
    listContent: { gap: 16 },
    item: {
        borderRadius: 24,
        padding: 20,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 3
    },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    titleContainer: { flex: 1, marginRight: 12 },
    title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginBottom: 2 },
    recordId: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', opacity: 0.7 },
    typeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
    typeText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
    infoGrid: { flexDirection: 'row', gap: 16, marginBottom: 20 },
    infoItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    iconBox: { width: 28, height: 28, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    infoText: { fontSize: 13, fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    statusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    badgesRow: { flexDirection: 'row', gap: 8 },
    badge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    followUpBar: { marginTop: 16, marginHorizontal: -20, marginBottom: -20, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.02)' },
    followUpText: { fontSize: 11, fontWeight: '700' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
    emptyText: { fontSize: 14, fontWeight: '600' }
});

export default MaintenanceList;
