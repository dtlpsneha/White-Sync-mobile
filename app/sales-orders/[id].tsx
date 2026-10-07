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

            {/* Back Button — absolute, overlaid on header */}
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/sales-orders')} style={localStyles.backButtonCircle}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>

            {currentStatus.toLowerCase().includes('draft') && (
                <TouchableOpacity onPress={() => router.push(`/sales-orders/create?edit_id=${order.name}`)} style={localStyles.editButtonCircle}>
                    <Ionicons name="create-outline" size={24} color="#FFF" />
                </TouchableOpacity>
            )}

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* Header block — scrolls with content */}
                <View style={[localStyles.headerBlock, { backgroundColor: statusColor }]}>
                    <View style={localStyles.headerContent}>
                        <View style={localStyles.statusPill}>
                            <Ionicons name="checkmark-circle" size={12} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={localStyles.statusPillText}>{currentStatus}</Text>
                        </View>
                        <Text style={localStyles.customerName}>{order.customer}</Text>
                        <Text style={localStyles.orderId}>{order.name}</Text>
                    </View>
                </View>

                {/* Overlapping body */}
                <View style={[localStyles.contentContainer, { marginTop: -50 }]}>
                    {/* Info Cards */}
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
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: '#00BFA515' }]}>
                                <Ionicons name="cube" size={18} color="#00BFA5" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={localStyles.sectionTitleText}>Order Items</Text>
                                <Text style={localStyles.sectionSubtitleText}>Detailed breakdown of products</Text>
                            </View>
                            <View style={localStyles.itemCountBadge}>
                                <Text style={localStyles.itemCountText}>{order.items.length}</Text>
                            </View>
                        </View>
                        {order.items.map((item, index) => (
                            <View key={index} style={localStyles.itemBox}>
                                <View style={localStyles.itemHeader}>
                                    <View style={localStyles.itemBadge}>
                                        <Text style={localStyles.itemBadgeText}>{String(index + 1).padStart(2, '0')}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={localStyles.itemName}>{item.item_name || item.item_code}</Text>
                                        <Text style={localStyles.itemCode}>{item.item_code}</Text>
                                    </View>
                                </View>
                                <View style={localStyles.itemFooter}>
                                    <View style={localStyles.footerColumn}>
                                        <Text style={localStyles.footerLabel}>QUANTITY</Text>
                                        <Text style={localStyles.footerValue}>{item.qty} Nos</Text>
                                    </View>
                                    <View style={localStyles.dividerLine} />
                                    <View style={localStyles.footerColumn}>
                                        <Text style={localStyles.footerLabel}>RATE</Text>
                                        <Text style={localStyles.footerValue}>₹{item.rate.toLocaleString()}</Text>
                                    </View>
                                    <View style={localStyles.dividerLine} />
                                    <View style={localStyles.footerColumn}>
                                        <Text style={localStyles.footerLabel}>TOTAL</Text>
                                        <Text style={[localStyles.footerValue, { color: statusColor }]}>₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Attachments Section */}
                    {order.attach || (order as any).attach_image ? (
                        <Animated.View entering={FadeInUp.delay(350).springify()} style={localStyles.sectionCard}>
                            <View style={localStyles.sectionHeader}>
                                <View style={[localStyles.iconContainer, { backgroundColor: '#6366F115' }]}>
                                    <Ionicons name="attach-outline" size={18} color="#6366F1" />
                                </View>
                                <View>
                                    <Text style={localStyles.sectionTitleText}>Attachments</Text>
                                    <Text style={localStyles.sectionSubtitleText}>Documents &amp; files</Text>
                                </View>
                            </View>
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

                    {/* Grand Total */}
                    <Animated.View entering={FadeInUp.delay(400).springify()} style={localStyles.grandTotalCard}>
                        <Svg height="120" width="100%" style={StyleSheet.absoluteFill}>
                            <Defs>
                                <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor={statusColor} stopOpacity="1" />
                                    <Stop offset="1" stopColor={`${statusColor}CC`} stopOpacity="1" />
                                </LinearGradient>
                            </Defs>
                            <Rect width="100%" height="100%" fill="url(#grad)" rx={32} />
                        </Svg>
                        <View style={localStyles.grandTotalContent}>
                            <View>
                                <Text style={localStyles.grandTotalLabel}>GRAND TOTAL</Text>
                                <Text style={localStyles.grandTotalValue}>₹{order.grand_total.toLocaleString()}</Text>
                            </View>
                            <Ionicons name="receipt" size={50} color="rgba(255,255,255,0.3)" />
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

const getLocalStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];
    const isDark = theme === 'dark';

    return StyleSheet.create({
        backButtonCircle: { position: 'absolute', top: 60, left: 20, zIndex: 11, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        editButtonCircle: { position: 'absolute', top: 60, right: 20, zIndex: 11, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        headerBlock: { paddingTop: 100, paddingBottom: 70, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, paddingHorizontal: 24, zIndex: 5 },
        headerContent: { marginTop: 10 },
        statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, marginBottom: 16, alignSelf: 'flex-start' },
        statusPillText: { color: '#FFF', fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
        customerName: { fontSize: 26, fontWeight: '900', color: '#FFF', marginBottom: 8, letterSpacing: -0.5 },
        orderId: { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '800' },
        contentContainer: { paddingHorizontal: 20, zIndex: 10 },
        infoRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
        infoCard: { flex: 1, backgroundColor: c.surface, borderRadius: 20, padding: 16, borderLeftWidth: 4, borderLeftColor: c.success, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 10, elevation: 3, borderTopWidth: isDark ? 1 : 0, borderRightWidth: isDark ? 1 : 0, borderBottomWidth: isDark ? 1 : 0, borderColor: c.border },
        infoLabel: { fontSize: 10, fontWeight: '800', color: c.textSecondary, marginTop: 8 },
        infoValue: { fontSize: 15, fontWeight: '900', color: c.text, marginTop: 2 },
        sectionCard: { backgroundColor: c.surface, borderRadius: 32, padding: 24, marginBottom: 24, borderWidth: isDark ? 1 : 0, borderColor: c.border, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: isDark ? 0.2 : 0.04, shadowRadius: 12, elevation: 4 },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
        iconContainer: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
        sectionTitleText: { fontSize: 18, fontWeight: '900', color: c.text },
        sectionSubtitleText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
        itemCountBadge: { backgroundColor: c.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 'auto' },
        itemCountText: { fontSize: 12, fontWeight: '800', color: c.textSecondary },
        itemBox: { backgroundColor: c.surfaceSecondary, borderRadius: 24, overflow: 'hidden', marginBottom: 16 },
        itemHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16 },
        itemBadge: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: c.border },
        itemBadgeText: { fontSize: 12, fontWeight: '900', color: c.textSecondary },
        itemName: { fontSize: 16, fontWeight: '900', color: c.text, marginBottom: 2 },
        itemCode: { fontSize: 12, color: c.textSecondary, fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: 0.5 },
        itemFooter: { flexDirection: 'row', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', padding: 12 },
        footerColumn: { flex: 1, alignItems: 'center' },
        footerLabel: { fontSize: 9, fontWeight: '800', color: c.textSecondary, marginBottom: 4 },
        footerValue: { fontSize: 14, fontWeight: '900', color: c.text },
        dividerLine: { width: 1, height: 20, backgroundColor: c.border, alignSelf: 'center' },
        imageContainer: { borderRadius: 20, overflow: 'hidden', height: 250, backgroundColor: c.surfaceSecondary },
        attachedImage: { width: '100%', height: '100%', resizeMode: 'contain' },
        grandTotalCard: { height: 120, borderRadius: 32, overflow: 'hidden', marginBottom: 20 },
        grandTotalContent: { flex: 1, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        grandTotalLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 4 },
        grandTotalValue: { fontSize: 36, fontWeight: '900', color: '#FFF' },
        pdfContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surfaceSecondary, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.border },
        pdfTitle: { fontSize: 16, fontWeight: '800', color: c.text },
        pdfSub: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
        backButton: { position: 'absolute', top: 50, left: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        editButton: { position: 'absolute', top: 50, right: 20, zIndex: 10, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
        statusPill_legacy: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginBottom: 12 },
        statusText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase' as const },
        sectionTitle: { fontSize: 18, fontWeight: '900', color: c.text, marginBottom: 16 },
        itemSubLabel: { fontSize: 10, fontWeight: '700', color: c.textSecondary },
        itemSubValue: { fontSize: 14, fontWeight: '800', color: c.text },
    });
};
