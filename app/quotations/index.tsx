import React, { useCallback, useState } from 'react';
import { BackHandler, Modal, ScrollView, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView as RNScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import QuotationList from '@/components/QuotationList';
import { QuotationDashboardPanel } from '@/components/dashboard/QuotationDashboardPanel';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useResponsive } from '../../hooks/useResponsive';

export default function QuotationListScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const { s, vs, ms } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms });

    const [filter, setFilter] = useState((params.filter as string) || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [workflowStates, setWorkflowStates] = useState<string[]>(['All']);
    const [dashboardVisible, setDashboardVisible] = useState(false);

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

    const getCategoryColor = (cat: string) => {
        const s = cat.toUpperCase();
        if (s === 'APPROVED' || s === 'ORDERED' || s === 'SUBMITTED') return '#00BFA5'; // Green
        if (s === 'PENDING') return '#3B82F6'; // Blue
        if (s === 'REVIEW' || s === 'OPEN') return '#F59E0B'; // Orange
        if (s.includes('REOPEN') || s.includes('RESUBMIT')) return '#1E3A8A'; // Dark Blue
        if (s === 'CANCELLED') return '#EF4444'; // Red
        if (s === 'DRAFT') return '#94A3B8'; // Grey
        return colors.primary; // Default
    };

    return (
        <View style={styles.container}>
            
            <ScreenHeader
                title="Quotation"
                onBack={() => router.replace('/home')}
                rightIcon="options-outline"
                onRightPress={() => setDashboardVisible(true)}
            >
                {/* Search Bar */}
                <View style={styles.searchInner}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by ID or Customer..."
                        placeholderTextColor={colors.placeholder}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filter Pills */}
                <RNScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                    style={styles.filterBarContainer}
                >
                    {workflowStates.map((item) => {
                        const isActive = filter === item;
                        const catColor = getCategoryColor(item);
                        return (
                            <TouchableOpacity
                                key={item}
                                style={[styles.filterPill, isActive && styles.filterPillActive]}
                                onPress={() => setFilter(item)}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.filterText, isActive && { color: catColor, fontWeight: '800' }]}>
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </RNScrollView>
            </ScreenHeader>

            <View style={styles.listContainer}>
                <QuotationList
                    filter={filter}
                    searchQuery={searchQuery}
                    scrollEnabled={true}
                    onStatesLoaded={handleStatesLoaded}
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

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        searchInner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: 16,
            height: 50,
            paddingHorizontal: 14,
        },
        searchIcon: { marginRight: 10 },
        searchInput: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
        filterBarContainer: { marginTop: 14, marginHorizontal: -16 },
        filterScrollContent: { paddingHorizontal: 16, gap: 10 },
        filterPill: {
            paddingVertical: 9,
            paddingHorizontal: 18,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.18)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.3)',
        },
        filterPillActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
        filterText: { color: 'rgba(255,255,255,0.92)', fontWeight: '700', fontSize: 13 },
        listContainer: {
            flex: 1,
        },
        modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
        modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingTop: 8 },
        modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9' },
        modalTitle: { fontSize: ms(18), fontWeight: '900' },
        modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
        fab: {
            position: 'absolute',
            bottom: vs(160),
            right: 24,
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 8,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            zIndex: 1000,
        }
    });
}

