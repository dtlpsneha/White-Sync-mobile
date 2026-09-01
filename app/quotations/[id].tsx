import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { apiPost } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { Extrapolation, FadeInDown, FadeInUp, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiUrl } from '@/constants/config';

interface QuotationDetail {
    name: string;
    customer_name: string;
    status: string;
    transaction_date: string;
    grand_total: number;
    workflow_state?: string;
    valid_till?: string;
    transaction_type?: string;
    price_list?: string;
    sales_executive?: string;
    brand?: string;
    against_purchase_invoice?: string;
    purchase_rate?: number;
    item_margin?: number;
    share_image?: string;
    company?: string;
    total_taxes?: number;
    payment_schedule?: Array<{
        payment_term: string;
        due_date: string;
        payment_amount: number;
        invoice_portion: number;
    }>;
    items: Array<{
        item_code: string;
        item_name?: string;
        qty: number;
        rate: number;
        amount: number;
        against_purchase_invoice?: string;
        purchase_rate?: number;
        item_margin?: number;
    }>;
}

export default function QuotationDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();
    const localStyles = useMemo(() => getLocalStyles(theme), [theme]);

    const [quote, setQuote] = useState<QuotationDetail | null>(null);
    const [loading, setLoading] = useState(true);

    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const normalizedId = Array.isArray(id) ? id[0] : id;

    useEffect(() => {
        if (normalizedId) {
            fetchQuotationDetails(normalizedId);
        }
    }, [normalizedId]);

    const fetchQuotationDetails = async (currentId: string) => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiPost(apiUrl('/api/method/get_quote_resource'), { name: currentId }, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message && data.message.success && Array.isArray(data.message.data)) {
                setQuote(data.message.data[0]);
            }
        } catch (error) {
            console.error('Error fetching quotation details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (action: string) => {
        if (!quote) return;

        const confirmMsg = action === 'Approve'
            ? 'Are you sure you want to approve this quotation?'
            : 'Are you sure you want to reject this quotation?';

        const performAction = async () => {
            try {
                setLoading(true);
                const cookies = await SecureStore.getItemAsync('session_cookies');

                // standard Frappe apply_action endpoint
                const targetState = action === 'Approve' ? 'Approved' : 'Review';
                const res = await apiPost(apiUrl('/api/method/approve_quotation'), {
                    name: quote.name,
                    workflow_state: targetState
                }, cookies);

                const data: any = res.data;
                const isSuccess = res.ok && data && (data.status === 'success' || (data.message && data.message.success === true));

                if (isSuccess) {
                    Alert.alert('Success', `Quotation ${action}ed successfully.`);
                    fetchQuotationDetails(quote.name); // Refresh
                } else {
                    console.warn(`[handleAction] Failure Response for ${action}:`, data);

                    // Try to extract Frappe server messages or exception
                    let errorMsg = `Failed to ${action.toLowerCase()} quotation.`;
                    if (data && data.message && data.message.error) {
                        errorMsg = data.message.error;
                    } else if (data && data._server_messages) {
                        try {
                            const msgs = JSON.parse(data._server_messages);
                            errorMsg = msgs.map((m: any) => JSON.parse(m).message).join('\n');
                        } catch (e) { }
                    } else if (data && data.exception) {
                        errorMsg = data.exception.split('\n')[0];
                    }

                    Alert.alert('Action Failed', errorMsg);
                }
            } catch (e) {
                console.error(e);
                Alert.alert('Error', 'An unexpected network error occurred.');
            } finally {
                setLoading(false);
            }
        };

        Alert.alert(
            `${action} Quotation`,
            confirmMsg,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Yes, Proceed', onPress: performAction, style: action === 'Approve' ? 'default' : 'destructive' }
            ]
        );
    };

    const getStatusColor = (status: string) => {
        const lower = (status || '').toLowerCase();

        if (lower.includes('approved') || lower.includes('ordered') || lower.includes('submit')) return '#00BFA5'; // Green
        if (lower.includes('pending')) return '#3B82F6'; // Blue
        if (lower.includes('review') || lower.includes('open')) return '#F59E0B'; // Orange
        if (lower.includes('reopen') || lower.includes('resubmit')) return '#1E3A8A'; // Dark Blue
        if (lower.includes('cancel') || lower.includes('reject') || lower.includes('decline')) return '#EF4444'; // Red
        if (lower.includes('draft')) return '#94A3B8'; // Grey

        return '#94A3B8'; // Default Grey
    };

    const headerTitleAnim = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [20, 100], [1, 0], Extrapolation.CLAMP),
        transform: [{ translateY: interpolate(scrollY.value, [0, 100], [0, 20], Extrapolation.CLAMP) }]
    }));

    const toolbarAnim = useAnimatedStyle(() => ({
        opacity: interpolate(scrollY.value, [100, 160], [0, 1], Extrapolation.CLAMP)
    }));

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!quote) {
        return (
            <View style={styles.center}>
                <Text style={{ color: colors.textSecondary }}>Quotation not found</Text>
            </View>
        );
    }

    const currentStatus = quote.workflow_state || quote.status;
    const statusColor = getStatusColor(currentStatus);

    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#F8FAFC' }}>
            <StatusBar style="light" />

            {/* Compact Floating Fixed Toolbar Header */}
            <Animated.View style={[localStyles.fixedHeader, toolbarAnim, { backgroundColor: statusColor }]}>
                <View style={localStyles.toolbarContainer}>
                    <Text style={localStyles.toolbarTitle} numberOfLines={1}>{quote.customer_name}</Text>
                </View>
            </Animated.View>

            {/* Back & Print Buttons */}
            <TouchableOpacity onPress={() => router.back()} style={localStyles.backButtonCircle}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>

            <TouchableOpacity
                style={localStyles.printButtonCircle}
                onPress={() => router.push(`/quotations/print?id=${quote.name}`)}
            >
                <Ionicons name="print-outline" size={24} color="#FFF" />
            </TouchableOpacity>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                {/* Natural Header Block (Scrolls with page) */}
                <View style={[localStyles.headerBlock, { backgroundColor: statusColor }]}>
                    <Animated.View style={[localStyles.headerMainInfo, headerTitleAnim]}>
                        <View style={localStyles.headerBadgeLeft}>
                            <Ionicons name="checkmark-circle" size={12} color="#FFF" style={{ marginRight: 4 }} />
                            <Text style={localStyles.headerBadgeText}>{currentStatus}</Text>
                        </View>
                        <Text style={localStyles.headerCustomerName} numberOfLines={2}>{quote.customer_name || 'Customer Name'}</Text>
                        <Text style={localStyles.headerId}>{quote.company || 'White & Co.'}</Text>
                    </Animated.View>
                </View>

                {/* Overlapping Body Container */}
                <View style={[localStyles.contentContainer, { marginTop: -50 }]}>
                    {/* Order Number Card */}
                    <Animated.View entering={FadeInUp.delay(50).springify()} style={localStyles.orderNumberCard}>
                        <View style={localStyles.cardAccent} />
                        <View style={{ padding: 16 }}>
                            <Text style={localStyles.orderNumberLabel}>ORDER NUMBER</Text>
                            <Text style={localStyles.orderNumberValue}>{quote.name}</Text>
                        </View>
                    </Animated.View>

                    {/* Information cards */}
                    <View style={localStyles.infoRow}>
                        <Animated.View entering={FadeInDown.delay(100).springify()} style={localStyles.infoCard}>
                            <Ionicons name="calendar-outline" size={16} color={statusColor} />
                            <Text style={localStyles.infoLabel}>DATE</Text>
                            <Text style={localStyles.infoValue}>{quote.transaction_date}</Text>
                        </Animated.View>
                        <Animated.View entering={FadeInDown.delay(200).springify()} style={localStyles.infoCard}>
                            <Ionicons name="time-outline" size={16} color={statusColor} />
                            <Text style={localStyles.infoLabel}>VALID TILL</Text>
                            <Text style={localStyles.infoValue}>{quote.valid_till || '---'}</Text>
                        </Animated.View>
                    </View>

                    {/* Basic Information Section */}
                    <Animated.View entering={FadeInUp.delay(300).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: statusColor + '15' }]}>
                                <Ionicons name="information-circle" size={18} color={statusColor} />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Basic Information</Text>
                                <Text style={localStyles.sectionSubtitleText}>Primary quotation details</Text>
                            </View>
                        </View>

                        <View style={localStyles.gridContainer}>
                            <View style={localStyles.gridColumn}>
                                <View style={localStyles.gridItem}>
                                    <View>
                                        <Text style={localStyles.gridLabel}>TYPE</Text>
                                        <Text style={localStyles.gridValue}>{quote.transaction_type || 'Sales'}</Text>
                                    </View>
                                </View>
                                <View style={localStyles.gridItem}>
                                    <View>
                                        <Text style={localStyles.gridLabel}>PRICE LIST</Text>
                                        <Text style={localStyles.gridValue} numberOfLines={1}>{quote.price_list || 'Standard'}</Text>
                                    </View>
                                </View>
                            </View>

                            <View style={localStyles.gridColumn}>
                                <View style={localStyles.gridItem}>
                                    <View>
                                        <Text style={localStyles.gridLabel}>EXECUTIVE</Text>
                                        <Text style={localStyles.gridValue}>{quote.sales_executive || '---'}</Text>
                                    </View>
                                </View>
                                <View style={localStyles.gridItem}>
                                    <View>
                                        <Text style={localStyles.gridLabel}>BRAND</Text>
                                        <Text style={localStyles.gridValue}>{quote.brand || '---'}</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Items Section */}
                    <Animated.View entering={FadeInUp.delay(400).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: '#00BFA515' }]}>
                                <Ionicons name="cube" size={18} color="#00BFA5" />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Order Items</Text>
                                <Text style={localStyles.sectionSubtitleText}>Detailed breakdown of products</Text>
                            </View>
                            <View style={localStyles.itemCountBadge}>
                                <Text style={localStyles.itemCountText}>{quote.items.length}</Text>
                            </View>
                        </View>
                        {quote.items.map((item, index) => (
                            <View key={index} style={localStyles.itemBoxNew}>
                                <View style={localStyles.itemHeaderNew}>
                                    <View style={localStyles.itemBadgeNew}>
                                        <Text style={localStyles.itemBadgeTextNew}>{String(index + 1).padStart(2, '0')}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={localStyles.itemNameNew}>{item.item_name || item.item_code}</Text>
                                        <Text style={localStyles.itemCodeNew}>{item.item_code}  •  <Text style={{ color: '#6366F1' }}>{quote.brand || 'PRECITEX'}</Text></Text>
                                    </View>
                                </View>
                                <View style={localStyles.itemFooterNew}>
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
                                        <Text style={[localStyles.footerValue, { color: '#0288D1' }]}>₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                                {/* Margin Details dynamically moved to Child Table */}
                                <View style={localStyles.marginInfoChildRow}>
                                    <View style={localStyles.marginSpec}>
                                        <Text style={localStyles.marginSpecLabel}>PI NO</Text>
                                        <Text style={localStyles.marginSpecValue}>{item.against_purchase_invoice || quote.against_purchase_invoice || '---'}</Text>
                                    </View>
                                    <View style={localStyles.marginSpec}>
                                        <Text style={localStyles.marginSpecLabel}>PURCH RATE</Text>
                                        <Text style={localStyles.marginSpecValue}>₹{((item.purchase_rate) || quote.purchase_rate || 0).toLocaleString()}</Text>
                                    </View>
                                    <View style={[localStyles.marginSpec, { alignItems: 'flex-end', borderRightWidth: 0 }]}>
                                        <Text style={localStyles.marginSpecLabel}>MARGIN</Text>
                                        <Text style={[localStyles.marginSpecValue, { color: '#059669' }]}>%{((item.item_margin) || quote.item_margin || 0).toLocaleString()}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Summary Section */}
                    <Animated.View entering={FadeInUp.delay(500).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: '#6366F115' }]}>
                                <Ionicons name="wallet-outline" size={18} color="#6366F1" />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Financial Summary</Text>
                                <Text style={localStyles.sectionSubtitleText}>Costs and adjustments</Text>
                            </View>
                        </View>

                        <View style={localStyles.summaryRow}>
                            <Text style={localStyles.summaryLabel}>Total Quantity</Text>
                            <Text style={localStyles.summaryValue}>{quote.items.reduce((sum, i) => sum + i.qty, 0)} Nos</Text>
                        </View>
                        <View style={localStyles.summaryRow}>
                            <Text style={localStyles.summaryLabel}>Net Total</Text>
                            <Text style={localStyles.summaryValue}>₹{quote.grand_total.toLocaleString()}</Text>
                        </View>
                        <View style={localStyles.summaryRow}>
                            <Text style={localStyles.summaryLabel}>Total Taxes</Text>
                            <Text style={localStyles.summaryValue}>₹{(quote.total_taxes || 2549.6).toLocaleString()}</Text>
                        </View>
                    </Animated.View>

                    {/* Payment Schedule Section */}
                    <Animated.View entering={FadeInUp.delay(600).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: '#00BFA515' }]}>
                                <Ionicons name="calendar" size={18} color="#00BFA5" />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Payment Schedule</Text>
                                <Text style={localStyles.sectionSubtitleText}>Terms and milestones</Text>
                            </View>
                        </View>

                        {(quote.payment_schedule || [{ payment_term: 'Milestone 1', due_date: quote.transaction_date, payment_amount: quote.grand_total, invoice_portion: 100 }]).map((p, i) => (
                            <View key={i} style={localStyles.milestoneItem}>
                                <View style={localStyles.milestoneHeader}>
                                    <Text style={localStyles.milestoneTitle}>{p.payment_term}</Text>
                                    <View style={localStyles.portionBadge}>
                                        <Text style={localStyles.portionText}>{p.invoice_portion}%</Text>
                                    </View>
                                </View>
                                <View style={localStyles.milestoneDetails}>
                                    <View>
                                        <Text style={localStyles.milestoneLabel}>DUE DATE</Text>
                                        <Text style={localStyles.milestoneValue}>{p.due_date}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={localStyles.milestoneLabel}>AMOUNT</Text>
                                        <Text style={localStyles.milestoneValueBlue}>₹{p.payment_amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                                <View style={localStyles.milestoneFooter}>
                                    <Text style={localStyles.milestoneStatus}>Outstanding</Text>
                                    <Text style={localStyles.milestoneStatusAmount}>₹{p.payment_amount.toLocaleString()}</Text>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Summary Card */}
                    <Animated.View entering={FadeInUp.delay(700).springify()} style={localStyles.grandTotalCard}>
                        <Svg height="120" width="100%" style={StyleSheet.absoluteFill}>
                            <Defs>
                                <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                                    <Stop offset="0" stopColor="#818CF8" stopOpacity="1" />
                                    <Stop offset="1" stopColor="#6366F1" stopOpacity="1" />
                                </LinearGradient>
                            </Defs>
                            <Rect width="100%" height="100%" fill="url(#grad)" rx={32} />
                        </Svg>
                        <View style={localStyles.grandTotalContent}>
                            <View>
                                <Text style={localStyles.grandTotalLabel}>GRAND TOTAL</Text>
                                <Text style={localStyles.grandTotalValue}>₹{quote.grand_total.toLocaleString()}</Text>
                            </View>
                            <Ionicons name="receipt" size={50} color="rgba(255,255,255,0.3)" />
                        </View>
                    </Animated.View>
                </View>
            </Animated.ScrollView>

            {/* Action Buttons Footer */}
            {(currentStatus.toUpperCase().includes('PENDING') || currentStatus.toUpperCase().includes('REVIEW')) && (
                <View style={[
                    localStyles.actionFooter,
                    {
                        backgroundColor: isDark ? colors.surface : '#FFF',
                        // Use the device's real bottom inset. A hardcoded 20px
                        // was not enough on Vivo/iQOO (OriginOS/FuntouchOS),
                        // whose navigation bar is taller, so the Approve and
                        // Reject buttons were clipped underneath it.
                        paddingBottom: Math.max(insets.bottom, 16) + 8,
                    },
                ]}>
                    <TouchableOpacity
                        style={[localStyles.actionButton, { backgroundColor: '#EF4444' }]}
                        onPress={() => handleAction('Reject')}
                    >
                        <Ionicons name="close-circle" size={20} color="#FFF" />
                        <Text style={localStyles.actionButtonText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[localStyles.actionButton, { backgroundColor: '#00BFA5' }]}
                        onPress={() => handleAction('Approve')}
                    >
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                        <Text style={localStyles.actionButtonText}>Approve</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

/**
 * Theme-aware styles.
 *
 * This sheet used to be a static StyleSheet.create with light-mode colours
 * baked in (white cards, #1E293B text, #F1F5F9 borders). In dark mode the
 * screen background went dark but every card stayed white, so the page was a
 * patchwork of light panels — and some text ended up dark-on-dark.
 */
const getLocalStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];
    const isDark = theme === 'dark';

    // Tinted accent surfaces need to be translucent in dark mode; the solid
    // pastel fills (#ECFDF5, #DBEAFE, #FFF7ED) glow against a black background.
    const tint = (light: string, darkRgba: string) => (isDark ? darkRgba : light);

    return StyleSheet.create({
    fixedHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 115,
        zIndex: 10,
        paddingTop: 60,
    },
    headerBlock: {
        position: 'relative',
        paddingTop: 100,
        paddingBottom: 70,
        borderBottomLeftRadius: 40,
        borderBottomRightRadius: 40,
        paddingHorizontal: 24,
        zIndex: 5,
    },
    backButtonCircle: {
        position: 'absolute',
        top: 60,

        left: 20,
        zIndex: 11,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    printButtonCircle: {
        position: 'absolute',
        top: 60,
        right: 20,
        zIndex: 11,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    headerTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFF',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    headerMainInfo: {
        marginTop: 10,
        alignItems: 'flex-start',
    },
    headerBadgeLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    headerBadgeText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    headerCustomerName: {
        fontSize: 26,
        fontWeight: '900',
        color: '#FFF',
        marginBottom: 8,
        textAlign: 'left',
        letterSpacing: -0.5,
    },
    headerId: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '800',
        textAlign: 'left',
    },
    // Original styles
    orderNumberCard: { backgroundColor: c.surface, borderRadius: 24, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.4 : 0.08, shadowRadius: 20, elevation: 5, borderWidth: isDark ? 1 : 0, borderColor: c.border },
    cardAccent: { height: 4, backgroundColor: c.surfaceVariant, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    orderNumberLabel: { fontSize: 11, fontWeight: '800', color: c.textSecondary, marginBottom: 4, letterSpacing: 0.5 },
    orderNumberValue: { fontSize: 18, fontWeight: '900', color: c.text, flexShrink: 1 },
    contentContainer: { paddingHorizontal: 20, zIndex: 10 },
    infoRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    infoCard: { flex: 1, backgroundColor: c.surface, borderRadius: 20, padding: 16, borderLeftWidth: 4, borderLeftColor: c.success, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.05, shadowRadius: 10, elevation: 3, borderTopWidth: isDark ? 1 : 0, borderRightWidth: isDark ? 1 : 0, borderBottomWidth: isDark ? 1 : 0, borderColor: c.border },
    infoLabel: { fontSize: 10, fontWeight: '800', color: c.textSecondary, marginTop: 8 },
    infoValue: { fontSize: 16, fontWeight: '900', color: c.text, marginTop: 2 },
    sectionCard: { backgroundColor: c.surface, borderRadius: 32, padding: 24, marginBottom: 24, borderWidth: isDark ? 1 : 0, borderColor: c.border },
    grandTotalCard: { height: 120, borderRadius: 32, overflow: 'hidden', marginBottom: 20 },
    grandTotalContent: { flex: 1, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    grandTotalLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: 4 },
    grandTotalValue: { fontSize: 36, fontWeight: '900', color: '#FFF' },

    // New Styles
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 12 },
    iconContainer: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    sectionTitleText: { fontSize: 18, fontWeight: '900', color: c.text },
    sectionSubtitleText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
    gridContainer: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    gridColumn: { flex: 1, gap: 12 },
    gridItem: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 12, borderLeftWidth: 3, borderLeftColor: c.success, flex: 1, minWidth: '45%' },
    gridLabel: { fontSize: 9, fontWeight: '800', color: c.textSecondary, letterSpacing: 0.5, marginBottom: 4 },
    gridValue: { fontSize: 14, fontWeight: '900', color: c.text },
    itemCountBadge: { backgroundColor: c.surfaceSecondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginLeft: 'auto' },
    itemCountText: { fontSize: 12, fontWeight: '800', color: c.textSecondary },
    itemBoxNew: { backgroundColor: c.surface, borderRadius: 24, overflow: 'hidden', marginBottom: 20, borderWidth: 1, borderColor: c.border },
    itemHeaderNew: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16 },
    itemBadgeNew: { width: 32, height: 32, borderRadius: 10, backgroundColor: c.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
    itemBadgeTextNew: { fontSize: 12, fontWeight: '900', color: c.textSecondary },
    itemNameNew: { fontSize: 16, fontWeight: '900', color: c.text, marginBottom: 2 },
    itemCodeNew: { fontSize: 12, color: c.textSecondary, fontWeight: '800', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
    itemFooterNew: { flexDirection: 'row', backgroundColor: c.surfaceSecondary, padding: 12 },
    marginInfoChildRow: {
        flexDirection: 'row',
        backgroundColor: tint('#ECFDF5', 'rgba(16, 185, 129, 0.12)'),
        padding: 12,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        borderTopWidth: 1,
        borderTopColor: tint('#D1FAE5', 'rgba(16, 185, 129, 0.25)'),
    },
    marginSpec: {
        flex: 1,
        borderRightWidth: 1,
        borderRightColor: tint('#D1FAE5', 'rgba(16, 185, 129, 0.25)'),
        paddingHorizontal: 6,
    },
    marginSpecLabel: {
        fontSize: 9,
        fontWeight: '800',
        color: isDark ? '#34D399' : '#059669',
        marginBottom: 2,
    },
    marginSpecValue: {
        fontSize: 13,
        fontWeight: '900',
        color: isDark ? '#6EE7B7' : '#047857',
    },
    footerColumn: { flex: 1, alignItems: 'center' },
    footerLabel: { fontSize: 9, fontWeight: '800', color: c.textSecondary, marginBottom: 4 },
    footerValue: { fontSize: 14, fontWeight: '900', color: c.text },
    dividerLine: { width: 1, height: 20, backgroundColor: c.border, alignSelf: 'center' },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    summaryLabel: { fontSize: 14, fontWeight: '800', color: c.textSecondary },
    summaryValue: { fontSize: 16, fontWeight: '900', color: c.text },
    milestoneItem: { backgroundColor: c.surfaceSecondary, borderRadius: 24, padding: 16, marginBottom: 16 },
    milestoneHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    milestoneTitle: { fontSize: 14, fontWeight: '800', color: c.text },
    portionBadge: { backgroundColor: tint('#DBEAFE', 'rgba(59, 130, 246, 0.18)'), paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    portionText: { fontSize: 11, fontWeight: '800', color: isDark ? '#60A5FA' : '#3B82F6' },
    milestoneDetails: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    milestoneLabel: { fontSize: 9, fontWeight: '800', color: c.textSecondary, marginBottom: 2 },
    milestoneValue: { fontSize: 14, fontWeight: '900', color: c.text },
    milestoneValueBlue: { fontSize: 16, fontWeight: '900', color: isDark ? '#60A5FA' : '#3B82F6' },
    milestoneFooter: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
    milestoneStatus: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
    milestoneStatusAmount: { fontSize: 11, fontWeight: '800', color: '#EF4444' },

    // Animation & Toolbar Styles
    toolbarContainer: {
        position: 'absolute',
        bottom: 12,
        left: 60,
        right: 60,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8
    },
    toolbarTitle: { fontSize: 16, fontWeight: '900', color: '#FFF' },
    toolbarStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
    gridItemOrange: { backgroundColor: tint('#FFF7ED', 'rgba(249, 115, 22, 0.14)'), borderRadius: 16, padding: 12, borderLeftWidth: 3, borderLeftColor: '#F97316', flex: 1 },
    marginBadge: { backgroundColor: tint('#D1FAE5', 'rgba(16, 185, 129, 0.18)'), paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    marginBadgeText: { fontSize: 9, fontWeight: '900', color: isDark ? '#34D399' : '#059669' },
    actionFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingTop: 16,
        // paddingBottom is applied inline from the safe-area inset.
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: c.border,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: isDark ? 0.5 : 0.1,
        shadowRadius: 10
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        height: 54,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    actionButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '900',
    }
    });
};
