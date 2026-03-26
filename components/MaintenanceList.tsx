import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
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
    total?: string;
    // New fields from user request
    new_customer?: string;
    new_address?: string;
    new_contact_number?: string;
    new_contact_email?: string;
    follow_up_required?: number;
    follow_up_due_date?: string;
    follow_up_notes?: string;
    follow_up_type?: string;
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
            <Animated.View entering={FadeInDown.delay(index * 100).duration(500)}>
                <TouchableOpacity
                    style={[styles.itemCard, { backgroundColor: colors.surface }]}
                    onPress={() => handleRecordPress(item)}
                    activeOpacity={0.7}
                >
                    <View style={styles.cardHeader}>
                        <View style={styles.customerInfo}>
                            <Text style={[styles.customerName, { color: colors.text }]} numberOfLines={1}>
                                {item.customer_name || item.customer || item.new_customer || 'Generic Customer'}
                            </Text>
                            <View style={styles.idRow}>
                                <Text style={[styles.idText, { color: colors.textSecondary }]}>{item.name}</Text>
                                <View style={[styles.dot, { backgroundColor: colors.border }]} />
                                <Text style={[styles.typeText, { color: colors.textSecondary }]}>{item.maintenance_type || 'Visit'}</Text>
                            </View>
                        </View>
                        <View style={[styles.statusChip, {
                            backgroundColor: isCompleted ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            borderColor: isCompleted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                        }]}>
                            <View style={[styles.statusIndicator, { backgroundColor: isCompleted ? colors.success : colors.danger }]} />
                            <Text style={[styles.statusText, { color: isCompleted ? colors.success : colors.danger }]}>
                                {item.completion_status || 'Pending'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.cardBody}>
                        <View style={styles.purposeRow}>
                            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                                <Ionicons name="construct" size={14} color={colors.primary} />
                            </View>
                            <Text style={[styles.purposeText, { color: colors.text }]} numberOfLines={1}>
                                {(() => {
                                    const p1 = item.purposes || [];
                                    const p2 = item.maintenance_visit_purposes || [];
                                    const all = [...p1, ...p2];
                                    const unique = all.filter((it, idx, self) =>
                                        idx === self.findIndex(t => (
                                            (t.item_code || '').trim().toLowerCase() === (it.item_code || '').trim().toLowerCase() &&
                                            (t.item_name || '').trim().toLowerCase() === (it.item_name || '').trim().toLowerCase() &&
                                            (t.work_done || '').trim().toLowerCase() === (it.work_done || '').trim().toLowerCase()
                                        ))
                                    );
                                    const totalCount = unique.length;
                                    const firstItem = unique[0];
                                    const displayName = firstItem?.item_name || firstItem?.item_code || 'Service Request';
                                    return totalCount > 1 ? `${displayName} (+${totalCount - 1})` : displayName;
                                })()}
                            </Text>
                        </View>

                        <View style={styles.metaRow}>
                            <View style={styles.metaItem}>
                                <Ionicons name="calendar-outline" size={12} color={colors.textSecondary} />
                                <Text style={[styles.metaText, { color: colors.textSecondary }]}>{formatDate(item.mntc_date)}</Text>
                            </View>
                            <View style={styles.metaItem}>
                                <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                                <Text style={[styles.metaText, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {item.customer_address?.split(',')[0] || 'Coimbatore'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        {(item.total !== undefined && item.total !== null) && (
                            <View style={[styles.costBadge, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)' }]}>
                                <Text style={[styles.costLabel, { color: colors.primary }]}>Travel Cost</Text>
                                <Text style={[styles.costValue, { color: colors.primary }]}>₹{item.total}</Text>
                            </View>
                        )}

                        <View style={styles.badgeGroup}>
                            {isFollowUp && (
                                <View style={[styles.followUpBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                                    <Ionicons name="notifications" size={10} color="#EA580C" />
                                    <Text style={[styles.badgeTextText, { color: '#EA580C' }]}>Follow-up</Text>
                                </View>
                            )}
                            <TouchableOpacity style={styles.actionBtn}>
                                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {isFollowUp && !!item.follow_up_due_date && (
                        <View style={[styles.followUpAlert, { backgroundColor: isDark ? 'rgba(234, 88, 12, 0.05)' : '#FFFBF0' }]}>
                            <Ionicons name="time-outline" size={12} color="#B45309" />
                            <Text style={[styles.followUpAlertText, { color: '#B45309' }]}>
                                Next Action: {formatDate(item.follow_up_due_date)} • {item.follow_up_type || 'General'}
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
    itemCard: {
        borderRadius: 28,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 4,
        overflow: 'hidden'
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20
    },
    customerInfo: { flex: 1, marginRight: 12 },
    customerName: { fontSize: 20, fontWeight: '900', letterSpacing: -0.6, marginBottom: 4 },
    idRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    idText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
    dot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.3 },
    typeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', opacity: 0.6 },
    statusChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        gap: 6
    },
    statusIndicator: { width: 6, height: 6, borderRadius: 3 },
    statusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    cardBody: { gap: 14, marginBottom: 20 },
    purposeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center'
    },
    purposeText: { fontSize: 14, fontWeight: '700', opacity: 0.9 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaText: { fontSize: 12, fontWeight: '600', opacity: 0.7 },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.03)'
    },
    costBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 14,
        gap: 8
    },
    costLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', opacity: 0.6 },
    costValue: { fontSize: 15, fontWeight: '900' },
    badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    followUpBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        gap: 4
    },
    badgeTextText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
    actionBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.02)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    followUpAlert: {
        marginTop: 16,
        marginHorizontal: -24,
        marginBottom: -24,
        paddingHorizontal: 24,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(0,0,0,0.02)'
    },
    followUpAlertText: { fontSize: 11, fontWeight: '800' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
    emptyText: { fontSize: 15, fontWeight: '700' }
});

export default MaintenanceList;
