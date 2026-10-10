import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView as RNScrollView } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import SalesOrderList from '@/components/SalesOrderList';
import { apiPost } from '@/utils/api';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { useResponsive } from '@/hooks/useResponsive';
import { apiUrl } from '@/constants/config';

export default function SalesOrderScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms });

    const [filter, setFilter] = useState((params.filter as string) || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [workflowStates, setWorkflowStates] = useState<string[]>(['All', 'Pending', 'Approved', 'Cancelled', 'Draft']);

    useEffect(() => {
        fetchWorkflowStates();
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
            <ScreenHeader
                title="Customer Purchase Order"
                onBack={() => router.replace('/home')}
            >
                <View style={styles.searchInner}>
                    <Ionicons name="search" size={20} color={colors.textSecondary} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search orders..."
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

                <RNScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                    style={styles.filterBarContainer}
                >
                    {workflowStates.map((item) => {
                        const isActive = filter === item;
                        return (
                            <TouchableOpacity
                                key={item}
                                style={[styles.filterPill, isActive && styles.filterPillActive]}
                                onPress={() => setFilter(item)}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.filterText, isActive && { color: colors.primary, fontWeight: '800' }]}>
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </RNScrollView>
            </ScreenHeader>

            <View style={styles.listContainer}>
                <SalesOrderList filter={filter} searchQuery={searchQuery} scrollEnabled={true} />
            </View>

            {/* Floating Action Button for Add */}
            <TouchableOpacity 
                style={styles.fab} 
                activeOpacity={0.8}
                onPress={() => router.push('/sales-orders/create' as any)}
            >
                <Ionicons name="add" size={32} color={colors.onPrimary} />
            </TouchableOpacity>
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
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
        listContainer: { flex: 1 },
        fab: {
            position: 'absolute',
            bottom: vs(70),
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

