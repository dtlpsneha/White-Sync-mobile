import React, { useCallback, useMemo, useState } from 'react';
import { BackHandler, View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SalesOrderList, { SalesOrder, orderStatusColor } from '@/components/SalesOrderList';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandStats } from '@/components/ui/Midnight';

const BASE_STATES = ['Pending', 'Approved', 'Cancelled', 'Draft'];

/** ₹ in short Indian units for the header figures: ₹4.2L, ₹1.3Cr. */
function shortRupees(n: number): string {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
    if (n >= 1e3) return `₹${Math.round(n / 1e3)}K`;
    return `₹${Math.round(n)}`;
}

export default function SalesOrderScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const styles = useMemo(() => getStyles(theme), [theme]);
    const insets = useSafeAreaInsets();

    const [filter, setFilter] = useState((params.filter as string) || 'All');
    const [searchQuery, setSearchQuery] = useState('');
    const [orders, setOrders] = useState<SalesOrder[] | null>(null);

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

    // Filter pills: the four standard ones plus every other status in the list
    // SalesOrderList already fetched (this screen used to download it a second time).
    const workflowStates = useMemo(() => {
        const extra: string[] = [];
        for (const o of orders || []) {
            const st = (o.workflow_state || o.status || '').trim();
            if (!st) continue;
            const label = st.charAt(0).toUpperCase() + st.slice(1).toLowerCase();
            if (!BASE_STATES.includes(label) && !extra.some(x => x.toUpperCase() === label.toUpperCase())) extra.push(label);
        }
        return ['All', ...BASE_STATES, ...extra.sort()];
    }, [orders]);

    const stats = useMemo(() => {
        if (!orders) return null;
        let open = 0, openValue = 0, drafts = 0;
        for (const o of orders) {
            const st = (o.workflow_state || o.status || '').toUpperCase();
            if (st.includes('DRAFT')) drafts += 1;
            else if (st.startsWith('TO ') || st.includes('OPEN') || st.includes('PENDING') || st.includes('HOLD')) {
                open += 1;
                openValue += Number(o.grand_total) || 0;
            }
        }
        return { total: orders.length, open, openValue, drafts };
    }, [orders]);

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Customer PO"
                subtitle="Sales orders in ERPNext"
                align="left"
                onBack={() => router.replace('/home')}
            >
                <BandStats
                    items={[
                        { label: 'Open orders', value: stats ? String(stats.open) : '—', note: 'to deliver or bill' },
                        { label: 'Open value', value: stats ? shortRupees(stats.openValue) : '—', note: stats ? `${stats.total} orders in all` : ' ', color: colors.amber },
                        { label: 'Drafts', value: stats ? String(stats.drafts) : '—', note: 'not submitted', color: colors.onInk },
                    ]}
                />
            </ScreenHeader>

            <View style={styles.tools}>
                <View style={[styles.search, Shadow.card(theme)]}>
                    <Ionicons name="search" size={18} color={colors.textSecondary} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search orders…"
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
                                {item !== 'All' ? <View style={[styles.chipDot, { backgroundColor: on ? '#FFF' : orderStatusColor(item) }]} /> : null}
                                <Text style={[styles.chipText, on && styles.chipTextOn]}>{item}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <View style={styles.listContainer}>
                <SalesOrderList filter={filter} searchQuery={searchQuery} scrollEnabled={true} onLoaded={setOrders} />
            </View>

            <TouchableOpacity
                style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 24 }]}
                activeOpacity={0.8}
                onPress={() => router.push('/sales-orders/create' as any)}
            >
                <Ionicons name="add" size={30} color={colors.onPrimary} />
            </TouchableOpacity>
        </View>
    );
}

function getStyles(theme: 'light' | 'dark') {
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
        fab: {
            position: 'absolute',
            bottom: 70,
            right: 22,
            width: 60,
            height: 60,
            borderRadius: 20,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 8,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 14,
            zIndex: 1000,
        },
    });
}
