import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle as SvgCircle } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { notificationService } from '../../services/NotificationService';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInUp, FadeInDown, useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { apiGet, apiPost } from '@/utils/api';

interface QuotationDetail {
    name: string;
    customer_name: string;
    transaction_date: string;
    valid_till: string;
    valid_until?: string;
    grand_total: number;
    total_taxes_and_charges: number;
    net_total: number;
    total_qty: number;
    status: string;
    currency: string;
    price_list_name: string;
    order_type: string;
    company?: string;
    sales_executive?: string;
    team_member?: string;
    approved_by?: string;
    dashboard_category?: string;
    designation?: string;
    phone_no?: string;
    mobile_no?: string;
    job_title?: string;
    email_id?: string;
    workflow_state?: string;
    creation?: string;
    in_words?: string;
    brand?: string;
    executive_person?: string;
    discount_percentage?: number;
    discount_amount?: number;
    base_net_total?: number;
    total?: number;
    total_items?: number;
    qty?: number;
    // Contact Details
    owner: string; // email
    contact_email?: string;
    contact_mobile?: string;
    items: Array<{
        item_code: string;
        item_name: string;
        description: string;
        qty: number;
        uom?: string;
        rate: number;
        amount: number;
        brand?: string;
    }>;
    payment_schedule?: Array<{
        payment_term?: string;
        description?: string;
        due_date: string;
        invoice_portion: number;
        payment_amount: number;
        outstanding?: number;
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
    let styles = getStyles(theme, { s, vs, ms }, '#0288D1');

    const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [isManager, setIsManager] = useState(false);
    const [prevId, setPrevId] = useState<string | null>(null);
    const [nextId, setNextId] = useState<string | null>(null);

    const normalizedId = Array.isArray(id) ? id[0] : id;


    // Animation
    const scrollY = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const headerTranslateY = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: interpolate(scrollY.value, [0, 200], [0, -210], Extrapolation.CLAMP) }],
            opacity: interpolate(scrollY.value, [200, 250], [1, 0], Extrapolation.CLAMP)
        };
    });

    const largeContentStyle = useAnimatedStyle(() => {
        const opacity = interpolate(scrollY.value, [0, 80], [1, 0], Extrapolation.CLAMP);
        const translateY = interpolate(scrollY.value, [0, 80], [0, -20], Extrapolation.CLAMP);

        return {
            opacity,
            transform: [{ translateY }]
        };
    });

    const miniHeaderStyle = useAnimatedStyle(() => {
        return {
            opacity: interpolate(scrollY.value, [140, 180], [0, 1], Extrapolation.CLAMP),
            transform: [{ translateY: interpolate(scrollY.value, [140, 180], [20, 0], Extrapolation.CLAMP) }]
        };
    });

    // Workflow Rules
    const WORKFLOW_RULES = [
        { state: 'Draft', action: 'Send To Approval', nextState: 'Pending', allowedRoles: ['Sales User', 'System Manager'], style: 'primary', icon: 'send-outline' },
        { state: 'Pending', action: 'Approve', nextState: 'Approved', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'success', icon: 'checkmark-circle-outline' },
        { state: 'Pending', action: 'Reject', nextState: 'Review', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'danger', icon: 'close-circle-outline' },
        { state: 'Review', action: 'Approve', nextState: 'Approved', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'success', icon: 'checkmark-circle-outline' },
        { state: 'Review', action: 'Reject', nextState: 'Rejected', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'danger', icon: 'close-circle-outline' },
        { state: 'Review', action: 'Cancel', nextState: 'Cancelled', allowedRoles: ['Sales User', 'System Manager'], style: 'danger', icon: 'trash-outline' },
        { state: 'Review', action: 'Resubmit', nextState: 'Resubmit', allowedRoles: ['Sales User', 'System Manager'], style: 'warning', icon: 'refresh-outline' },
        { state: 'Resubmit', action: 'Approve', nextState: 'Approved', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'success', icon: 'checkmark-circle-outline' },
        { state: 'Resubmit', action: 'Cancel', nextState: 'Cancelled', allowedRoles: ['Sales User', 'System Manager'], style: 'danger', icon: 'trash-outline' },
        { state: 'Resubmit', action: 'Re-open', nextState: 're-open', allowedRoles: ['Sales Manager', 'System Manager'], style: 'warning', icon: 'lock-open-outline' },
        { state: 're-open', action: 'Resubmit', nextState: 'Resubmit', allowedRoles: ['Sales User', 'System Manager'], style: 'primary', icon: 'refresh-outline' }
    ];

    useEffect(() => {
        loadUserPermissions();
        fetchQuotationListForNavigation();
    }, []);

    const loadUserPermissions = async () => {
        try {
            const rolesString = await SecureStore.getItemAsync('user_roles');
            const managerFlag = await SecureStore.getItemAsync('is_manager');

            setIsManager(managerFlag === 'true');
            if (rolesString) {
                const roles = JSON.parse(rolesString);
                setUserRoles(roles);
                console.log('Loaded User Roles:', roles, 'Is Manager:', managerFlag);
            }
        } catch (e) {
            console.error('Failed to load permissions', e);
        }
    };

    const fetchQuotationListForNavigation = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const url = `http://13.234.62.39:8080/api/resource/Quotation?fields=["name"]&order_by=creation desc&limit_page_length=500`;
            const res = await apiGet(url, sessionCookies);

            if (res.ok && res.data && res.data.data) {
                const allIds = res.data.data.map((q: any) => q.name);
                updateNeighbors(allIds, normalizedId);
            }
        } catch (error) {
            console.error('Nav Fetch Error:', error);
        }
    };

    const updateNeighbors = (allIds: string[], currentId: string) => {
        const index = allIds.indexOf(currentId);
        if (index !== -1) {
            setPrevId(index > 0 ? allIds[index - 1] : null);
            setNextId(index < allIds.length - 1 ? allIds[index + 1] : null);
        }
    };

    useEffect(() => {
        if (normalizedId && normalizedId !== 'index') {
            fetchQuotationDetails(normalizedId);
            fetchQuotationListForNavigation();
        } else if (normalizedId === 'index') {
            router.replace('/quotations');
        }
    }, [normalizedId]);

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString.replace(' ', 'T'));
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const fetchQuotationDetails = async (currentId: string) => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiPost(`http://13.234.62.39:8080/api/method/get_quote_resource`, { name: currentId }, sessionCookies);
            const data: any = res.data;

            let quoteData = null;
            if (res.ok && data && data.message && data.message.success && Array.isArray(data.message.data)) {
                quoteData = data.message.data[0];
            }

            if (res.ok && quoteData) {
                setQuotation(quoteData);
            }
        } catch (error) {
            console.error('Error fetching quotation details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleWorkflowAction = async (actionLabel: string, newStatus: string) => {
        if (!quotation) return;

        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiPost(`http://13.234.62.39:8080/api/method/approve_quotation`, {
                name: quotation.name,
                workflow_state: newStatus
            }, sessionCookies);

            if (res.ok) {
                Alert.alert(
                    'Success',
                    `Action "${actionLabel}" completed successfully.`,
                    [{ text: 'OK', onPress: () => fetchQuotationDetails(normalizedId) }]
                );
            } else {
                const data: any = res.data;
                Alert.alert('Error', data?.message || 'Failed to update quotation status.');
            }
        } catch (error) {
            console.error('Workflow Action Error:', error);
            Alert.alert('Error', 'An error occurred while updating the status.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (!quotation) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#01579B" />
            </View>
        );
    }

    const rawStatus = quotation.workflow_state || quotation.status;
    const displayStatus = rawStatus === 'Open' ? 'Pending' : rawStatus;

    const getStatusColor = (status: string) => {
        const lower = (status || '').toLowerCase();
        if (lower.includes('approved') || lower.includes('ordered')) return '#00BFA5';
        if (lower.includes('pending') || lower.includes('draft')) return '#0277BD';
        if (lower.includes('resubmit') || lower.includes('re-open')) return '#94A3B8';
        if (lower.includes('review') || lower.includes('declined') || lower.includes('rejected')) return '#F4511E';
        if (lower.includes('cancel')) return '#C62828';
        return '#0288D1'; // Default Blue
    };

    const statusColor = getStatusColor(displayStatus);
    styles = getStyles(theme, { s, vs, ms }, statusColor);

    const getStatusIcon = (status: string) => {
        const lower = (status || '').toLowerCase();
        if (lower.includes('approved') || lower.includes('ordered')) return 'checkmark-circle';
        if (lower.includes('pending') || lower.includes('draft')) return 'time';
        if (lower.includes('review') || lower.includes('declined') || lower.includes('rejected')) return 'search';
        if (lower.includes('cancel')) return 'close-circle';
        if (lower.includes('resubmit') || lower.includes('re-open')) return 'refresh';
        return 'information-circle';
    };

    const statusIcon = getStatusIcon(displayStatus) as any;


    return (
        <View style={{ flex: 1, backgroundColor: isDark ? colors.background : '#F8FAFC' }}>
            <StatusBar style="light" />

            <Animated.View style={[styles.headerBlock, headerTranslateY, { backgroundColor: statusColor, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, height: 320 }]}>
                <Animated.View style={[styles.headerContent, largeContentStyle, { marginTop: 90, paddingHorizontal: 24 }]}>
                    <View style={styles.statusRow}>
                        <View style={styles.whiteStatusPill}>
                            <Ionicons name={statusIcon} size={14} color={statusColor} />
                            <Text style={[styles.whiteStatusText, { color: statusColor }]}>{displayStatus}</Text>
                        </View>
                    </View>

                    <Text style={styles.customerNameMain}>{quotation.customer_name}</Text>
                    <Text style={styles.companyNameSub}>
                        {quotation.company || 'White & Co.'}
                    </Text>
                </Animated.View>
            </Animated.View>

            <View style={styles.stickyHeader}>
                <Animated.View style={[styles.stickyHeaderBg, miniHeaderStyle]} />
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>

                <Animated.View style={[styles.miniHeaderContainer, miniHeaderStyle]}>
                    <Text style={styles.miniHeaderTitle} numberOfLines={1}>{quotation.name}</Text>
                    <Text style={styles.miniHeaderSubtitle} numberOfLines={1}>
                        {quotation.customer_name} • {displayStatus}
                    </Text>
                </Animated.View>

                <View style={styles.fixedHeaderActions}>
                    <TouchableOpacity
                        onPress={() => router.push(`/quotations/print?id=${normalizedId}`)}
                        style={styles.backButton}
                    >
                        <Ionicons name="print-outline" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </View>

            <Animated.ScrollView
                style={[styles.container, { zIndex: 10, backgroundColor: 'transparent' }]}
                showsVerticalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: 320, paddingBottom: 100 }}
            >
                <View style={[styles.topSectionContainer, { marginTop: -40, gap: 16 }]}>
                    <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.orderNumberCardRefined}>
                        <View style={styles.blueLeftAccent} />
                        <View style={styles.refinedCardPadding}>
                            <Text style={styles.refinedCardLabel}>ORDER NUMBER</Text>
                            <Text style={styles.refinedCardValue}>{quotation.name}</Text>
                        </View>
                    </Animated.View>

                    <View style={styles.dateCardsRowRefined}>
                        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.dateCardRefined}>
                            <View style={styles.blueLeftAccent} />
                            <View style={styles.refinedCardPadding}>
                                <View style={styles.refinedLabelRow}>
                                    <Ionicons name="calendar-outline" size={14} color="#0288D1" />
                                    <Text style={styles.refinedCardLabel}>DATE</Text>
                                </View>
                                <Text style={styles.refinedCardValue}>{formatDate(quotation.transaction_date)}</Text>
                            </View>
                        </Animated.View>
                        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.dateCardRefined}>
                            <View style={styles.blueLeftAccent} />
                            <View style={styles.refinedCardPadding}>
                                <View style={styles.refinedLabelRow}>
                                    <Ionicons name="time-outline" size={14} color="#0288D1" />
                                    <Text style={styles.refinedCardLabel}>VALID TILL</Text>
                                </View>
                                <Text style={styles.refinedCardValue}>{formatDate(quotation.valid_till || '')}</Text>
                            </View>
                        </Animated.View>
                    </View>

                    <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.sectionCard}>
                        <View style={styles.blueLeftAccent} />
                        <View style={styles.cardContent}>
                            <View style={styles.sectionHeader}>
                                <View style={[styles.headerIconBox, { backgroundColor: '#E0F2F1' }]}>
                                    <Ionicons name="information-circle-outline" size={20} color="#0288D1" />
                                </View>
                                <View>
                                    <Text style={styles.sectionTitle}>Basic Information</Text>
                                    <Text style={styles.sectionSubtitle}>Primary quotation details</Text>
                                </View>
                            </View>

                            <View style={styles.refinedInfoGrid}>
                                <View style={[styles.infoTile, { borderLeftColor: '#00BFA5' }]}>
                                    <View style={styles.infoTileHeader}>
                                        <Ionicons name="cart" size={12} color="#00BFA5" />
                                        <Text style={styles.infoTileLabel}>Type</Text>
                                    </View>
                                    <Text style={styles.infoTileValue} numberOfLines={1}>{quotation.order_type || 'Sales'}</Text>
                                </View>

                                <View style={[styles.infoTile, { borderLeftColor: '#FF9100' }]}>
                                    <View style={styles.infoTileHeader}>
                                        <Ionicons name="pricetag" size={12} color="#FF9100" />
                                        <Text style={styles.infoTileLabel}>Price List</Text>
                                    </View>
                                    <Text style={styles.infoTileValue} numberOfLines={1}>{quotation.price_list_name || 'Standard'}</Text>
                                </View>

                                <View style={[styles.infoTile, { borderLeftColor: '#2979FF' }]}>
                                    <View style={styles.infoTileHeader}>
                                        <Ionicons name="person" size={12} color="#2979FF" />
                                        <Text style={styles.infoTileLabel}>Executive</Text>
                                    </View>
                                    <Text style={styles.infoTileValue} numberOfLines={1}>{quotation.executive_person || quotation.sales_executive || 'N/A'}</Text>
                                </View>

                                <View style={[styles.infoTile, { borderLeftColor: '#651FFF' }]}>
                                    <View style={styles.infoTileHeader}>
                                        <Ionicons name="business" size={12} color="#651FFF" />
                                        <Text style={styles.infoTileLabel}>Brand</Text>
                                    </View>
                                    <Text style={styles.infoTileValue} numberOfLines={1}>{quotation.brand || 'WHITE & CO'}</Text>
                                </View>
                            </View>
                        </View>
                    </Animated.View>
                </View>

                <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.sectionCard}>
                    <View style={styles.blueLeftAccent} />
                    <View style={styles.cardContent}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.headerIconBox, { backgroundColor: statusColor + '15' }]}>
                                <Ionicons name="cube-outline" size={20} color={statusColor} />
                            </View>
                            <View>
                                <Text style={styles.sectionTitle}>Order Items</Text>
                                <Text style={styles.sectionSubtitle}>Detailed breakdown of products</Text>
                            </View>
                            <View style={[styles.itemCountBadge, { backgroundColor: colors.surfaceSecondary, marginLeft: 'auto' }]}>
                                <Text style={[styles.itemCountText, { color: colors.text }]}>{quotation.items.length}</Text>
                            </View>
                        </View>

                        {quotation.items.map((item, index) => (
                            <Animated.View
                                key={index}
                                entering={FadeInUp.delay(700 + index * 100).springify()}
                                style={styles.itemCard}
                            >
                                <View style={styles.itemMain}>
                                    <View style={styles.itemHeader}>
                                        <View style={styles.itemIndex}>
                                            <Text style={styles.itemIndexText}>{(index + 1).toString().padStart(2, '0')}</Text>
                                        </View>
                                        <View style={styles.itemNameContainer}>
                                            <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                                            <View style={styles.skuRow}>
                                                <Text style={styles.skuText}>{item.item_code}</Text>
                                                {item.brand && (
                                                    <>
                                                        <View style={styles.metaDot} />
                                                        <Text style={styles.brandText}>{item.brand}</Text>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.itemDetails}>
                                        <View style={styles.detailBox}>
                                            <Text style={styles.detailLabel}>Quantity</Text>
                                            <Text style={styles.detailValue}>{item.qty} {item.uom}</Text>
                                        </View>
                                        <View style={styles.detailDivider} />
                                        <View style={styles.detailBox}>
                                            <Text style={styles.detailLabel}>Rate</Text>
                                            <Text style={styles.detailValue}>₹{item.rate.toLocaleString()}</Text>
                                        </View>
                                        <View style={styles.detailDivider} />
                                        <View style={styles.detailBox}>
                                            <Text style={styles.detailLabel}>Total</Text>
                                            <Text style={[styles.detailValue, { color: '#0288D1', fontWeight: '900' }]}>
                                                ₹{item.amount.toLocaleString()}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(800).springify()} style={styles.sectionCard}>
                    <View style={styles.blueLeftAccent} />
                    <View style={styles.cardContent}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.headerIconBox, { backgroundColor: statusColor + '15' }]}>
                                <Ionicons name="calendar-number-outline" size={20} color={statusColor} />
                            </View>
                            <View>
                                <Text style={styles.sectionTitle}>Payment Schedule</Text>
                                <Text style={styles.sectionSubtitle}>Terms and milestones</Text>
                            </View>
                        </View>

                        {(quotation.payment_schedule || (quotation as any).payment_terms)?.map((schedule: any, idx: number) => (
                            <View key={idx} style={styles.paymentTermCard}>
                                <View style={styles.paymentTermHeader}>
                                    <Text style={styles.paymentTermTitle}>Milestone {idx + 1}</Text>
                                    <View style={styles.portionBadge}>
                                        <Text style={styles.portionText}>{schedule.invoice_portion}%</Text>
                                    </View>
                                </View>

                                <View style={styles.paymentGrid}>
                                    <View style={styles.paymentGridItem}>
                                        <Text style={styles.paymentGridLabel}>Due Date</Text>
                                        <Text style={styles.paymentGridValue}>{schedule.due_date}</Text>
                                    </View>
                                    <View style={styles.paymentGridItem}>
                                        <Text style={styles.paymentGridLabel}>Amount</Text>
                                        <Text style={[styles.paymentGridValue, { color: '#0288D1' }]}>
                                            ₹{schedule.payment_amount.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                        </Text>
                                    </View>
                                </View>

                                {(schedule.outstanding ?? schedule.payment_amount) > 0 && (
                                    <View style={styles.outstandingRow}>
                                        <Text style={styles.outstandingLabel}>Outstanding</Text>
                                        <Text style={styles.outstandingValue}>
                                            ₹{(schedule.outstanding ?? schedule.payment_amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        ))}
                    </View>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(900).springify()} style={styles.sectionCard}>
                    <View style={styles.blueLeftAccent} />
                    <View style={styles.cardContent}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.headerIconBox, { backgroundColor: statusColor + '15' }]}>
                                <Ionicons name="wallet-outline" size={20} color={statusColor} />
                            </View>
                            <View>
                                <Text style={styles.sectionTitle}>Financial Summary</Text>
                                <Text style={styles.sectionSubtitle}>Costs and adjustments</Text>
                            </View>
                        </View>

                        <View style={styles.summaryList}>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Total Quantity</Text>
                                <Text style={styles.summaryValue}>
                                    {Number(quotation.total_qty || (quotation.items?.reduce((sum, item) => sum + item.qty, 0)) || 0)} items
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Net Total</Text>
                                <Text style={styles.summaryValue}>
                                    ₹{Number(quotation.net_total || quotation.base_net_total || (quotation.items?.reduce((sum, item) => sum + item.amount, 0)) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Total Taxes</Text>
                                <Text style={styles.summaryValue}>
                                    ₹{Number(quotation.total_taxes_and_charges || (quotation.grand_total - (quotation.net_total || (quotation.items?.reduce((sum, item) => sum + item.amount, 0)))) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                </Text>
                            </View>
                            {Number(quotation.discount_amount || 0) > 0 && (
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>Discount {quotation.discount_percentage ? `(${quotation.discount_percentage}%)` : ''}</Text>
                                    <Text style={[styles.summaryValue, { color: '#EF5350' }]}>
                                        - ₹{Number(quotation.discount_amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        <View style={styles.grandTotalBanner}>
                            <Svg height="80" width="100%" style={styles.grandTotalSvg}>
                                <Defs>
                                    <LinearGradient id="gradRefined" x1="0" y1="0" x2="1" y2="0">
                                        <Stop offset="0" stopColor={isDark ? '#4F46E5' : '#6366F1'} stopOpacity="1" />
                                        <Stop offset="1" stopColor={isDark ? '#9333EA' : '#A855F7'} stopOpacity="1" />
                                    </LinearGradient>
                                </Defs>
                                <Rect x="0" y="0" width="100%" height="80" fill="url(#gradRefined)" rx="20" ry="20" />
                            </Svg>
                            <View style={styles.grandTotalContent}>
                                <View>
                                    <Text style={styles.grandTotalLabel}>GRAND TOTAL</Text>
                                    <Text style={styles.grandTotalAmount}>
                                        ₹{(quotation.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                                    </Text>
                                </View>
                                <View style={styles.grandTotalIcon}>
                                    <Ionicons name="receipt-outline" size={32} color="rgba(255,255,255,0.4)" />
                                </View>
                            </View>
                        </View>
                    </View>
                </Animated.View>

                <View style={styles.actionSection}>
                    {
                        actionLoading ? (
                            <ActivityIndicator color="#0277BD" />
                        ) : (
                            <View style={styles.actionGrid}>
                                {
                                    WORKFLOW_RULES
                                        .filter(rule => {
                                            const rawStatus = quotation.workflow_state || quotation.status;
                                            const effectiveState = rawStatus === 'Open' ? 'Pending' : rawStatus;
                                            return rule.state === effectiveState;
                                        })
                                        .filter(rule => {
                                            if (['Approve', 'Reject', 'Review'].includes(rule.action)) {
                                                return isManager;
                                            }
                                            if (isManager) return true;
                                            const salesUserActions = ['Send To Approval', 'Cancel', 'Resubmit', 'Re-open'];
                                            return salesUserActions.includes(rule.action);
                                        })
                                        .map((rule, index) => (
                                            <TouchableOpacity
                                                key={index}
                                                style={[
                                                    styles.actionBtn,
                                                    rule.style === 'success' ? styles.btnSuccess :
                                                        rule.style === 'danger' ? styles.btnDanger :
                                                            rule.style === 'warning' ? styles.btnWarning :
                                                                styles.btnPrimary
                                                ]}
                                                onPress={() => handleWorkflowAction(rule.action, rule.nextState)}
                                            >
                                                <Ionicons name={rule.icon as any} size={20} color="#FFF" style={{ marginRight: 8 }} />
                                                <Text style={styles.btnText}>{rule.action}</Text>
                                            </TouchableOpacity>
                                        ))
                                }
                            </View>
                        )
                    }
                </View>

                <View style={{ height: 100 }} />
            </Animated.ScrollView >
        </View >
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any, statusColor: string = '#0288D1') {
    const isDark = theme === 'dark';
    const colors = Colors[theme];

    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        center: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.background,
        },
        headerBlock: {
            paddingTop: 60,
            paddingBottom: 40,
            paddingHorizontal: 20,
        },
        headerContent: {
            paddingHorizontal: 24,
        },
        backButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.15)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        topSectionContainer: {
            paddingHorizontal: 16,
            marginTop: 0,
            gap: 16,
        },
        sectionCard: {
            backgroundColor: colors.surface,
            borderRadius: 24,
            marginBottom: 20,
            flexDirection: 'row',
            overflow: 'hidden',
            shadowColor: colors.cardShadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: isDark ? 0.3 : 0.05,
            shadowRadius: 15,
            elevation: 4,
            borderWidth: isDark ? 1 : 0,
            borderColor: colors.border,
        },
        cardContent: {
            flex: 1,
            padding: 20,
        },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
        },
        sectionTitle: {
            fontSize: 18,
            fontWeight: '800',
            color: colors.text,
            letterSpacing: -0.5,
        },
        sectionSubtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        infoLabel: {
            fontSize: 13,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        infoValue: {
            fontSize: 14,
            color: colors.text,
            fontWeight: '700',
            textAlign: 'right',
        },
        paymentTermCard: {
            backgroundColor: colors.surfaceSecondary,
            borderRadius: 20,
            padding: 16,
            marginBottom: 12,
        },
        paymentTermHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
        },
        paymentTermTitle: {
            fontSize: 14,
            fontWeight: '800',
            color: colors.text,
        },
        portionBadge: {
            backgroundColor: colors.primary + '15',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
        },
        portionText: {
            fontSize: 12,
            fontWeight: '800',
            color: colors.primary,
        },
        paymentGrid: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: 12,
        },
        paymentGridItem: {
            flex: 1,
        },
        paymentGridLabel: {
            fontSize: 10,
            color: colors.textSecondary,
            fontWeight: '700',
            textTransform: 'uppercase',
            marginBottom: 4,
        },
        paymentGridValue: {
            fontSize: 14,
            fontWeight: '800',
            color: colors.text,
        },
        outstandingRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
        },
        outstandingLabel: {
            fontSize: 12,
            color: '#EF5350',
            fontWeight: '700',
        },
        outstandingValue: {
            fontSize: 12,
            color: '#EF5350',
            fontWeight: '800',
        },
        // Compact Refined Styles
        statusRow: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
        },
        whiteStatusPill: {
            backgroundColor: '#FFF',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 20,
            gap: 6,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 2,
        },
        whiteStatusText: {
            color: '#0288D1',
            fontSize: 13,
            fontWeight: '800',
        },
        customerNameMain: {
            fontSize: 24,
            fontWeight: '900',
            color: '#FFF',
            marginBottom: 4,
            letterSpacing: -0.5,
        },
        companyNameSub: {
            fontSize: 15,
            color: 'rgba(255,255,255,0.9)',
            fontWeight: '700',
        },
        stickyHeader: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            height: 110,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 50,
            paddingHorizontal: 20,
        },
        stickyHeaderBg: {
            ...StyleSheet.absoluteFillObject,
            backgroundColor: statusColor,
        },
        miniHeaderContainer: {
            position: 'absolute',
            left: 60,
            right: 100,
            top: 40,
            bottom: 0,
            justifyContent: 'center',
        },
        miniHeaderTitle: {
            color: '#FFF',
            fontSize: 17,
            fontWeight: '800',
        },
        miniHeaderSubtitle: {
            color: 'rgba(255,255,255,0.8)',
            fontSize: 11,
            fontWeight: '700',
        },
        fixedHeaderActions: {
            flexDirection: 'row',
            gap: 8,
        },
        orderNumberCardRefined: {
            backgroundColor: '#FFF',
            borderRadius: 20,
            flexDirection: 'row',
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 3,
        },
        dateCardsRowRefined: {
            flexDirection: 'row',
            gap: 16,
        },
        dateCardRefined: {
            flex: 1,
            backgroundColor: '#FFF',
            borderRadius: 20,
            flexDirection: 'row',
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 3,
        },
        blueLeftAccent: {
            width: 4,
            backgroundColor: statusColor,
        },
        refinedCardPadding: {
            padding: 16,
            flex: 1,
        },
        refinedCardLabel: {
            fontSize: 10,
            fontWeight: '900',
            color: '#94A3B8',
            letterSpacing: 1,
            marginBottom: 4,
            textTransform: 'uppercase',
        },
        refinedCardValue: {
            fontSize: 16,
            fontWeight: '800',
            color: '#1E293B',
        },
        refinedLabelRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
        },
        heroAmountCardRefined: {
            backgroundColor: '#00D4B1',
            borderRadius: 24,
            padding: 24,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            shadowColor: '#00D4B1',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 15,
            elevation: 8,
        },
        heroAmountContent: {
            flex: 1,
        },
        heroAmountLabel: {
            fontSize: 14,
            fontWeight: '700',
            color: '#FFF',
            opacity: 0.9,
            marginBottom: 4,
        },
        heroAmountValue: {
            fontSize: 34,
            fontWeight: '900',
            color: '#FFF',
            letterSpacing: -1,
        },
        heroIconBadge: {
            width: 56,
            height: 56,
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
        },
        refinedInfoGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
        },
        infoTile: {
            flex: 1,
            minWidth: '45%',
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
            padding: 12,
            borderRadius: 12,
            borderLeftWidth: 3,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 1,
        },
        infoTileHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
        },
        infoTileLabel: {
            fontSize: 10,
            fontWeight: '900',
            color: '#94A3B8',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
        },
        infoTileValue: {
            fontSize: 14,
            fontWeight: '800',
            color: colors.text,
        },
        refinedInfoDivider: {
            height: 1,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
        },
        // Restored Section Styles
        summaryList: {
            gap: 12,
            marginBottom: 20,
        },
        summaryRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
        },
        summaryLabel: {
            fontSize: 14,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        summaryValue: {
            fontSize: 15,
            color: colors.text,
            fontWeight: '800',
        },
        grandTotalBanner: {
            marginTop: 16,
            height: 80,
            position: 'relative',
        },
        grandTotalSvg: {
            position: 'absolute',
            top: 0,
            left: 0,
        },
        grandTotalContent: {
            paddingHorizontal: 20,
            height: 80,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
        },
        grandTotalLabel: {
            fontSize: 10,
            color: 'rgba(255,255,255,0.7)',
            fontWeight: '900',
            letterSpacing: 1,
            marginBottom: 4,
        },
        grandTotalAmount: {
            fontSize: 24,
            color: '#FFF',
            fontWeight: '900',
        },
        grandTotalIcon: {
            opacity: 0.3,
        },
        itemsSection: {
            paddingHorizontal: 16,
            marginTop: 32,
            marginBottom: 24,
        },
        itemsHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            paddingHorizontal: 4,
        },
        itemsTitle: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        headerIconBox: {
            width: 40,
            height: 40,
            borderRadius: 12,
            justifyContent: 'center',
            alignItems: 'center',
        },
        itemsSectionTitle: {
            fontSize: 20,
            fontWeight: '900',
            color: colors.text,
            letterSpacing: -0.5,
        },
        itemsSectionSubtitle: {
            fontSize: 12,
            color: colors.textSecondary,
            fontWeight: '600',
        },
        itemCountBadge: {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 8,
        },
        itemCountText: {
            fontSize: 12,
            fontWeight: '800',
        },
        itemCard: {
            backgroundColor: colors.surface,
            borderRadius: 24,
            marginBottom: 16,
            padding: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: isDark ? 0.3 : 0.05,
            shadowRadius: 12,
            elevation: 5,
        },
        itemMain: {
            flex: 1,
        },
        itemHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
        },
        itemIndex: {
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
            justifyContent: 'center',
            alignItems: 'center',
        },
        itemIndexText: {
            fontSize: 12,
            fontWeight: '900',
            color: colors.textSecondary,
        },
        itemNameContainer: {
            flex: 1,
        },
        itemName: {
            fontSize: 15,
            fontWeight: '800',
            color: colors.text,
            marginBottom: 4,
        },
        skuRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        skuText: {
            fontSize: 11,
            color: colors.textSecondary,
            fontWeight: '700',
            textTransform: 'uppercase',
        },
        metaDot: {
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: colors.border,
        },
        brandText: {
            fontSize: 11,
            color: colors.primary,
            fontWeight: '800',
        },
        itemDetails: {
            flexDirection: 'row',
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
            borderRadius: 16,
            padding: 12,
            justifyContent: 'space-between',
        },
        detailBox: {
            flex: 1,
            alignItems: 'center',
        },
        detailLabel: {
            fontSize: 9,
            color: colors.textSecondary,
            fontWeight: '800',
            textTransform: 'uppercase',
            marginBottom: 4,
        },
        detailValue: {
            fontSize: 13,
            fontWeight: '700',
            color: colors.text,
        },
        detailDivider: {
            width: 1,
            height: '100%',
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0',
        },
        actionSection: {
            padding: 16,
            marginBottom: 40,
        },
        actionGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
        },
        actionBtn: {
            flex: 1,
            minWidth: '45%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 14,
            borderRadius: 18,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 3,
        },
        btnPrimary: { backgroundColor: '#0277BD' },
        btnSuccess: { backgroundColor: '#00BFA5' },
        btnDanger: { backgroundColor: '#C62828' },
        btnWarning: { backgroundColor: '#F4511E' },
        btnText: {
            color: '#FFF',
            fontSize: 14,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        },
    });
}
