import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView as RNScrollView, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import QuotationList from '@/components/QuotationList';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { QuotationDashboardPanel } from '@/components/dashboard/QuotationDashboardPanel';
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
    const drawerTranslateX = useSharedValue(400);

    const openDashboard = () => {
        setDashboardVisible(true);
        drawerTranslateX.value = withTiming(0, { duration: 280 });
    };
    const closeDashboard = () => {
        drawerTranslateX.value = withTiming(400, { duration: 220 }, (finished) => {
            if (finished) runOnJS(setDashboardVisible)(false);
        });
    };

    const drawerAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: drawerTranslateX.value }],
    }));

    const onSelectDashboardFilter = (statusKey: string) => {
        setFilter(statusKey);
        closeDashboard();
    };

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
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.replace('/home')} style={styles.circularButton}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Quotations</Text>
                    <TouchableOpacity style={styles.circularButton} onPress={openDashboard}>
                        <Ionicons name="options-outline" size={22} color={colors.text} />
                    </TouchableOpacity>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchInner}>
                        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by ID or Customer..."
                            placeholderTextColor={isDark ? 'rgba(255,255,255,0.4)' : '#94A3B8'}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Filter Pills */}
                <View style={styles.filterBarContainer}>
                    <RNScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterScrollContent}
                    >
                        {workflowStates.map((item) => {
                            const isActive = filter === item;
                            const catColor = getCategoryColor(item);
                            
                            return (
                                <TouchableOpacity
                                    key={item}
                                    style={[
                                        styles.filterPill, 
                                        isActive && { 
                                            backgroundColor: catColor, 
                                            borderColor: catColor,
                                            shadowColor: catColor,
                                            elevation: 4,
                                            shadowOpacity: 0.3,
                                            shadowRadius: 8,
                                            shadowOffset: { width: 0, height: 4 }
                                        }
                                    ]}
                                    onPress={() => setFilter(item)}
                                >
                                    <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                                        {item}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </RNScrollView>
                </View>
            </View>

            <View style={styles.listContainer}>
                <QuotationList
                    filter={filter}
                    searchQuery={searchQuery}
                    scrollEnabled={true}
                    onStatesLoaded={handleStatesLoaded}
                />
            </View>

            <Modal visible={dashboardVisible} transparent animationType="fade" onRequestClose={closeDashboard}>
                <View style={{ flex: 1, flexDirection: 'row' }}>
                    <Pressable style={{ flex: 1 }} onPress={closeDashboard}>
                        <View style={{ flex: 1, backgroundColor: 'rgba(10,15,25,0.55)' }} />
                    </Pressable>
                    <Animated.View style={[styles.drawer, { backgroundColor: colors.background }, drawerAnimatedStyle]}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <View style={styles.drawerHead}>
                                <Text style={[styles.drawerTitle, { color: colors.text }]}>Quotation Dashboard</Text>
                                <TouchableOpacity onPress={closeDashboard}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
                            </View>
                            <RNScrollView contentContainerStyle={{ paddingBottom: vs(40) }}>
                                <QuotationDashboardPanel onSelectFilter={onSelectDashboardFilter} />
                            </RNScrollView>
                        </SafeAreaView>
                    </Animated.View>
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
            backgroundColor: isDark ? colors.background : '#F8FAFC',
        },
        header: {
            backgroundColor: colors.surface,
            paddingTop: vs(60),
            paddingBottom: 0,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.3 : 0.05,
            shadowRadius: 20,
            elevation: 10,
            zIndex: 100,
        },
        headerTopRow: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            marginBottom: 24,
            width: '100%',
        },
        circularButton: {
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F1F5F9',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 5,
            elevation: 2,
        },
        headerTitle: {
            fontSize: ms(22),
            fontWeight: '900',
            color: colors.text,
            letterSpacing: -0.5,
        },
        searchContainer: {
            paddingHorizontal: 20,
            marginBottom: 16,
        },
        searchInner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            borderRadius: 20,
            height: 56,
            paddingHorizontal: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'transparent',
        },
        searchIcon: {
            marginRight: 12,
        },
        searchInput: {
            flex: 1,
            fontSize: 16,
            fontWeight: '600',
            color: colors.text,
        },
        filterBarContainer: {
            paddingVertical: 16,
        },
        filterScrollContent: {
            paddingHorizontal: 20,
            gap: 12,
        },
        filterPill: {
            paddingVertical: 12,
            paddingHorizontal: 22,
            borderRadius: 16,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            borderWidth: 1,
            borderColor: colors.border,
        },
        filterPillActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
        },
        filterText: {
            color: colors.textSecondary,
            fontWeight: '700',
            fontSize: 14,
        },
        filterTextActive: {
            color: '#FFF',
            fontWeight: '800',
        },
        listContainer: {
            flex: 1,
        },
        drawer: {
            width: '85%',
            maxWidth: 420,
            height: '100%',
        },
        drawerHead: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
        },
        drawerTitle: {
            fontSize: ms(18),
            fontWeight: '900',
        },
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

