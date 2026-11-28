import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, Modal, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import QuotationList, { Quotation, quoteAmount, quoteFlags, quoteStatusColor } from '@/components/QuotationList';
import { QuotationDashboardPanel } from '@/components/dashboard/QuotationDashboardPanel';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandStats } from '@/components/ui/Midnight';
import { useResponsive } from '../../hooks/useResponsive';

/** ₹ in short Indian units for the header figures: ₹4.2L, ₹1.3Cr. */
function shortRupees(n: number): string {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${Math.round(n / 1e3)}K`;
    return `₹${Math.round(n)}`;
}

export default function QuotationListScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const { ms } = useResponsive();
    const styles = useMemo(() => getStyles(theme, ms), [theme, ms]);

    const [filter, setFilter] = useState((params.filter as string) || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [workflowStates, setWorkflowStates] = useState<string[]>(['All']);
    const [dashboardVisible, setDashboardVisible] = useState(false);
    const [all, setAll] = useState<Quotation[] | null>(null);

    // This screen is reached via router.replace (see SideNav), so there is
    // nothing beneath it on the navigation stack — without this, Android's
    // hardware/gesture back button falls through and exits the app instead
    // of going to Home, unlike the on-screen back arrow above.
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

    // The filter pills are derived from whatever states QuotationList already
    // downloaded, instead of this screen fetching the entire quote list a
    // second time purely to read their labels.
    const handleStatesLoaded = useCallback((states: string[]) => {
        try {
            const priority = ['PENDING', 'APPROVED', 'REVIEW', 'CANCELLED', 'DRAFT', 'ORDERED', 'RE-OPEN', 'REOPEN', 'RESUBMIT', 'SUBMIT'];
            const standardDefaults = ['PENDING', 'APPROVED', 'REVIEW', 'CANCELLED', 'DRAFT', 'REOPEN'];

            const allUniqueStates = Array.from(new Set([
                ...standardDefaults,
                ...states.map(s => s.toUpperCase())
            ]));

            const sortedStates = allUniqueStates.sort((a, b) => {
                const indexA = priority.indexOf(a.toUpperCase());
                const indexB = priority.indexOf(b.toUpperCase());
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });

            const displayStates = sortedStates.map(s => {
                const original = states.find(os => os.toUpperCase() === s);
                if (original) return original;
                if (s === 'REOPEN') return 'Re-open';
                return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
            });

            setWorkflowStates(['All', ...displayStates]);
        } catch {
            setWorkflowStates(['All', 'Pending', 'Approved', 'Review', 'Cancelled', 'Draft', 'Re-open']);
        }
    }, []);

    // Header figures, worked out from the list QuotationList already fetched.
    // Cancelled quotes are left out of all three.
    const stats = useMemo(() => {
        if (!all) return null;
        let value = 0, count = 0, approved = 0, approvedValue = 0, pending = 0;
        for (const q of all) {
            const f = quoteFlags(q);
            if (f.isCanceled) continue;
            const amt = quoteAmount(q);
            count += 1;
            value += amt;
            if (f.isApproved) { approved += 1; approvedValue += amt; }
            else if (f.isPending) pending += 1;
        }
        return { value, count, approved, approvedValue, pending };
    }, [all]);

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Quotations"
                subtitle="Created quotations"
                align="left"
                onBack={() => router.replace('/home')}
                rightIcon="options-outline"
                onRightPress={() => setDashboardVisible(true)}
            >
                <BandStats
                    items={[
                        { label: 'Total value', value: stats ? shortRupees(stats.value) : '—', note: stats ? `${stats.count} quotes` : ' ' },
                        { label: 'Approved', value: stats ? String(stats.approved) : '—', note: stats ? shortRupees(stats.approvedValue) : ' ', color: colors.mint },
                        { label: 'Pending', value: stats ? String(stats.pending) : '—', note: 'awaiting reply', color: colors.amber },
                    ]}
                />
            </ScreenHeader>

            <View style={styles.tools}>
                <View style={[styles.search, Shadow.card(theme)]}>
                    <Ionicons name="search" size={18} color={colors.textSecondary} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by ID or customer…"
                        placeholderTextColor={colors.placeholder}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipBar}>
                    {workflowStates.map(item => {
                        const on = filter === item;
                        return (
                            <TouchableOpacity
                                key={item}
                                style={[styles.chip, on && styles.chipOn]}
                                onPress={() => setFilter(item)}
                                activeOpacity={0.85}
                            >
                                {item !== 'All' ? <View style={[styles.chipDot, { backgroundColor: on ? '#FFF' : quoteStatusColor(item) }]} /> : null}
                                <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.listContainer}>
                <QuotationList
                    filter={filter}
                    searchQuery={searchQuery}
                    scrollEnabled={true}
                    onStatesLoaded={handleStatesLoaded}
                    onLoaded={setAll}
                />
            </View>

            <Modal
                visible={dashboardVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setDashboardVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalSheet, { backgroundColor: colors.background }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Quotation Overview</Text>
                            <TouchableOpacity onPress={() => setDashboardVisible(false)} style={styles.modalClose}>
                                <Ionicons name="close" size={22} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                            <QuotationDashboardPanel onSelectFilter={(key) => { setFilter(key); setDashboardVisible(false); }} />
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', ms: (n: number) => number) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        tools: { paddingTop: 14, paddingHorizontal: 16, gap: 12, paddingBottom: 12 },
        search: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: colors.surface,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            height: 46,
            paddingHorizontal: 14,
        },
        searchInput: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
        chipBar: { marginHorizontal: -16, flexGrow: 0 },
        chips: { paddingHorizontal: 16, gap: 8 },
        chip: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingVertical: 7,
            paddingHorizontal: 13,
            borderRadius: Radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
        },
        chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
        chipDot: { width: 6, height: 6, borderRadius: 3 },
        chipText: { color: colors.text, fontWeight: '700', fontSize: 12.5 },
        chipTextOn: { color: '#FFF' },
        listContainer: { flex: 1 },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
        modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingTop: 8, paddingBottom: 64 },
        modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
        modalTitle: { fontSize: ms(18), fontWeight: '900' },
        modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
    });
}
