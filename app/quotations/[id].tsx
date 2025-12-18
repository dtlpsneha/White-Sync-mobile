import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { notificationService } from '../../services/NotificationService';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';

interface QuotationDetail {
    name: string;
    customer_name: string;
    transaction_date: string;
    valid_till: string;
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
    email_id?: string;
    workflow_state?: string;
    // Contact Details
    owner: string; // email
    contact_email?: string;
    contact_mobile?: string;
    items: Array<{
        item_code: string;
        item_name: string;
        description: string;
        qty: number;
        rate: number;
        amount: number;
        brand?: string; // might custom
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
    const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [prevId, setPrevId] = useState<string | null>(null);
    const [nextId, setNextId] = useState<string | null>(null);

    const normalizedId = Array.isArray(id) ? id[0] : id;

    // Rules from the Transition Image
    // Rules from the Transition Image
    const WORKFLOW_RULES = [
        { state: 'Draft', action: 'Send To Approval', nextState: 'Pending', allowedRoles: ['Sales User', 'System Manager'], style: 'primary', icon: 'send-outline' },
        { state: 'Pending', action: 'Approve', nextState: 'Approved', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'success', icon: 'checkmark-circle-outline' },
        { state: 'Pending', action: 'Reject', nextState: 'Review', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'danger', icon: 'close-circle-outline' },
        { state: 'Review', action: 'Cancel', nextState: 'Cancelled', allowedRoles: ['Sales User', 'System Manager'], style: 'danger', icon: 'trash-outline' },
        { state: 'Review', action: 'Resubmit', nextState: 'Resubmit', allowedRoles: ['Sales User', 'System Manager'], style: 'warning', icon: 'refresh-outline' },
        { state: 'Resubmit', action: 'Approve', nextState: 'Approved', allowedRoles: ['Sales Manager', 'System Manager', 'Administrator'], style: 'success', icon: 'checkmark-circle-outline' },
        { state: 'Resubmit', action: 'Cancel', nextState: 'Cancelled', allowedRoles: ['Sales User', 'System Manager'], style: 'danger', icon: 'trash-outline' },
        { state: 'Resubmit', action: 'Re-open', nextState: 're-open', allowedRoles: ['Sales Manager', 'System Manager'], style: 'warning', icon: 'lock-open-outline' },
        { state: 're-open', action: 'Resubmit', nextState: 'Resubmit', allowedRoles: ['Sales User', 'System Manager'], style: 'primary', icon: 'refresh-outline' }
    ];

    useEffect(() => {
        loadUserRoles();
        fetchQuotationListForNavigation();
    }, []);

    const loadUserRoles = async () => {
        try {
            const rolesString = await SecureStore.getItemAsync('user_roles');
            if (rolesString) {
                const roles = JSON.parse(rolesString);
                setUserRoles(roles);
                console.log('Loaded User Roles:', roles);
            }
        } catch (e) {
            console.error('Failed to load roles', e);
        }
    };

    const fetchQuotationListForNavigation = async () => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            // Fetch list of IDs sorted by creation desc (same as list view)
            // Only need name to determine order
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
            console.warn('Received "index" as ID - this should not happen. Redirecting to list.');
            router.replace('/quotations' as any);
        }
    }, [normalizedId]);

    const fetchQuotationDetails = async (currentId: string) => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            const fields = JSON.stringify(["name", "customer_name", "transaction_date", "valid_till", "grand_total", "total_taxes_and_charges", "net_total", "total_qty", "status", "currency", "price_list_name", "order_type", "items", "payment_schedule", "owner", "contact_email", "contact_mobile", "company", "sales_executive", "team_member", "designation", "phone_no", "email_id", "workflow_state"]);
            const url = `http://13.234.62.39:8080/api/resource/Quotation/${currentId}`;
            console.log('Fetching quotation from URL:', url);

            const response = await fetch(url, { headers });
            const data = await response.json();

            if (response.ok && data.data) {
                setQuotation(data.data);
            } else {
                console.warn('Failed to fetch quotation details', data);
                console.error('Response status:', response.status);
                console.error('Error data:', JSON.stringify(data, null, 2));
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

            console.log(`[Workflow-Debug] Action: "${actionLabel}", newStatus: "${newStatus}", id: "${quotation.name}"`);
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
                    const notifyTitle = statusLower === 'pending' ? "Waiting for Approval" : "Quotation Approved";
                    const notifyBody = `Quotation ${quotation.name || 'N/A'} for ${quotation.customer_name || 'N/A'} of ${quotation.currency || ''} ${quotation.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) || '0.00'} is ${statusLower}.`;

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
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    if (!quotation) {
        return (
            <View style={styles.center}>
                <Text>Quotation not found</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <StatusBar style="light" />

            {/* Header / Nav */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#FFF" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Details</Text>

                <View style={{ flexDirection: 'row', gap: 16 }}>
                    <TouchableOpacity
                        onPress={() => prevId && router.setParams({ id: prevId })}
                        disabled={!prevId}
                        style={{ opacity: prevId ? 1 : 0.3 }}
                    >
                        <Ionicons name="chevron-up" size={24} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => nextId && router.setParams({ id: nextId })}
                        disabled={!nextId}
                        style={{ opacity: nextId ? 1 : 0.3 }}
                    >
                        <Ionicons name="chevron-down" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Debug Section */}
            <View style={{ padding: 20, borderTopWidth: 1, borderColor: '#EEE', marginTop: 20 }}>
                <TouchableOpacity
                    style={{ backgroundColor: '#7367F0', padding: 15, borderRadius: 10, alignItems: 'center' }}
                    onPress={async () => {
                        const { status } = await Notifications.getPermissionsAsync();
                        console.log('Notification Status:', status);

                        notificationService.postLocalNotification(
                            "DEBUG TEST",
                            "This is a test notification with details.",
                            { debug: true }
                        );

                        Alert.alert("Debug", `Status: ${status}. Notification triggered. Check your drawer!`);
                    }}
                >
                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>DEBUG: Test Notification</Text>
                </TouchableOpacity>
            </View>

            {/* Blue Card Top */}
            <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.blueCard}>
                <View style={styles.blueCardRow}>
                    <Text style={[styles.blueCardId, { flex: 1, fontSize: 22, fontWeight: '800' }]} numberOfLines={1}>{quotation.customer_name}</Text>
                    <TouchableOpacity style={styles.openBadge}>
                        <Text style={styles.openBadgeText}>{quotation.workflow_state || (quotation.status === 'Open' ? 'Pending' : (quotation.status === 'Ordered' ? 'Approved' : quotation.status))}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.statusRow}>
                    {/* Hiding duplicate status or using it for something else? Keeping consistent layout */}
                </View>

                <View style={styles.infoRow}>
                    <Ionicons name="barcode-outline" size={20} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.infoText}>{quotation.name}</Text>
                </View>
                <View style={styles.infoRow}>
                    <Ionicons name="business-outline" size={20} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.infoText}>{quotation.company || 'White & Co.'}</Text>
                </View>
            </Animated.View>

            {/* New Summary Card (Date & Amount) */}
            <Animated.View entering={FadeInUp.delay(150).springify()} style={styles.summaryCard}>
                <View style={styles.dateRow}>
                    <View style={styles.dateItem}>
                        <View style={styles.dateLabelRow}>
                            <Ionicons name="calendar-outline" size={16} color="#8E8E93" />
                            <Text style={styles.dateLabel}>Date</Text>
                        </View>
                        <Text style={styles.dateValue}>{quotation.transaction_date}</Text>
                    </View>
                    <View style={styles.verticalDivider} />
                    <View style={styles.dateItem}>
                        <View style={styles.dateLabelRow}>
                            <Ionicons name="time-outline" size={16} color="#8E8E93" />
                            <Text style={styles.dateLabel}>Valid Till</Text>
                        </View>
                        <Text style={styles.dateValue}>{quotation.valid_till}</Text>
                    </View>
                </View>

                <View style={styles.greenAmountCard}>
                    <View style={styles.amountLabelRow}>
                        <View style={styles.greenIconBox}>
                            <Ionicons name="wallet-outline" size={18} color="#28C76F" />
                        </View>
                        <Text style={styles.greenLabel}>Total Amount</Text>
                    </View>
                    <Text style={styles.greenAmountValue}>{quotation.currency} {quotation.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                </View>
            </Animated.View>

            {/* Basic Information */}
            <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrapper}>
                        <Ionicons name="information-circle-outline" size={20} color="#0056D2" />
                        <Text style={styles.sectionTitle}>Basic Information</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                {/* Transaction Date and Valid Till removed from here as they are now in the summary card */}

                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Title</Text>
                    <Text style={[styles.value, { maxWidth: '60%', textAlign: 'right' }]} numberOfLines={2}>{quotation.customer_name}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Order Type</Text>
                    <Text style={styles.value}>{quotation.order_type || 'Sales'}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Currency</Text>
                    <Text style={styles.value}>{quotation.currency}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Price List</Text>
                    <Text style={styles.value}>{quotation.price_list_name || 'Standard Selling'}</Text>
                </View>
            </Animated.View>

            {/* Items Section */}
            <Animated.View entering={FadeInUp.delay(300).springify()} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrapper}>
                        <Ionicons name="cube-outline" size={20} color="#0056D2" />
                        <Text style={styles.sectionTitle}>Items</Text>
                    </View>
                    <View style={styles.badgeCount}>
                        <Text style={styles.badgeCountText}>{quotation.items.length}</Text>
                    </View>
                </View>

                {quotation.items.map((item, index) => (
                    <View key={index} style={styles.itemCard}>
                        <View style={styles.itemHeader}>
                            <View style={styles.itemIndex}>
                                <Text style={styles.itemIndexText}>{index + 1}</Text>
                            </View>
                            <View style={styles.itemContent}>
                                <Text style={styles.itemTitle}>{item.item_name}</Text>
                                <Text style={styles.itemCode}>{item.item_code}</Text>
                                <Text style={styles.itemDesc} numberOfLines={3}>{stripHtml(item.description)}</Text>
                            </View>
                        </View>

                        <View style={styles.itemGrid}>
                            <View style={styles.gridItem}>
                                <View style={styles.gridLabel}>
                                    <Ionicons name="basket-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                                    <Text style={{ color: '#8E8E93', fontSize: 11 }}>Quantity</Text>
                                </View>
                                <Text style={styles.gridValue}>{item.qty} Nos</Text>
                            </View>
                            <View style={styles.gridItem}>
                                <View style={styles.gridLabel}>
                                    <Ionicons name="cash-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                                    <Text style={{ color: '#8E8E93', fontSize: 11 }}>Rate</Text>
                                </View>
                                <Text style={styles.gridValue}>{quotation.currency} {item.rate.toFixed(2)}</Text>
                            </View>
                            <View style={styles.gridItem}>
                                <View style={styles.gridLabel}>
                                    <Ionicons name="pricetag-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                                    <Text style={{ color: '#8E8E93', fontSize: 11 }}>Brand</Text>
                                </View>
                                <Text style={styles.gridValue}>{item.brand || 'N/A'}</Text>
                            </View>
                            <View style={styles.gridItem}>
                                <View style={styles.gridLabel}>
                                    <Ionicons name="wallet-outline" size={12} color="#8E8E93" style={{ marginRight: 4 }} />
                                    <Text style={{ color: '#8E8E93', fontSize: 11 }}>Amount</Text>
                                </View>
                                <Text style={[styles.gridValue, styles.gridValueBlue]}>{quotation.currency} {item.amount.toFixed(2)}</Text>
                            </View>
                        </View>
                    </View>
                ))}
            </Animated.View>

            {/* Payment Schedule Section */}
            <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrapper}>
                        <Ionicons name="card-outline" size={20} color="#0056D2" />
                        <Text style={styles.sectionTitle}>Payment Schedule</Text>
                    </View>
                </View>

                {quotation.payment_schedule && quotation.payment_schedule.map((term, index) => (
                    <View key={index} style={styles.paymentCard}>
                        <View style={styles.paymentRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="calendar-outline" size={16} color="#666" style={{ marginRight: 8 }} />
                                <Text style={styles.paymentLabel}>Due Date</Text>
                            </View>
                            <Text style={styles.value}>{term.due_date}</Text>
                        </View>

                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Invoice Portion</Text>
                            <Text style={styles.value}>{term.invoice_portion}%</Text>
                        </View>

                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Payment Amount</Text>
                            <Text style={styles.paymentValueBlue}>{quotation.currency} {term.payment_amount.toFixed(2)}</Text>
                        </View>

                        <View style={[styles.paymentRow, { marginBottom: 0 }]}>
                            <Text style={styles.paymentLabel}>Outstanding</Text>
                            <Text style={styles.paymentValueRed}>{quotation.currency} {(term.outstanding || term.payment_amount).toFixed(2)}</Text>
                        </View>
                    </View>
                ))}

                {(!quotation.payment_schedule || quotation.payment_schedule.length === 0) && (
                    <Text style={{ color: '#999', textAlign: 'center', fontStyle: 'italic' }}>No payment schedule found.</Text>
                )}
            </Animated.View>

            {/* Contact Details Section */}
            <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrapper}>
                        <Ionicons name="id-card-outline" size={20} color="#0056D2" />
                        <Text style={styles.sectionTitle}>Contact Details</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.contactRow}>
                    <View style={styles.contactIcon}><Ionicons name="person-outline" size={20} color="#666" /></View>
                    <View style={styles.contactInfo}>
                        <Text style={styles.contactLabel}>Team Member</Text>
                        <Text style={styles.contactValue}>{quotation.team_member || 'N/A'}</Text>
                    </View>
                </View>

                <View style={styles.contactRow}>
                    <View style={styles.contactIcon}><Ionicons name="briefcase-outline" size={20} color="#666" /></View>
                    <View style={styles.contactInfo}>
                        <Text style={styles.contactLabel}>Designation</Text>
                        <Text style={styles.contactValue}>{quotation.designation || 'N/A'}</Text>
                    </View>
                </View>

                <View style={styles.contactRow}>
                    <View style={styles.contactIcon}><Ionicons name="call-outline" size={20} color="#666" /></View>
                    <View style={styles.contactInfo}>
                        <Text style={styles.contactLabel}>Phone No</Text>
                        <Text style={styles.contactValue}>{quotation.phone_no || 'N/A'}</Text>
                    </View>
                </View>

                <View style={[styles.contactRow, { marginBottom: 0 }]}>
                    <View style={styles.contactIcon}><Ionicons name="mail-outline" size={20} color="#666" /></View>
                    <View style={styles.contactInfo}>
                        <Text style={styles.contactLabel}>Email ID</Text>
                        <Text style={[styles.contactValue, { fontSize: 13 }]} numberOfLines={1}>{quotation.email_id || quotation.owner}</Text>
                    </View>
                </View>
            </Animated.View>

            {/* Financial Summary */}
            <Animated.View entering={FadeInUp.delay(600).springify()} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleWrapper}>
                        <Ionicons name="wallet-outline" size={20} color="#0056D2" />
                        <Text style={styles.sectionTitle}>Financial Summary</Text>
                    </View>
                </View>
                <View style={styles.divider} />

                <View style={styles.row}>
                    <View style={styles.rowLabelGroup}>
                        <Ionicons name="cart-outline" size={18} color="#8E8E93" />
                        <Text style={styles.label}>Total Quantity</Text>
                    </View>
                    <Text style={styles.value}>{quotation.total_qty} items</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Net Total</Text>
                    <Text style={styles.value}>{quotation.currency} {quotation.net_total?.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                    <Text style={[styles.label, { marginLeft: 26 }]}>Total Taxes</Text>
                    <Text style={styles.value}>{quotation.currency} {quotation.total_taxes_and_charges?.toFixed(2)}</Text>
                </View>

                {/* Grand Total Bar */}
                <View style={styles.grandTotalContainer}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>{quotation.currency} {quotation.grand_total?.toFixed(2)}</Text>
                </View>

                <View style={styles.wordAmountContainer}>
                    <Text style={styles.wordAmount}>INR Two Lakh, Forty Three Thousand And Eighty only.</Text>
                </View>
            </Animated.View>

            {/* Dynamic Action Buttons */}
            {quotation && (
                <View style={styles.actionContainer}>
                    <Animated.View entering={FadeInUp.delay(700).springify()}>
                        {actionLoading ? (
                            <ActivityIndicator color="#0056D2" />
                        ) : (
                            <View style={styles.actionButtonRow}>
                                {WORKFLOW_RULES
                                    .filter(rule => rule.state === (quotation.workflow_state || quotation.status)) // Match current state
                                    .filter(rule => {
                                        // Check if user has ANY of the allowed roles
                                        // Also allow 'Administrator' or 'System Manager' by default if you want, but explicit list is better
                                        const hasPermission = rule.allowedRoles.some(role => userRoles.includes(role));
                                        return hasPermission || userRoles.includes('Administrator');
                                    })
                                    .map((rule, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.actionButton,
                                                rule.style === 'success' ? styles.approveButton :
                                                    rule.style === 'danger' ? styles.rejectButton :
                                                        rule.style === 'warning' ? styles.warningButton :
                                                            styles.primaryButton
                                            ]}
                                            onPress={() => {
                                                if (rule.style === 'danger') {
                                                    Alert.alert(
                                                        `${rule.action} Quotation`,
                                                        `Are you sure you want to ${rule.action.toLowerCase()} this quotation?`,
                                                        [
                                                            { text: 'Cancel', style: 'cancel' },
                                                            { text: 'Confirm', style: 'destructive', onPress: () => handleWorkflowAction(rule.action, rule.nextState) }
                                                        ]
                                                    );
                                                } else {
                                                    handleWorkflowAction(rule.action, rule.nextState);
                                                }
                                            }}
                                        >
                                            <Ionicons name={rule.icon as any} size={20} color="#FFF" style={{ marginRight: 8 }} />
                                            <Text style={styles.actionButtonText}>{rule.action}</Text>
                                        </TouchableOpacity>
                                    ))}
                            </View>
                        )}
                    </Animated.View>
                </View>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F7',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        backgroundColor: '#0056D2',
        paddingTop: 60,
        paddingBottom: 10,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
    },
    backButton: {
        padding: 4,
    },
    blueCard: {
        backgroundColor: '#0056D2',
        margin: 20,
        marginTop: 10,
        borderRadius: 24,
        padding: 24,
        shadowColor: '#0056D2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    blueCardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    blueCardId: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
    },
    openBadge: {
        backgroundColor: '#FFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    openBadgeText: {
        color: '#0056D2',
        fontWeight: 'bold',
        fontSize: 12,
    },
    statusRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    statusPillText: {
        color: '#FFF',
        marginLeft: 6,
        fontWeight: '500',
    },
    // Summary Card Styles
    summaryCard: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
    },
    dateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    dateItem: {
        flex: 1,
    },
    verticalDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#F0F0F0',
        marginHorizontal: 16,
    },
    dateLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 6,
    },
    dateLabel: {
        color: '#8E8E93',
        fontSize: 12,
        fontWeight: '600',
    },
    dateValue: {
        color: '#1C1C1E',
        fontSize: 15,
        fontWeight: '700',
        paddingLeft: 22, // Align with text start approx
    },
    greenAmountCard: {
        backgroundColor: '#E8FDF3', // Light Green bg
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#C6F6D5',
    },
    amountLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    greenIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#C6F6D5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    greenLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1C1C1E',
    },
    greenAmountValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#28C76F',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    infoText: {
        color: '#FFF',
        marginLeft: 8,
        fontSize: 16,
    },
    section: {
        backgroundColor: '#FFF',
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    sectionTitleWrapper: { // New wrapper for title + icon
        flexDirection: 'row',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1C1C1E',
        marginLeft: 8,
    },
    badgeCount: {
        backgroundColor: '#0056D2',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeCountText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: '#F2F2F7',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    rowLabelGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    label: {
        fontSize: 14,
        color: '#8E8E93',
    },
    value: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1C1C1E',
    },
    // Item Card Styles
    itemCard: {
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E9ECEF',
    },
    itemHeader: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    itemIndex: {
        backgroundColor: '#0056D2',
        width: 28,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    itemIndexText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1C1C1E',
        marginBottom: 4,
    },
    itemCode: {
        fontSize: 12,
        color: '#8E8E93',
        marginBottom: 8,
    },
    itemDesc: {
        fontSize: 12,
        color: '#666',
        lineHeight: 18,
        marginBottom: 12,
    },
    itemGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    gridItem: {
        width: '45%',
        marginBottom: 8,
    },
    gridLabel: {
        fontSize: 11,
        color: '#8E8E93',
        marginBottom: 2,
        flexDirection: 'row',
        alignItems: 'center',
    },
    gridValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1C1C1E',
    },
    gridValueBlue: {
        color: '#0056D2',
    },
    // Payment Schedule
    paymentCard: {
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        padding: 16,
    },
    paymentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    paymentLabel: {
        fontSize: 13,
        color: '#666',
    },
    paymentValueBlue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0056D2',
    },
    paymentValueRed: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#EA5455',
    },
    // Contact Details
    contactRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'center',
    },
    contactIcon: {
        width: 32,
        alignItems: 'center',
        marginRight: 12
    },
    contactInfo: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    contactLabel: {
        fontSize: 14,
        color: '#8E8E93',
    },
    contactValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1C1C1E',
        textAlign: 'right',
    },
    // Financials
    grandTotalContainer: {
        backgroundColor: '#EEF2FF',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    grandTotalLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#1C1C1E',
    },
    grandTotalValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0056D2',
    },
    wordAmountContainer: {
        marginTop: 12,
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    wordAmount: {
        color: '#666',
        fontSize: 12,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    // Action Buttons
    actionContainer: {
        paddingHorizontal: 20,
        marginBottom: 40,
    },
    actionButtonRow: {
        flexDirection: 'row',
        gap: 16,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        height: 50,
        borderRadius: 30, // Pill shape
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    rejectButton: {
        backgroundColor: '#EA5455', // Vibrant Red
        shadowColor: '#EA5455',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    approveButton: {
        backgroundColor: '#28C76F',
        shadowColor: '#28C76F',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    primaryButton: {
        backgroundColor: '#0056D2',
        borderColor: '#0056D2',
    },
    warningButton: {
        backgroundColor: '#FF9F43',
        borderColor: '#FF9F43',
    },
});
