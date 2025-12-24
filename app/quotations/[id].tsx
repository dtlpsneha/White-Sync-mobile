import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { notificationService } from '../../services/NotificationService';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { s, vs, ms } from '../../utils/responsive';

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
    const styles = getStyles(theme);

    const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [isManager, setIsManager] = useState(false);
    const [prevId, setPrevId] = useState<string | null>(null);
    const [nextId, setNextId] = useState<string | null>(null);

    const normalizedId = Array.isArray(id) ? id[0] : id;

    // Rules from the Transition Image
    // Rules from the Transition Image
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
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            // Fetch list of IDs sorted by creation desc (same as list view)
            // Using standard resource API for simple ID list navigation for now 
            // OR should we use get_quote_resource if navigation needs to be scoped? 
            // Navigation usually is scoped. 
            // Let's stick to resource API for navigation IDs to minimize risk, valid scopes are filtered in list anyway.
            const url = `http://13.234.62.39:8080/api/resource/Quotation?fields=["name"]&order_by=creation desc&limit_page_length=500`;
            const response = await fetch(url, { headers });
            const data = await response.json();

            if (response.ok && data.data) {
                const allIds = data.data.map((q: any) => q.name);
                // We'll update neighbors whenever normalizedId changes
                // But we need the list first. Storing list in ref might be better, or just recalculating here.
                // For simplicity, let's just trigger updateNeighbors
                updateNeighbors(allIds, normalizedId);
            }
        } catch (error) {
            console.error('Nav Fetch Error:', error);
        }
    };

    // Helper to update neighbors
    const updateNeighbors = (allIds: string[], currentId: string) => {
        const index = allIds.indexOf(currentId);
        if (index !== -1) {
            setPrevId(index > 0 ? allIds[index - 1] : null);
            setNextId(index < allIds.length - 1 ? allIds[index + 1] : null);
        }
    };

    useEffect(() => {
        console.log('Quotation Detail Screen - Received ID:', normalizedId);
        // Prevent fetching if ID is 'index' (happens when navigating to /quotations/index)
        if (normalizedId && normalizedId !== 'index') {
            fetchQuotationDetails(normalizedId);
            // Re-fetch navigation list only if necessary, or just rely on initial load?
            // Ideally we re-calculate neighbors
            fetchQuotationListForNavigation(); // Simple re-fetch to be safe and ensure current context
        } else if (normalizedId === 'index') {
            console.warn('Received "index" as ID. Redirecting.');
            router.replace('/quotations' as any);
        }
    }, [normalizedId]);

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        // Handle ERPNext formats (yyyy-mm-dd or yyyy-mm-dd HH:mm:ss)
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
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            // Use Custom API for details
            const url = `http://13.234.62.39:8080/api/method/get_quote_resource`;
            console.log('Fetching quotation details from custom API:', url);

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: currentId })
            });
            const data = await response.json();

            // Handle custom API response structure
            // Based on log: {"message": {"data": [Object], "message": "Success", ...}}
            let quoteData = null;
            if (data.message) {
                if (data.message.data) {
                    if (Array.isArray(data.message.data) && data.message.data.length > 0) {
                        quoteData = data.message.data[0];
                    } else if (!Array.isArray(data.message.data) && data.message.data.name) {
                        quoteData = data.message.data;
                    }
                } else if (data.message.name) {
                    quoteData = data.message;
                } else if (Array.isArray(data.message) && data.message.length > 0) {
                    quoteData = data.message[0];
                }
            } else if (data.data) {
                quoteData = data.data; // Fallback
            }

            if (response.ok && quoteData) {
                setQuotation(quoteData);
            } else {
                console.warn('Failed to fetch quotation details', data);
                console.error('Response status:', response.status);
                // console.error('Error data:', JSON.stringify(data, null, 2)); 
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
            setActionLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            const url = `http://13.234.62.39:8080/api/method/approve_quotation`;
            const body = JSON.stringify({
                name: quotation.name,
                workflow_state: newStatus
            });

            console.log(`[Workflow-Debug] Action: "${actionLabel}", newStatus: "${newStatus}"`);
            console.log(`Executing ${actionLabel}: Updating workflow state...`);

            const response = await fetch(url, {
                method: 'POST',
                headers,
                body
            });

            const data = await response.json();
            console.log('Workflow Action Response:', data);

            if (response.ok) {
                const statusLower = newStatus.toLowerCase();
                if (statusLower === 'pending' || statusLower === 'approved') {
                    const icon = statusLower === 'pending' ? '⏳' : '✅';
                    const formattedAmount = quotation.grand_total ? `${quotation.currency} ${quotation.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '0.00';

                    // Format date from creation
                    let formattedTime = 'now';
                    if (quotation.creation) {
                        const d = new Date(quotation.creation.replace(' ', 'T'));
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const year = String(d.getFullYear()).slice(-2);
                        const hours = String(d.getHours()).padStart(2, '0');
                        const mins = String(d.getMinutes()).padStart(2, '0');
                        formattedTime = `${day}:${month}:${year} ${hours}:${mins}`;
                    }

                    const notifyTitle = `${icon} ${statusLower === 'pending' ? 'New Quotation' : 'Quotation Approved'}`;
                    const notifyBody = `${quotation.customer_name} quotation of ${formattedAmount} submitted on ${formattedTime} for approval.`;

                    console.log(`[Quote-Detail] Posting notification: ${notifyTitle} - ${notifyBody}`);

                    notificationService.postLocalNotification(
                        notifyTitle,
                        notifyBody,
                        { id: quotation.name },
                        "QUOTATION_WORKFLOW"
                    );
                }

                Alert.alert(
                    'Success',
                    `Action "${actionLabel}" completed successfully.`,
                    [{ text: 'OK', onPress: () => fetchQuotationDetails(normalizedId) }]
                );
            } else {
                Alert.alert('Error', data.message || 'Failed to update quotation status.');
            }
        } catch (error) {
            console.error('Workflow Action Error:', error);
            Alert.alert('Error', 'An error occurred while updating the status.');
        } finally {
            setActionLoading(false);
        }
    };



    const stripHtml = (html: string) => {
        if (!html) return '';
        return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
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

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            <StatusBar style="light" />

            {/* Solid Blue Header (Unified) */}
            <View style={styles.headerBlock}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <View style={styles.headerStatusBadge}>
                        <Text style={styles.headerStatusText}>
                            {displayStatus}
                        </Text>
                    </View>
                </View>

                <View style={styles.headerContent}>
                    <Text style={styles.headerCustomerName} numberOfLines={2}>{quotation.customer_name}</Text>
                    <View style={styles.headerInfoRow}>
                        <View style={styles.headerIconText}>
                            <Ionicons name="barcode-outline" size={16} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.headerInfoText}>{quotation.name}</Text>
                        </View>
                        <View style={styles.headerIconText}>
                            <Ionicons name="business-outline" size={16} color="rgba(255,255,255,0.8)" />
                            <Text style={styles.headerInfoText}>{quotation.company || 'White & Co.'}</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Date & Amount Section */}
            <View style={styles.dateAmountContainer}>
                <View style={styles.dateCard}>
                    <View style={styles.dateItem}>
                        <View style={styles.dateHeader}>
                            <Ionicons name="calendar-outline" size={16} color="#90A4AE" />
                            <Text style={styles.dateLabel}>Date</Text>
                        </View>
                        <Text style={styles.dateValue}>{formatDate(quotation.transaction_date)}</Text>
                    </View>
                    <View style={styles.dateDivider} />
                    <View style={styles.dateItem}>
                        <View style={styles.dateHeader}>
                            <Ionicons name="time-outline" size={16} color="#90A4AE" />
                            <Text style={styles.dateLabel}>Valid Till</Text>
                        </View>
                        <Text style={styles.dateValue}>{formatDate(quotation.valid_till || quotation.valid_until || '') || 'N/A'}</Text>
                    </View>
                </View>

                <View style={styles.amountBanner}>
                    <View style={styles.amountLeft}>
                        <View style={styles.walletIconBox}>
                            <Ionicons name="wallet-outline" size={20} color="#00C853" />
                        </View>
                        <Text style={styles.amountLabel}>Total Amount</Text>
                    </View>
                    <Text style={styles.amountValue}>{Number(quotation.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </View>
            </View>

            {/* Basic Information */}
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="information-circle-outline" size={20} color="#0055D4" />
                    <Text style={styles.sectionTitle}>Basic Information</Text>
                </View>

                <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Title</Text>
                    <Text style={styles.tableValueBold}>{quotation.customer_name}</Text>
                </View>
                <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Order Type</Text>
                    <Text style={styles.tableValue}>{quotation.order_type || 'Sales'}</Text>
                </View>
                <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Price List</Text>
                    <Text style={styles.tableValue}>{quotation.price_list_name || 'Standard Selling'}</Text>
                </View>
                <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Executive</Text>
                    <Text style={styles.tableValue}>{quotation.executive_person || quotation.sales_executive || quotation.team_member || 'N/A'}</Text>
                </View>
                <View style={styles.tableRow}>
                    <Text style={styles.tableLabel}>Brand</Text>
                    <Text style={styles.tableValue}>{quotation.brand || 'WHITE & CO'}</Text>
                </View>
            </View>

            {/* Items Section */}
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="cube-outline" size={20} color="#0055D4" />
                    <Text style={styles.sectionTitle}>Items</Text>
                    <View style={styles.itemCountBadge}>
                        <Text style={styles.itemCountText}>{quotation.items.length}</Text>
                    </View>
                </View>

                {quotation.items.map((item, index) => (
                    <View key={index} style={styles.itemCard}>
                        <View style={styles.itemCardTop}>
                            <View style={styles.itemIndexCircle}>
                                <Text style={styles.itemIndexText}>{index + 1}</Text>
                            </View>
                            <View style={styles.itemHeaderInfo}>
                                <Text style={styles.itemName} numberOfLines={2}>{item.item_name}</Text>
                                <Text style={styles.itemCode}>{item.item_code}</Text>
                                <Text style={styles.itemDesc} numberOfLines={2}>{stripHtml(item.description)}</Text>
                            </View>
                        </View>

                        <View style={styles.itemDivider} />

                        <View style={styles.itemGrid}>
                            <View style={styles.gridBox}>
                                <View style={styles.gridLabelRow}>
                                    <Ionicons name="basket-outline" size={14} color="#90A4AE" />
                                    <Text style={styles.gridLabel}>Quantity</Text>
                                </View>
                                <Text style={styles.gridValue}>{item.qty} {item.uom || 'Nos'}</Text>
                            </View>
                            <View style={styles.gridBox}>
                                <View style={styles.gridLabelRow}>
                                    <Ionicons name="cash-outline" size={14} color="#90A4AE" />
                                    <Text style={styles.gridLabel}>Rate</Text>
                                </View>
                                <Text style={styles.gridValue}>{quotation.currency} {item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                            </View>
                            <View style={styles.gridBox}>
                                <View style={styles.gridLabelRow}>
                                    <Ionicons name="pricetag-outline" size={14} color="#90A4AE" />
                                    <Text style={styles.gridLabel}>Brand</Text>
                                </View>
                                <Text style={styles.gridValue}>{item.brand || 'WHITE & CO'}</Text>
                            </View>
                            <View style={styles.gridBox}>
                                <View style={styles.gridLabelRow}>
                                    <Ionicons name="wallet-outline" size={14} color="#90A4AE" />
                                    <Text style={styles.gridLabel}>Amount</Text>
                                </View>
                                <Text style={styles.gridValueBlue}>{Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                            </View>
                        </View>
                    </View>
                ))}
            </View>

            {/* Payment Schedule */}
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="calendar-number-outline" size={20} color="#0055D4" />
                    <Text style={styles.sectionTitle}>Payment Schedule</Text>
                </View>

                {quotation.payment_schedule?.map((schedule, idx) => (
                    <View key={idx} style={styles.paymentTermCard}>
                        <View style={styles.paymentLine}>
                            <View style={styles.paymentLeft}>
                                <Ionicons name="calendar-outline" size={16} color="#90A4AE" />
                                <Text style={styles.paymentLabel}>Due Date</Text>
                            </View>
                            <Text style={styles.paymentValue}>{schedule.due_date}</Text>
                        </View>
                        <View style={styles.paymentLine}>
                            <View style={styles.paymentLeft}>
                                <Ionicons name="pie-chart-outline" size={16} color="#90A4AE" />
                                <Text style={styles.paymentLabel}>Invoice Portion</Text>
                            </View>
                            <Text style={styles.paymentValue}>{schedule.invoice_portion}%</Text>
                        </View>
                        <View style={styles.paymentLine}>
                            <View style={styles.paymentLeft}>
                                <Ionicons name="cash-outline" size={16} color="#90A4AE" />
                                <Text style={styles.paymentLabel}>Payment Amount</Text>
                            </View>
                            <Text style={styles.paymentValueBlue}>{schedule.payment_amount.toLocaleString()}</Text>
                        </View>
                        <View style={styles.paymentLine}>
                            <View style={styles.paymentLeft}>
                                <Ionicons name="alert-circle-outline" size={16} color="#90A4AE" />
                                <Text style={styles.paymentLabel}>Outstanding</Text>
                            </View>
                            <Text style={styles.paymentValueRed}>{schedule.outstanding?.toLocaleString() || schedule.payment_amount.toLocaleString()}</Text>
                        </View>
                    </View>
                ))}
            </View>

            {/* Contact Details */}
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="person-outline" size={20} color="#0055D4" />
                    <Text style={styles.sectionTitle}>Contact Details</Text>
                </View>

                <View style={styles.contactLine}>
                    <Ionicons name="person-outline" size={18} color="#90A4AE" style={styles.contactIcon} />
                    <Text style={styles.contactLabel}>Team Member</Text>
                    <Text style={styles.contactValue}>
                        {quotation.team_member || quotation.sales_executive || (quotation.owner && !quotation.owner.includes('System') ? quotation.owner.split('@')[0] : 'Consultant')}
                    </Text>
                </View>
                <View style={styles.contactLine}>
                    <Ionicons name="briefcase-outline" size={18} color="#90A4AE" style={styles.contactIcon} />
                    <Text style={styles.contactLabel}>Designation</Text>
                    <Text style={styles.contactValue}>{quotation.designation || quotation.job_title || 'N/A'}</Text>
                </View>
                <View style={styles.contactLine}>
                    <Ionicons name="call-outline" size={18} color="#90A4AE" style={styles.contactIcon} />
                    <Text style={styles.contactLabel}>Phone No</Text>
                    <Text style={styles.contactValue}>{quotation.phone_no || quotation.mobile_no || quotation.contact_mobile || 'N/A'}</Text>
                </View>
                <View style={styles.contactLine}>
                    <Ionicons name="mail-outline" size={18} color="#90A4AE" style={styles.contactIcon} />
                    <Text style={styles.contactLabel}>Email ID</Text>
                    <Text style={styles.contactValue}>{quotation.email_id || quotation.owner}</Text>
                </View>
            </View>

            {/* Financial Summary */}
            <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="wallet-outline" size={20} color="#0055D4" />
                    <Text style={styles.sectionTitle}>Financial Summary</Text>
                </View>

                <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                    <View style={styles.tableRowLeft}>
                        <Ionicons name="cart-outline" size={20} color="#90A4AE" />
                        <Text style={styles.tableLabelLarge}>Total Quantity</Text>
                    </View>
                    <Text style={styles.tableValueLarge}>{Number(quotation.total_qty ?? quotation.total_items ?? quotation.qty ?? 0)} items</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.tableRow}>
                    <Text style={styles.tableLabelSummary}>Net Total</Text>
                    <Text style={styles.tableValueSummary}>{Number(quotation.net_total ?? quotation.base_net_total ?? quotation.total ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </View>
                <View style={styles.tableRow}>
                    <Text style={styles.tableLabelSummary}>Total Taxes</Text>
                    <Text style={styles.tableValueSummary}>{(quotation.total_taxes_and_charges || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </View>
                {(quotation.discount_amount && quotation.discount_amount > 0) ? (
                    <View style={styles.tableRow}>
                        <Text style={styles.tableLabelSummary}>Discount {quotation.discount_percentage ? `(${quotation.discount_percentage}%)` : ''}</Text>
                        <Text style={styles.tableValueSummaryRed}>- {quotation.discount_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    </View>
                ) : null}

                <View style={styles.grandTotalBanner}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>{(quotation.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </View>

                {quotation.in_words && (
                    <Text style={styles.wordAmount}>{quotation.in_words}</Text>
                )}
            </View>

            {/* Actions */}
            <View style={styles.actionSection}>
                {actionLoading ? (
                    <ActivityIndicator color="#0055D4" />
                ) : (
                    <View style={styles.actionGrid}>
                        {WORKFLOW_RULES
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
                                                styles.btnPrimary
                                    ]}
                                    onPress={() => handleWorkflowAction(rule.action, rule.nextState)}
                                >
                                    <Ionicons name={rule.icon as any} size={20} color="#FFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.btnText}>{rule.action}</Text>
                                </TouchableOpacity>
                            ))}
                    </View>
                )}
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}

function getStyles(theme: 'light' | 'dark') {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#F5F7FA',
        },
        center: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
        },
        headerBlock: {
            backgroundColor: '#01579B',
            paddingTop: 60,
            paddingBottom: 30,
            paddingHorizontal: 20,
        },
        headerTopRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
        },
        backButton: {
            padding: 4,
        },
        headerStatusBadge: {
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 12,
            backgroundColor: 'rgba(255,255,255,0.1)',
        },
        headerStatusText: {
            color: '#FFF',
            fontSize: 12,
            fontWeight: '600',
        },
        headerContent: {
            marginTop: 4,
        },
        headerCustomerName: {
            fontSize: 24,
            fontWeight: '800',
            color: '#FFF',
            marginBottom: 12,
        },
        headerInfoRow: {
            flexDirection: 'row',
            gap: 20,
        },
        headerIconText: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
        },
        headerInfoText: {
            color: 'rgba(255,255,255,0.8)',
            fontSize: 13,
            fontWeight: '500',
        },
        dateAmountContainer: {
            padding: 16,
            marginTop: -20,
        },
        dateCard: {
            backgroundColor: '#FFF',
            borderRadius: 20,
            padding: 16,
            flexDirection: 'row',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 10,
            elevation: 3,
            marginBottom: 16,
        },
        dateItem: {
            flex: 1,
        },
        dateHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            marginBottom: 4,
        },
        dateLabel: {
            fontSize: 12,
            color: '#90A4AE',
            fontWeight: '600',
        },
        dateValue: {
            fontSize: ms(15),
            fontWeight: '700',
            color: '#263238',
        },
        dateDivider: {
            width: 1,
            backgroundColor: '#ECEFF1',
            marginHorizontal: 16,
        },
        amountBanner: {
            backgroundColor: '#E8F5E9',
            borderRadius: 16,
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#C8E6C9',
        },
        amountLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        walletIconBox: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#C8E6C9',
            justifyContent: 'center',
            alignItems: 'center',
        },
        amountLabel: {
            fontSize: 14,
            fontWeight: '600',
            color: '#2E7D32',
        },
        amountValue: {
            fontSize: ms(18),
            fontWeight: '800',
            color: '#2E7D32',
        },
        sectionCard: {
            backgroundColor: '#FFF',
            borderRadius: 24,
            padding: 20,
            marginHorizontal: 16,
            marginBottom: 16,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.03,
            shadowRadius: 10,
            elevation: 2,
        },
        sectionHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
        },
        sectionTitle: {
            fontSize: ms(16),
            fontWeight: '700',
            color: '#263238',
        },
        tableRow: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#F5F7FA',
        },
        tableLabel: {
            fontSize: ms(14),
            color: '#90A4AE',
            fontWeight: '500',
        },
        tableValue: {
            fontSize: ms(14),
            color: '#263238',
            fontWeight: '600',
        },
        tableValueBold: {
            fontSize: ms(14),
            color: '#01579B',
            fontWeight: '800',
        },
        itemCountBadge: {
            backgroundColor: '#E3F2FD',
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 8,
        },
        itemCountText: {
            fontSize: 12,
            fontWeight: '700',
            color: '#0055D4',
        },
        itemCard: {
            backgroundColor: '#FAFAFA',
            borderRadius: 20,
            padding: 16,
            marginBottom: 16,
        },
        itemCardTop: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
        },
        itemIndexCircle: {
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: '#0055D4',
            justifyContent: 'center',
            alignItems: 'center',
        },
        itemIndexText: {
            color: '#FFF',
            fontSize: 12,
            fontWeight: '700',
        },
        itemHeaderInfo: {
            flex: 1,
        },
        itemName: {
            fontSize: ms(15),
            fontWeight: '700',
            color: '#263238',
            marginBottom: vs(2),
        },
        itemCode: {
            fontSize: 12,
            color: '#90A4AE',
            fontWeight: '600',
            marginBottom: 8,
        },
        itemDesc: {
            fontSize: 12,
            color: '#78909C',
            lineHeight: 18,
        },
        itemDivider: {
            height: 1,
            backgroundColor: '#F0F0F0',
            marginVertical: 16,
        },
        itemGrid: {
            flexDirection: 'row',
            flexWrap: 'wrap',
        },
        gridBox: {
            width: '50%',
            marginBottom: 12,
        },
        gridLabelRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginBottom: 4,
        },
        gridLabel: {
            fontSize: 11,
            color: '#90A4AE',
            fontWeight: '600',
        },
        gridValue: {
            fontSize: ms(13),
            color: '#263238',
            fontWeight: '700',
        },
        gridValueBlue: {
            fontSize: ms(14),
            color: '#0055D4',
            fontWeight: '800',
        },
        paymentTermCard: {
            backgroundColor: '#FAFAFA',
            borderRadius: 20,
            padding: 16,
            marginBottom: 12,
        },
        paymentLine: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingVertical: 8,
        },
        paymentLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
        },
        paymentLabel: {
            fontSize: 13,
            color: '#90A4AE',
            fontWeight: '600',
        },
        paymentValue: {
            fontSize: 13,
            color: '#263238',
            fontWeight: '600',
        },
        paymentValueBlue: {
            fontSize: 13,
            color: '#0055D4',
            fontWeight: '800',
        },
        paymentValueRed: {
            fontSize: 13,
            color: '#E53935',
            fontWeight: '800',
        },
        contactLine: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#F5F7FA',
        },
        contactIcon: {
            marginRight: 12,
        },
        contactLabel: {
            flex: 1,
            fontSize: 14,
            color: '#90A4AE',
            fontWeight: '500',
        },
        contactValue: {
            fontSize: 14,
            color: '#263238',
            fontWeight: '600',
        },
        tableRowLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
        },
        tableLabelLarge: {
            fontSize: 15,
            fontWeight: '600',
            color: '#455A64',
        },
        tableValueLarge: {
            fontSize: 15,
            fontWeight: '700',
            color: '#263238',
        },
        summaryDivider: {
            height: 1,
            backgroundColor: '#ECEFF1',
            marginVertical: 12,
        },
        tableLabelSummary: {
            fontSize: 14,
            color: '#78909C',
            fontWeight: '500',
        },
        tableValueSummary: {
            fontSize: 14,
            color: '#263238',
            fontWeight: '700',
        },
        tableValueSummaryRed: {
            fontSize: 14,
            color: '#E53935',
            fontWeight: '700',
        },
        grandTotalBanner: {
            backgroundColor: '#E3F2FD',
            borderRadius: 12,
            padding: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 20,
            marginBottom: 12,
        },
        grandTotalLabel: {
            fontSize: ms(16),
            fontWeight: '700',
            color: '#0055D4',
        },
        grandTotalValue: {
            fontSize: ms(20),
            fontWeight: '800',
            color: '#0055D4',
        },
        wordAmount: {
            fontSize: 12,
            color: '#90A4AE',
            textAlign: 'center',
            fontStyle: 'italic',
        },
        actionSection: {
            padding: 16,
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
            borderRadius: 12,
        },
        btnPrimary: { backgroundColor: '#0055D4' },
        btnSuccess: { backgroundColor: '#2E7D32' },
        btnDanger: { backgroundColor: '#C62828' },
        btnText: {
            color: '#FFF',
            fontSize: 14,
            fontWeight: '700',
        },
    });
}
