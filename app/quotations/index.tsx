import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, Keyboard } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import QuotationList from '@/components/QuotationList';

export default function QuotationListScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
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

            // Fetch all quotations to get distinct workflow states
            const fields = JSON.stringify(["workflow_state"]);
            const url = `http://13.234.62.39:8080/api/resource/Quotation?fields=${encodeURIComponent(fields)}&limit_page_length=500`;

            const response = await fetch(url, { headers });
            const data = await response.json();

            if (response.ok && data.data) {
                const states = data.data
                    .map((q: any) => q.workflow_state)
                    .filter((state: string) => state && state.trim() !== '')
                    .filter((value: string, index: number, self: string[]) => self.indexOf(value) === index)
                    .sort();
                setWorkflowStates(['All', ...states]);
            }
        } catch (error) {
            console.error('Error fetching workflow states:', error);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Custom Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1C1C1E" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Quotations</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Ionicons name="search-outline" size={20} color="#8E8E93" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search quotations..."
                    placeholderTextColor="#8E8E93"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => { setSearchQuery(''); Keyboard.dismiss(); }}>
                        <Ionicons name="close-circle" size={20} color="#8E8E93" />
                    </TouchableOpacity>
                )}
            </View>

            {/* Scrolling Filter Pills */}
            <View style={styles.filterWrapper}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={workflowStates}
                    contentContainerStyle={styles.filterContainer}
                    keyExtractor={item => item}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[styles.filterPill, filter === item && styles.filterPillActive]}
                            onPress={() => setFilter(item)}
                        >
                            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>
                                {item}
                            </Text>
                        </TouchableOpacity>
                    )}
                />
            </View>

            {/* Reusable List */}
            <View style={styles.listContainer}>
                <QuotationList filter={filter} searchQuery={searchQuery} scrollEnabled={true} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F7F8FA',
    },
    header: {
        backgroundColor: '#FFF',
        paddingTop: 60,
        paddingBottom: 16,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F5',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1C1C1E',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginBottom: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E9ECEF',
        height: 48,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#1C1C1E',
        height: '100%',
    },
    filterWrapper: {
        backgroundColor: 'transparent', // Changed from #FFF for better flow if needed, or keep #FFF
        paddingBottom: 12,
        marginBottom: 8,
    },
    filterContainer: {
        paddingHorizontal: 20,
        gap: 12,
    },
    filterPill: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 24,
        backgroundColor: '#F5F7FA',
        borderWidth: 1,
        borderColor: '#E9ECEF',
    },
    filterPillActive: {
        backgroundColor: '#0056D2',
        borderColor: '#0056D2',
    },
    filterText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 14,
    },
    filterTextActive: {
        color: '#FFF',
    },
    listContainer: {
        flex: 1,
        paddingHorizontal: 20,
    }
});
