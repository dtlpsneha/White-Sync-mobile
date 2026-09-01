import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInUp, FadeInDown, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { apiPost } from '@/utils/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, apiUrl } from '@/constants/config';

const IMAGE_HOST = API_BASE_URL;

interface SalesOrderDetails {
    name: string;
    customer: string;
    status: string;
    transaction_date: string;
    grand_total: number;
    workflow_state?: string;
    items: Array<{
        item_code: string;
        item_name?: string;
        delivery_date: string;
        qty: number;
        rate: number;
        amount: number;
    }>;
    attach?: string | null;
}

export default function SalesOrderDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();
    const localStyles = useMemo(() => getLocalStyles(theme), [theme]);
    
    const [order, setOrder] = useState<SalesOrderDetails | null>(null);
    const [loading, setLoading] = useState(true);

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const normalizedId = Array.isArray(id) ? id[0] : id;

    useEffect(() => {
        if (normalizedId) {
            fetchSalesOrderDetails(normalizedId);
        }
    }, [normalizedId]);

    const fetchSalesOrderDetails = async (currentId: string) => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiPost(apiUrl('/api/method/get_sales_order_resource'), { name: currentId }, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message && data.message.success && Array.isArray(data.message.data)) {
                setOrder(data.message.data[0]);
            }
        } catch (error) {
            console.error('Error fetching sales order details:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        const lower = (status || '').toLowerCase();
        if (lower.includes('approved') || lower.includes('completed')) return '#00BFA5';
        if (lower.includes('draft')) return '#64748B';
        if (lower.includes('cancel')) return '#C62828';
        return '#6366F1'; // Indigo for Sales Orders
    };

    const viewPdf = async (url: string) => {
        try {
            const fileName = url.split('/').pop() || 'document.pdf';
            const fileUri = `${(FileSystem as any).cacheDirectory}${fileName}`;
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            setLoading(true);
            const downloadRes = await (FileSystem as any).downloadAsync(
                url.startsWith('http') ? url : `${IMAGE_HOST}${url}`,
                fileUri,
                {
                    headers: {
                        'Cookie': sessionCookies || ''
                    }
                }
            );

            if (downloadRes.status === 200) {
                await Sharing.shareAsync(downloadRes.uri);
            } else {
                Alert.alert('Error', 'Failed to download PDF.');
            }
        } catch (e) {
            console.error('PDF View Error:', e);
            Alert.alert('Error', 'An error occurred while opening the PDF.');
        } finally {
            setLoading(false);
        }
    };

    const headerTranslateY = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: interpolate(scrollY.value, [0, 200], [0, -210], Extrapolation.CLAMP) }],
            opacity: interpolate(scrollY.value, [200, 250], [1, 0], Extrapolation.CLAMP)
        };
    });

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!order) {
        return (
            <View style={styles.center}>
                <Text style={{ color: colors.textSecondary }}>Sales Order not found</Text>
            </View>
        );
    }

    const currentStatus = order.workflow_state || order.status;
    const statusColor = getStatusColor(currentStatus);

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#F8FAFC' }}>
            <StatusBar style="light" />

            {/* Fancy Header */}
            <Animated.View style={[localStyles.headerBlock, headerTranslateY, { backgroundColor: statusColor }]}>
                <View style={{ marginTop: 60, paddingHorizontal: 24 }}>
                    <View style={localStyles.statusPill}>
                        <Text style={[localStyles.statusText, { color: statusColor }]}>{currentStatus}</Text>
                    </View>
                    <Text style={localStyles.customerName}>{order.customer}</Text>
                    <Text style={localStyles.orderId}>#{order.name}</Text>
                </View>
            </Animated.View>

            {/* Back Button */}
            <TouchableOpacity onPress={() => router.back()} style={localStyles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            
            {currentStatus.toLowerCase().includes('draft') && (
                <TouchableOpacity 
                    onPress={() => router.push(`/sales-orders/create?edit_id=${order.name}`)} 
                    style={localStyles.editButton}
                >
                    <Ionicons name="create-outline" size={24} color="#FFF" />
                </TouchableOpacity>
            )}

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 280, paddingBottom: 100 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                <View style={localStyles.contentContainer}>
                    {/* Basic Info Cards */}
                    <View style={localStyles.infoRow}>
                        <Animated.View entering={FadeInDown.delay(100).springify()} style={localStyles.infoCard}>
                            <Ionicons name="calendar-outline" size={16} color={statusColor} />
                            <Text style={localStyles.infoLabel}>DATE</Text>
                            <Text style={localStyles.infoValue}>{order.transaction_date}</Text>
                        </Animated.View>
                        <Animated.View entering={FadeInDown.delay(200).springify()} style={localStyles.infoCard}>
                            <Ionicons name="cash-outline" size={16} color={statusColor} />
                            <Text style={localStyles.infoLabel}>TOTAL VALUE</Text>
                            <Text style={localStyles.infoValue}>₹{order.grand_total.toLocaleString()}</Text>
                        </Animated.View>
                    </View>

                    {/* Items Section */}
                    <Animated.View entering={FadeInUp.delay(300).springify()} style={localStyles.sectionCard}>
                        <Text style={localStyles.sectionTitle}>Order Items</Text>
                        {order.items.map((item, index) => (
                            <View key={index} style={localStyles.itemBox}>
                                <View style={localStyles.itemHeader}>
                                    <View style={localStyles.itemBadge}>
                                        <Text style={localStyles.itemBadgeText}>{index + 1}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={localStyles.itemName}>{item.item_name || item.item_code}</Text>
                                        <Text style={localStyles.itemCode}>{item.item_code}</Text>
                                    </View>
                                </View>
                                <View style={localStyles.itemFooter}>
                                    <View>
                                        <Text style={localStyles.itemSubLabel}>Qty</Text>
                                        <Text style={localStyles.itemSubValue}>{item.qty}</Text>
                                    </View>
                                    <View>
                                        <Text style={localStyles.itemSubLabel}>Rate</Text>
                                        <Text style={localStyles.itemSubValue}>₹{item.rate.toLocaleString()}</Text>
                                    </View>
                                    <View>
                                        <Text style={localStyles.itemSubLabel}>Total</Text>
                                        <Text style={[localStyles.itemSubValue, { color: statusColor, fontWeight: '900' }]}>₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Attachments Section */}
                    {order.attach || (order as any).attach_image ? (
                        <Animated.View entering={FadeInUp.delay(350).springify()} style={localStyles.sectionCard}>
                            <Text style={localStyles.sectionTitle}>Attachments</Text>
                            {((order.attach || (order as any).attach_image) || '').toLowerCase().endsWith('.pdf') ? (
                                <TouchableOpacity 
                                    style={localStyles.pdfContainer}
                                    onPress={() => viewPdf(order.attach || (order as any).attach_image || '')}
                                >
                                    <Ionicons name="document-text" size={40} color={colors.primary} />
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={localStyles.pdfTitle}>PDF Document</Text>
                                        <Text style={localStyles.pdfSub}>{ (order.attach || (order as any).attach_image || '').split('/').pop() }</Text>
                                    </View>
                                    <Ionicons name="eye-outline" size={24} color={colors.textSecondary} />
                                </TouchableOpacity>
                            ) : (
                                <View style={localStyles.imageContainer}>
                                    <Image 
                                        source={{ uri: (order.attach || (order as any).attach_image || '').startsWith('http') ? (order.attach || (order as any).attach_image || '') : `${IMAGE_HOST}${(order.attach || (order as any).attach_image || '')}` }} 
                                        style={localStyles.attachedImage} 
                                    />
                                </View>
                            )}
                        </Animated.View>
                    ) : null}

                    {/* Summary Card */}
                    <Animated.View entering={FadeInUp.delay(400).springify()} style={localStyles.grandTotalCard}>
                         <Svg height="100" width="100%" style={StyleSheet.absoluteFill}>
                            <Defs>
                                <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor={statusColor} stopOpacity="1" />
                                    <Stop offset="1" stopColor={`${statusColor}CC`} stopOpacity="1" />
                                </LinearGradient>
                            </Defs>
                            <Rect width="100%" height="100%" fill="url(#grad)" rx={24} />
                        </Svg>
                        <View style={localStyles.grandTotalContent}>
                            <View>
                                <Text style={localStyles.grandTotalLabel}>GRAND TOTAL</Text>
                                <Text style={localStyles.grandTotalValue}>₹{order.grand_total.toLocaleString()}</Text>
                            </View>
                            <Ionicons name="receipt" size={40} color="rgba(255,255,255,0.3)" />
                        </View>
                    </Animated.View>
                </View>
            </Animated.ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

/** Theme-aware styles — this sheet previously hardcoded light-mode colours,
 *  so every card stayed white in dark mode. */
const getLocalStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];
    const isDark = theme === 'dark';

    return StyleSheet.create({
        headerBlock: { height: 300, position: 'absolute', top: 0, left: 0, right: 0, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
        backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        editButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        // Sits on the coloured header gradient, so it stays white in both themes.
        statusPill: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 12 },
        statusText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
        customerName: { fontSize: 28, fontWeight: '900', color: '#FFF' },
        orderId: { fontSize: 16, color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginTop: 4 },
        contentContainer: { paddingHorizontal: 20 },
        infoRow: { flexDirection: 'row', gap: 12, marginTop: -40, marginBottom: 20 },
        infoCard: { flex: 1, backgroundColor: c.surface, borderRadius: 20, padding: 16, elevation: 4, shadowColor: '#000', shadowOpacity: isDark ? 0.4 : 0.1, shadowRadius: 10, borderWidth: isDark ? 1 : 0, borderColor: c.border },
        infoLabel: { fontSize: 10, fontWeight: '800', color: c.textSecondary, marginTop: 8 },
        infoValue: { fontSize: 15, fontWeight: '900', color: c.text, marginTop: 2 },
        sectionCard: { backgroundColor: c.surface, borderRadius: 24, padding: 20, marginBottom: 20, elevation: 4, borderWidth: isDark ? 1 : 0, borderColor: c.border },
        sectionTitle: { fontSize: 18, fontWeight: '900', color: c.text, marginBottom: 16 },
        imageContainer: { borderRadius: 20, overflow: 'hidden', height: 250, backgroundColor: c.surfaceSecondary },
        attachedImage: { width: '100%', height: '100%', resizeMode: 'contain' },
        itemBox: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border },
        itemHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
        itemBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
        itemBadgeText: { fontSize: 10, fontWeight: '800', color: c.textSecondary },
        itemName: { fontSize: 15, fontWeight: '800', color: c.text },
        itemCode: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
        itemFooter: { flexDirection: 'row', justifyContent: 'space-between' },
        itemSubLabel: { fontSize: 10, fontWeight: '700', color: c.textSecondary },
        itemSubValue: { fontSize: 14, fontWeight: '800', color: c.text },
        grandTotalCard: { height: 100, borderRadius: 24, overflow: 'hidden' },
        grandTotalContent: { flex: 1, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        grandTotalLabel: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
        grandTotalValue: { fontSize: 24, fontWeight: '900', color: '#FFF' },
        pdfContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.border },
        pdfTitle: { fontSize: 16, fontWeight: '800', color: c.text },
        pdfSub: { fontSize: 12, color: c.textSecondary, fontWeight: '600' }
    });
};
