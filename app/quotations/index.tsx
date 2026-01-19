import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import QuotationList from '@/components/QuotationList';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { FloatingNav } from '@/components/FloatingNav';
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

    useEffect(() => {
        fetchWorkflowStates();
    }, []);

    const fetchWorkflowStates = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            const showAllStr = await SecureStore.getItemAsync('show_all_quotes');
            const showAll = showAllStr === 'true';

            // Fetch all quotations to get distinct workflow states via new API
            const url = `http://13.234.62.39:8080/api/method/get_quote_resource`;
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    show_quotation_type: showAll ? 'all' : 'respective_user'
                })
            });
            const data = await response.json();

            // Handle different response structures for robustness
            let quotes: any[] = [];
            if (Array.isArray(data.message)) quotes = data.message;
            else if (data.message && Array.isArray(data.message.data)) quotes = data.message.data;

            if (quotes && quotes.length > 0) {
                const states: string[] = quotes
                    .reduce((acc: string[], q: any) => {
                        const ws = q.workflow_state;
                        const s = q.status === 'Open' ? 'Pending' : q.status;
                        const displayStatus = ws || s;
                        if (displayStatus && !acc.includes(displayStatus)) acc.push(displayStatus);
                        return acc;
                    }, [])
                    .sort();

                // Ensure standard mockup states are always present in the collection if needed
                const mockupStates = ['Approved', 'Cancelled', 'Draft'];
                mockupStates.forEach(s => {
                    if (!states.includes(s)) states.push(s);
                });

                // Ensure a standard order if possible: All, Pending, Approved...
                const priority = ['Pending', 'Approved', 'Cancelled', 'Draft', 'Review'];
                const sortedStates = states.sort((a, b) => {
                    const indexA = priority.indexOf(a);
                    const indexB = priority.indexOf(b);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.localeCompare(b);
                });

                setWorkflowStates(['All', ...sortedStates]);
            } else {
                // If no quotes at all, show the standard filters from mockup
                setWorkflowStates(['All', 'Approved', 'Cancelled', 'Draft']);
            }
        } catch (error) {
            console.error('Error fetching workflow states:', error);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.replace('/home')} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Quotations</Text>
                    <TouchableOpacity style={styles.headerActionButton}>
                        <Ionicons name="filter-outline" size={24} color={colors.text} />
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
                        {workflowStates.map((item) => (
                            <TouchableOpacity
                                key={item}
                                style={[styles.filterPill, filter === item && styles.filterPillActive]}
                                onPress={() => setFilter(item)}
                            >
                                <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </RNScrollView>
                </View>
            </View>

            {/* List */}
            <View style={styles.listContainer}>
                <QuotationList filter={filter} searchQuery={searchQuery} scrollEnabled={true} />
            </View>

            <FloatingNav />
        </View>
    );
}

import { ScrollView as RNScrollView } from 'react-native';

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
            marginBottom: 20,
        },
        backButton: {
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.surfaceSecondary,
            justifyContent: 'center',
            alignItems: 'center',
        },
        headerTitle: {
            fontSize: ms(24),
            fontWeight: '900',
            color: colors.text,
            letterSpacing: -1,
        },
        headerActionButton: {
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: colors.surfaceSecondary,
            justifyContent: 'center',
            alignItems: 'center',
        },
        searchContainer: {
            paddingHorizontal: 20,
            marginBottom: 16,
        },
        searchInner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            borderRadius: 18,
            height: 54,
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
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 14,
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
        }
    });
}
