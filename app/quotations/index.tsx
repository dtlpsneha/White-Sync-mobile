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
import { s, vs, ms } from '../../utils/responsive';

export default function QuotationListScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const styles = getStyles(theme);

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
                <TouchableOpacity onPress={() => router.replace('/home')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#000" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Quotations</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <View style={styles.searchInner}>
                    <Ionicons name="search-outline" size={20} color="#90A4AE" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search quotations..."
                        placeholderTextColor="#90A4AE"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
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

            {/* List */}
            <View style={styles.listContainer}>
                <QuotationList filter={filter} searchQuery={searchQuery} scrollEnabled={true} />
            </View>

            <FloatingNav />
        </View>
    );
}

import { ScrollView as RNScrollView } from 'react-native';

function getStyles(theme: 'light' | 'dark') {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#F8F9FA',
        },
        header: {
            backgroundColor: '#FFF',
            paddingTop: vs(50),
            paddingBottom: vs(15),
            paddingHorizontal: s(20),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        backButton: {
            width: 40,
            height: 40,
            justifyContent: 'center',
            alignItems: 'center',
        },
        headerTitle: {
            fontSize: ms(20),
            fontWeight: '600',
            color: '#000',
        },
        searchContainer: {
            backgroundColor: '#FFF',
            paddingHorizontal: 20,
            paddingBottom: 15,
        },
        searchInner: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFF',
            borderRadius: ms(25),
            borderWidth: 1,
            borderColor: '#E1E4E8',
            height: vs(50),
            paddingHorizontal: s(15),
        },
        searchIcon: {
            marginRight: 10,
        },
        searchInput: {
            flex: 1,
            fontSize: 16,
            color: '#000',
        },
        filterBarContainer: {
            backgroundColor: '#FFF',
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#F0F0F0',
        },
        filterScrollContent: {
            paddingHorizontal: 20,
            gap: 10,
        },
        filterPill: {
            paddingVertical: vs(8),
            paddingHorizontal: s(20),
            borderRadius: ms(25),
            backgroundColor: '#F1F3F5',
            borderWidth: 1,
            borderColor: '#E9ECEF',
        },
        filterPillActive: {
            backgroundColor: '#0055D4', // Blue from mockup
            borderColor: '#0055D4',
        },
        filterText: {
            color: '#495057',
            fontWeight: '500',
            fontSize: 14,
        },
        filterTextActive: {
            color: '#FFF',
        },
        listContainer: {
            flex: 1,
        }
    });
}
