import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Gradients, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiPost } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
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
    executive_person?: string;
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
    const insets = useSafeAreaInsets();
    const localStyles = useMemo(() => getLocalStyles(theme), [theme]);

    const [quote, setQuote] = useState<QuotationDetail | null>(null);
    const [loading, setLoading] = useState(true);

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

        if (lower.includes('approved') || lower.includes('ordered') || lower.includes('submit')) return colors.success; // Green
        if (lower.includes('pending')) return colors.info; // Blue
        if (lower.includes('review') || lower.includes('open')) return colors.warning; // Orange
        if (lower.includes('reopen') || lower.includes('resubmit')) return colors.primaryVariant; // Dark Blue
        if (lower.includes('cancel') || lower.includes('reject') || lower.includes('decline')) return colors.danger; // Red
        if (lower.includes('draft')) return '#94A3B8'; // Grey

        return '#94A3B8'; // Default Grey
    };

    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!quote) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textSecondary }}>Quotation not found</Text>
            </View>
        );
    }

    const currentStatus = quote.workflow_state || quote.status;
    const statusColor = getStatusColor(currentStatus);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScreenHeader
                title={quote.customer_name || 'Customer Name'}
                onBack={goBack}
                rightIcon="print-outline"
                onRightPress={() => router.push(`/quotations/print?id=${quote.name}`)}
            >
                <View style={localStyles.headerInfoRow}>
                    <View style={localStyles.headerBadgeLeft}>
                        <View style={[localStyles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={localStyles.headerBadgeText}>{currentStatus}</Text>
                    </View>
                    <Text style={localStyles.headerId} numberOfLines={1}>{quote.company || 'White & Co.'}</Text>
                </View>
            </ScreenHeader>

            <ScrollView
                contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
                showsVerticalScrollIndicator={false}
            >
                <View style={[localStyles.contentContainer, { marginTop: 16 }]}>
                    {/* Order info card: number + date + valid till in one card */}
                    <Animated.View entering={FadeInUp.delay(50).springify()} style={localStyles.orderInfoCard}>
                        <View style={localStyles.orderInfoTop}>
                            <View style={{ flex: 1 }}>
                                <Text style={localStyles.orderNumberLabel}>ORDER NUMBER</Text>
                                <Text style={localStyles.orderNumberValue} numberOfLines={1}>{quote.name}</Text>
                            </View>
                        </View>
                        <View style={localStyles.orderInfoBottom}>
                            <View style={{ flex: 1 }}>
                                <Text style={localStyles.orderInfoLabel}>DATE</Text>
                                <Text style={localStyles.orderInfoValue}>{quote.transaction_date}</Text>
                            </View>
                            <View style={localStyles.orderInfoDivider} />
                            <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                <Text style={localStyles.orderInfoLabel}>VALID TILL</Text>
                                <Text style={localStyles.orderInfoValue}>{quote.valid_till || '---'}</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Basic Information */}
                    <Animated.View entering={FadeInUp.delay(200).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: colors.primarySoft }]}>
                                <Ionicons name="information-circle" size={18} color={colors.primary} />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Basic Information</Text>
                                <Text style={localStyles.sectionSubtitleText}>Primary quotation details</Text>
                            </View>
                        </View>
                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                            {([
                                { label: 'Type', value: quote.transaction_type || 'Sales' },
                                { label: 'Price List', value: quote.price_list || 'Standard' },
                                { label: 'Brand', value: quote.brand || '---' },
                                { label: 'Company', value: quote.company || 'White & Co.' },
                            ] as { label: string; value: string }[]).map((row, i) => (
                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>{row.label}</Text>
                                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, maxWidth: '55%', textAlign: 'right' }} numberOfLines={1}>{row.value}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>

                    {/* Items Section */}
                    <Animated.View entering={FadeInUp.delay(300).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: colors.primarySoft }]}>
                                <Ionicons name="cube" size={18} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={localStyles.sectionTitleText}>Order Items</Text>
                                <Text style={localStyles.sectionSubtitleText}>Detailed breakdown of products</Text>
                            </View>
                            <View style={localStyles.itemCountBadge}>
                                <Text style={localStyles.itemCountText}>{quote.items.length}</Text>
                            </View>
                        </View>
                        {quote.items.map((item, index) => (
                            <View key={index} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: Radius.md, marginBottom: 12, overflow: 'hidden', backgroundColor: colors.surface }}>
                                {/* Name + number */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.surfaceSecondary, justifyContent: 'center', alignItems: 'center' }}>
                                        <Text style={{ fontSize: 11, fontWeight: '900', color: colors.textSecondary }}>{String(index + 1).padStart(2, '0')}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.text, marginBottom: 2 }}>{item.item_name || item.item_code}</Text>
                                        <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{item.item_code}</Text>
                                    </View>
                                </View>
                                {/* Divider */}
                                <View style={{ height: 1, backgroundColor: colors.border }} />
                                {/* QTY / RATE / TOTAL */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
                                    <View style={{ flex: 1, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 4 }}>QUANTITY</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.text }}>{item.qty} Nos</Text>
                                    </View>
                                    <View style={{ width: 1, height: 32, backgroundColor: colors.border }} />
                                    <View style={{ flex: 1, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 4 }}>RATE</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.text }}>₹{item.rate.toLocaleString()}</Text>
                                    </View>
                                    <View style={{ width: 1, height: 32, backgroundColor: colors.border }} />
                                    <View style={{ flex: 1, alignItems: 'center' }}>
                                        <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 4 }}>TOTAL</Text>
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary }}>₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                                {/* Divider */}
                                <View style={{ height: 1, backgroundColor: colors.border }} />
                                {/* PI / Purch Rate / Margin */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 6 }}>
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary }}>PI</Text>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text, flex: 1 }} numberOfLines={1}>{item.against_purchase_invoice || quote.against_purchase_invoice || '---'}</Text>
                                    <View style={{ width: 1, height: 12, backgroundColor: colors.border }} />
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary }}>PURCH</Text>
                                    <Text style={{ fontSize: 11, fontWeight: '700', color: colors.text }}>₹{(item.purchase_rate || quote.purchase_rate || 0).toLocaleString()}</Text>
                                    <View style={{ width: 1, height: 12, backgroundColor: colors.border }} />
                                    <Text style={{ fontSize: 9, fontWeight: '800', color: colors.textSecondary }}>MARGIN</Text>
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.success }}>{(item.item_margin || quote.item_margin || 0)}%</Text>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Financial Summary */}
                    <Animated.View entering={FadeInUp.delay(400).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: colors.primarySoft }]}>
                                <Ionicons name="wallet-outline" size={18} color={colors.primary} />
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

                    {/* Payment Schedule */}
                    <Animated.View entering={FadeInUp.delay(500).springify()} style={localStyles.sectionCard}>
                        <View style={localStyles.sectionHeader}>
                            <View style={[localStyles.iconContainer, { backgroundColor: colors.primarySoft }]}>
                                <Ionicons name="calendar" size={18} color={colors.primary} />
                            </View>
                            <View>
                                <Text style={localStyles.sectionTitleText}>Payment Schedule</Text>
                                <Text style={localStyles.sectionSubtitleText}>Terms and milestones</Text>
                            </View>
                        </View>
                        <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                            {(quote.payment_schedule || [{ payment_term: 'Milestone 1', due_date: quote.transaction_date, payment_amount: quote.grand_total, invoice_portion: 100 }]).map((p, i) => (
                                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginBottom: 3 }}>{p.payment_term}</Text>
                                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>Due: {p.due_date}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: colors.primary, marginBottom: 4 }}>₹{p.payment_amount.toLocaleString()}</Text>
                                        <View style={{ backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.sm }}>
                                            <Text style={{ fontSize: 10, fontWeight: '800', color: colors.primary }}>{p.invoice_portion}%</Text>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </Animated.View>

                    {/* Summary Card */}
                    <Animated.View entering={FadeInUp.delay(700).springify()} style={localStyles.grandTotalCard}>
                        <LinearGradient
                            colors={Gradients.brand}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={localStyles.grandTotalContent}>
                            <View>
                                <Text style={localStyles.grandTotalLabel}>GRAND TOTAL</Text>
                                <Text style={localStyles.grandTotalValue}>₹{quote.grand_total.toLocaleString()}</Text>
                            </View>
                            <Ionicons name="receipt" size={50} color="rgba(255,255,255,0.3)" />
                        </View>
                    </Animated.View>
                </View>
            </ScrollView>

            {/* Action Buttons Footer */}
            {(currentStatus.toUpperCase().includes('PENDING') || currentStatus.toUpperCase().includes('REVIEW')) && (
                <View style={[
                    localStyles.actionFooter,
                    {
                        backgroundColor: colors.surface,
                        // Use the device's real bottom inset. A hardcoded 20px
                        // was not enough on Vivo/iQOO (OriginOS/FuntouchOS),
                        // whose navigation bar is taller, so the Approve and
                        // Reject buttons were clipped underneath it.
                        paddingBottom: Math.max(insets.bottom, 16) + 8,
                    },
                ]}>
                    <TouchableOpacity
                        style={[localStyles.actionButton, { backgroundColor: colors.danger }]}
                        onPress={() => handleAction('Reject')}
                    >
                        <Ionicons name="close-circle" size={20} color="#FFF" />
                        <Text style={localStyles.actionButtonText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[localStyles.actionButton, { backgroundColor: colors.success }]}
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


/** Theme-aware styles built from the shared design tokens. */
const getLocalStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];
    const isDark = theme === 'dark';

    return StyleSheet.create({
        headerInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
        headerBadgeLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.2)',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: Radius.pill,
        },
        statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6, borderWidth: 1, borderColor: '#FFF' },
        headerBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
        headerId: { flexShrink: 1, fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
        // Order info card
        orderInfoCard: { backgroundColor: c.surface, borderRadius: Radius.lg, marginBottom: 16, padding: 18, borderWidth: 1, borderColor: c.border, ...Shadow.card(theme) },
        orderInfoTop: { marginBottom: 14 },
        orderNumberLabel: { fontSize: 10, fontWeight: '800', color: c.textSecondary, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' as const },
        orderNumberValue: { fontSize: 17, fontWeight: '900', color: c.text },
        orderInfoBottom: { flexDirection: 'row', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border },
        orderInfoLabel: { fontSize: 10, fontWeight: '700', color: c.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.4, marginBottom: 3 },
        orderInfoValue: { fontSize: 13, fontWeight: '800', color: c.text },
        orderInfoDivider: { width: 1, height: 32, backgroundColor: c.border, marginHorizontal: 16 },
        contentContainer: { paddingHorizontal: 16 },
        sectionCard: { backgroundColor: c.surface, borderRadius: Radius.lg, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: c.border, ...Shadow.card(theme) },
        grandTotalCard: { height: 120, borderRadius: Radius.lg, overflow: 'hidden', marginBottom: 20, ...Shadow.raised(theme) },
        grandTotalContent: { flex: 1, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        grandTotalLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', marginBottom: 4 },
        grandTotalValue: { fontSize: 36, fontWeight: '900', color: '#FFF' },
        sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 12 },
        iconContainer: { width: 36, height: 36, borderRadius: Radius.sm, justifyContent: 'center', alignItems: 'center' },
        sectionTitleText: { fontSize: 16, fontWeight: '900', color: c.text },
        sectionSubtitleText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
        itemCountBadge: { backgroundColor: c.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.sm, marginLeft: 'auto' },
        itemCountText: { fontSize: 12, fontWeight: '800', color: c.primary },
        summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
        summaryLabel: { fontSize: 14, fontWeight: '800', color: c.textSecondary },
        summaryValue: { fontSize: 16, fontWeight: '900', color: c.text },
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
            shadowColor: isDark ? '#000' : '#4338CA',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: isDark ? 0.5 : 0.1,
            shadowRadius: 10
        },
        actionButton: {
            flex: 1,
            flexDirection: 'row',
            height: 54,
            borderRadius: Radius.md,
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
