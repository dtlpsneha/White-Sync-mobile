import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView as RNScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import SalesOrderList from '@/components/SalesOrderList';
import { apiPost } from '@/utils/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { FloatingNav } from '@/components/FloatingNav';
import { useResponsive } from '@/hooks/useResponsive';
import { apiUrl } from '@/constants/config';

export default function SalesOrderScreen() {
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
    const [workflowStates, setWorkflowStates] = useState<string[]>(['All', 'Pending', 'Approved', 'Cancelled', 'Draft']);

    useEffect(() => {
        fetchWorkflowStates();
    }, []);

    const fetchWorkflowStates = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiPost(apiUrl('/api/method/get_sales_order_resource'), {}, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message && data.message.success && Array.isArray(data.message.data)) {
                const orders = data.message.data;
                const states: string[] = orders
                    .reduce((acc: string[], o: any) => {
                        const displayStatus = (o.workflow_state || o.status || '').trim();
                        if (displayStatus && !acc.some(s => s.toUpperCase() === displayStatus.toUpperCase())) {
                            acc.push(displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1).toLowerCase());
                        }
                        return acc;
                    }, [])
                    .sort();

                setWorkflowStates(['All', 'Pending', 'Approved', 'Cancelled', 'Draft', ...states.filter(s => !['Pending', 'Approved', 'Cancelled', 'Draft'].includes(s))]);
            }
        } catch (error) {
            console.error('Error fetching sales order states:', error);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.replace('/home')} style={styles.circularButton}>
                        <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Sales Orders</Text>
                    <TouchableOpacity style={styles.circularButton}>
                        <Ionicons name="options-outline" size={22} color={colors.text} />
                    </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchInner}>
                        <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search orders..."
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

            <View style={styles.listContainer}>
                <SalesOrderList filter={filter} searchQuery={searchQuery} scrollEnabled={true} />
            </View>

            {/* Floating Action Button for Add */}
            <TouchableOpacity 
                style={styles.fab} 
                activeOpacity={0.8}
                onPress={() => router.push('/sales-orders/create' as any)}
            >
                <Ionicons name="add" size={32} color="#FFF" />
            </TouchableOpacity>

            <FloatingNav />
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: isDark ? colors.background : '#F8FAFC' },
        header: {
            backgroundColor: colors.surface,
            paddingTop: vs(60),
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.3 : 0.05,
            shadowRadius: 20,
            elevation: 10,
            zIndex: 100,
        },
        headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 24 },
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
        headerTitle: { fontSize: ms(22), fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
        searchContainer: { paddingHorizontal: 20, marginBottom: 16 },
        searchInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', borderRadius: 20, height: 56, paddingHorizontal: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'transparent' },
        searchIcon: { marginRight: 12 },
        searchInput: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
        filterBarContainer: { paddingVertical: 16 },
        filterScrollContent: { paddingHorizontal: 20, gap: 12 },
        filterPill: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9', borderWidth: 1, borderColor: colors.border },
        filterPillActive: { backgroundColor: colors.primary, borderColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
        filterText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
        filterTextActive: { color: '#FFF', fontWeight: '800' },
        listContainer: { flex: 1 },
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

