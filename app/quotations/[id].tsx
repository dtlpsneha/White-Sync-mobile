import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandStats, SectionCard, StatusPill } from '@/components/ui/Midnight';
import { quoteStatusColor } from '@/components/QuotationList';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiPost } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { enterSection } from '@/constants/motion';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-28 -> 28 Nov 2026. Anything else is shown as it came. */
function niceDate(d?: string): string {
    if (!d) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : d;
}

const rupees = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function QuotationDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    const st = useMemo(() => getStyles(theme), [theme]);

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

    const goBack = () => (router.canGoBack() ? router.back() : router.replace('/quotations'));

    if (loading) {
        return (
            <View style={[st.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!quote) {
        return (
            <View style={[st.center, { backgroundColor: colors.background }]}>
                <Text style={{ color: colors.textSecondary }}>Quotation not found</Text>
            </View>
        );
    }

    const currentStatus = quote.workflow_state || quote.status || 'Draft';
    const tone = quoteStatusColor(currentStatus);
    const items = quote.items || [];
    const totalQty = items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
    const itemsTotal = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const canDecide = currentStatus.toUpperCase().includes('PENDING') || currentStatus.toUpperCase().includes('REVIEW');
    const executive = quote.executive_person || quote.sales_executive;

    const details: { label: string; value: string }[] = [
        { label: 'Type', value: quote.transaction_type || 'Sales' },
        { label: 'Price list', value: quote.price_list || 'Standard' },
        { label: 'Brand', value: quote.brand || '—' },
        { label: 'Company', value: quote.company || 'White & Co.' },
        ...(executive ? [{ label: 'Sales executive', value: executive }] : []),
    ];

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScreenHeader
                title={quote.customer_name || 'Customer'}
                subtitle={quote.name}
                align="left"
                onBack={goBack}
                rightIcon="print-outline"
                onRightPress={() => router.push(`/quotations/print?id=${quote.name}`)}
            >
                <View style={st.statusRow}>
                    <StatusPill text={currentStatus} color={tone} onDark />
                    <Text style={st.company} numberOfLines={1}>{quote.brand || quote.company || 'White & Co.'}</Text>
                </View>
                <BandStats
                    items={[
                        { label: 'Grand total', value: rupees(quote.grand_total), color: colors.mint, flex: 1.6 },
                        { label: 'Date', value: niceDate(quote.transaction_date).replace(/ \d{4}$/, ''), note: quote.transaction_date?.slice(0, 4) },
                        { label: 'Valid till', value: niceDate(quote.valid_till).replace(/ \d{4}$/, ''), note: quote.valid_till?.slice(0, 4), color: colors.amber },
                    ]}
                />
            </ScreenHeader>

            <ScrollView
                contentContainerStyle={[st.body, { paddingBottom: (canDecide ? 120 : 40) + insets.bottom }]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={enterSection(0)}>
                    <SectionCard icon="information-circle" title="Details" subtitle="Primary quotation details">
                        <View>
                            {details.map((row, i) => (
                                <View key={row.label} style={[st.kv, i === 0 && { borderTopWidth: 0 }]}>
                                    <Text style={st.kvLabel}>{row.label}</Text>
                                    <Text style={st.kvValue} numberOfLines={1}>{row.value}</Text>
                                </View>
                            ))}
                        </View>
                    </SectionCard>
                </Animated.View>

                <Animated.View entering={enterSection(1)}>
                    <SectionCard
                        icon="cube"
                        title="Items"
                        subtitle={`${items.length} ${items.length === 1 ? 'line' : 'lines'} · ${totalQty} Nos`}
                    >
                        {items.map((item, index) => {
                            const pi = item.against_purchase_invoice || quote.against_purchase_invoice;
                            const purch = item.purchase_rate || quote.purchase_rate;
                            const margin = item.item_margin || quote.item_margin;
                            return (
                                <View key={index} style={st.item}>
                                    <View style={st.itemTop}>
                                        <View style={st.itemNo}>
                                            <Text style={st.itemNoText}>{String(index + 1).padStart(2, '0')}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={st.itemName}>{item.item_name || item.item_code}</Text>
                                            <Text style={st.itemCode} numberOfLines={1}>{item.item_code}</Text>
                                        </View>
                                    </View>
                                    <View style={st.itemMath}>
                                        <Text style={st.itemQty}>{item.qty} Nos × {rupees(item.rate)}</Text>
                                        <Text style={st.itemAmt}>{rupees(item.amount)}</Text>
                                    </View>
                                    {pi || purch || margin ? (
                                        <View style={st.itemFoot}>
                                            {pi ? <Text style={st.footChip} numberOfLines={1}>PI {pi}</Text> : null}
                                            {purch ? <Text style={st.footChip}>Purchase {rupees(purch)}</Text> : null}
                                            {margin ? <Text style={[st.footChip, st.footChipGood]}>Margin {margin}%</Text> : null}
                                        </View>
                                    ) : null}
                                </View>
                            );
                        })}
                    </SectionCard>
                </Animated.View>

                <Animated.View entering={enterSection(2)}>
                    <View style={st.total}>
                        <View pointerEvents="none" style={st.totalGlow} />
                        <Text style={st.totalLabel}>GRAND TOTAL</Text>
                        <Text style={st.totalValue}>{rupees(quote.grand_total)}</Text>
                        <View style={st.totalRows}>
                            <View style={st.totalRow}>
                                <Text style={st.totalRowLabel}>Items value</Text>
                                <Text style={st.totalRowValue}>{rupees(itemsTotal)}</Text>
                            </View>
                            {quote.total_taxes != null ? (
                                <View style={st.totalRow}>
                                    <Text style={st.totalRowLabel}>Taxes</Text>
                                    <Text style={st.totalRowValue}>{rupees(quote.total_taxes)}</Text>
                                </View>
                            ) : null}
                            <View style={st.totalRow}>
                                <Text style={st.totalRowLabel}>Total quantity</Text>
                                <Text style={st.totalRowValue}>{totalQty} Nos</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {quote.payment_schedule && quote.payment_schedule.length > 0 ? (
                    <Animated.View entering={enterSection(3)}>
                        <SectionCard icon="calendar" title="Payment schedule" subtitle="Terms and milestones">
                            <View>
                                {quote.payment_schedule.map((p, i) => (
                                    <View key={i} style={[st.kv, i === 0 && { borderTopWidth: 0 }]}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={st.payTerm}>{p.payment_term}</Text>
                                            <Text style={st.payDue}>Due {niceDate(p.due_date)}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                            <Text style={st.payAmt}>{rupees(p.payment_amount)}</Text>
                                            <Text style={st.payPct}>{p.invoice_portion}%</Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </SectionCard>
                    </Animated.View>
                ) : null}
            </ScrollView>

            {canDecide && (
                <View
                    style={[
                        st.actionFooter,
                        // Use the device's real bottom inset. A hardcoded 20px
                        // was not enough on Vivo/iQOO (OriginOS/FuntouchOS),
                        // whose navigation bar is taller, so the Approve and
                        // Reject buttons were clipped underneath it.
                        { paddingBottom: Math.max(insets.bottom, 16) + 8 },
                    ]}
                >
                    <TouchableOpacity style={[st.actionButton, st.rejectButton]} onPress={() => handleAction('Reject')}>
                        <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                        <Text style={[st.actionButtonText, { color: colors.danger }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.actionButton, { backgroundColor: colors.success }]} onPress={() => handleAction('Approve')}>
                        <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                        <Text style={st.actionButtonText}>Approve</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

/** Theme-aware styles built from the shared design tokens. */
const getStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];
    return StyleSheet.create({
        center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
        company: { flexShrink: 1, fontSize: 12.5, color: c.onInkMuted, fontWeight: '700' },
        body: { padding: 16, gap: 14 },

        kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderTopWidth: 1, borderTopColor: c.border, gap: 12 },
        kvLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
        kvValue: { fontSize: 13, fontWeight: '800', color: c.text, maxWidth: '60%', textAlign: 'right' },

        item: { borderWidth: 1, borderColor: c.border, borderRadius: Radius.md, padding: 12, gap: 10, backgroundColor: c.surface },
        itemTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        itemNo: { width: 28, height: 28, borderRadius: 8, backgroundColor: c.surfaceSecondary, justifyContent: 'center', alignItems: 'center' },
        itemNoText: { fontSize: 11, fontWeight: '900', color: c.textSecondary },
        itemName: { fontSize: 14, fontWeight: '800', color: c.text },
        itemCode: { fontSize: 11, color: c.textSecondary, fontWeight: '600', marginTop: 1 },
        itemMath: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.surfaceSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
        itemQty: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
        itemAmt: { fontSize: 15, fontWeight: '800', color: c.text },
        itemFoot: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
        footChip: { fontSize: 11, fontWeight: '700', color: c.textSecondary, backgroundColor: c.background, borderWidth: 1, borderColor: c.border, borderRadius: Radius.pill, paddingHorizontal: 9, paddingVertical: 3, maxWidth: '100%' },
        footChipGood: { color: c.success, borderColor: c.success + '55' },

        total: { backgroundColor: c.ink, borderRadius: 24, padding: 18, overflow: 'hidden', ...Shadow.raised(theme) },
        totalGlow: { position: 'absolute', width: 170, height: 170, borderRadius: 85, right: -50, top: -60, backgroundColor: 'rgba(127,209,168,0.12)' },
        totalLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1, color: c.onInkMuted },
        totalValue: { fontSize: 34, fontWeight: '800', color: c.mint, letterSpacing: -0.5, marginTop: 4 },
        totalRows: { marginTop: 10 },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
        totalRowLabel: { fontSize: 13.5, color: c.onInk },
        totalRowValue: { fontSize: 13.5, fontWeight: '800', color: '#FFF' },

        payTerm: { fontSize: 13, fontWeight: '800', color: c.text },
        payDue: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
        payAmt: { fontSize: 14, fontWeight: '800', color: c.text },
        payPct: { fontSize: 10.5, fontWeight: '800', color: c.primaryVariant, backgroundColor: c.primarySoft, borderRadius: Radius.sm, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },

        actionFooter: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: 'row',
            paddingHorizontal: 20,
            paddingTop: 14,
            // paddingBottom is applied inline from the safe-area inset.
            gap: 12,
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderTopColor: c.border,
            elevation: 10,
            shadowColor: '#1F2421',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: theme === 'dark' ? 0.5 : 0.08,
            shadowRadius: 10,
        },
        actionButton: { flex: 1, flexDirection: 'row', height: 54, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center', gap: 8 },
        rejectButton: { borderWidth: 1.5, borderColor: c.danger, backgroundColor: c.surface },
        actionButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
    });
};
