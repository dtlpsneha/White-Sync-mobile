import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiGet, apiPost } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Modal,
    Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Customer {
    name: string;
    customer_name: string;
    customer_group?: string;
    territory?: string;
    customer_primary_address?: string;
    customer_primary_contact?: string;
}

interface Item {
    name: string;
    item_name: string;
    description?: string;
}

interface Contact {
    name: string;
    first_name: string;
    last_name?: string;
    email_id?: string;
    mobile_no?: string;
}



export default function CreateMaintenanceScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    // Form States
    const [form, setForm] = useState({
        customer: '',
        customer_name: '',
        maintenance_type: 'Unscheduled',
        mntc_date: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        mntc_time: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0') + ' ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'Draft',
        location: '',
        customer_address: '',
        new_customer_name: '',
        date_and_time: '',
        purposes: [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '' }],
        territory: '',
        customer_feedback: '',
        company: 'White & Co.',
        completion_status: 'Partially Completed',
        contact_person: '',
        customer_group: '',
        // New fields
        follow_up_required: 0,
        follow_up_due_date: '',
        follow_up_notes: '',
        follow_up_type: '',
        follow_up_status: 'Open',
        follow_up_owner: '',
        contact_email: '',
        contact_mobile: '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'from' | 'to' | 'location' | null>(null);

    // Search States
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerQuery, setCustomerQuery] = useState('');
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
    const [showCustomerResults, setShowCustomerResults] = useState(false);

    // Item Search States
    const [items, setItems] = useState<Item[]>([]);
    const [isSearchingItem, setIsSearchingItem] = useState(false);
    const [activeItemSearchIndex, setActiveItemSearchIndex] = useState<number | null>(null);
    const [showItemResults, setShowItemResults] = useState(false);

    // Contact Search States
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isSearchingContact, setIsSearchingContact] = useState(false);
    const [showContactResults, setShowContactResults] = useState(false);
    const [contactQuery, setContactQuery] = useState('');
    const [searchError, setSearchError] = useState<string | null>(null);

    // Dropdown states
    const [selectionModal, setSelectionModal] = useState<{
        visible: boolean;
        title: string;
        options: string[];
        onSelect: (value: string) => void;
        selectedValue: string;
    }>({
        visible: false,
        title: '',
        options: [],
        onSelect: () => { },
        selectedValue: ''
    });

    const updateForm = (key: string, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        const loadDefaultFollowUpOwner = async () => {
            try {
                const email = await SecureStore.getItemAsync('user_email');
                if (email) {
                    updateForm('follow_up_owner', email);
                }
            } catch (e) {
                console.warn('Default Follow-up Owner load failed:', e);
            }
        };
        loadDefaultFollowUpOwner();
    }, []);

    const handleMaintenanceTypeChange = (type: string) => {
        setForm(prev => ({
            ...prev,
            maintenance_type: type,
            // Clear relevant fields when switching
            customer: '',
            customer_name: '',
            new_customer_name: '',
            address_and_contact: ''
        }));
        setCustomerQuery('');
    };

    const addPurposeRow = () => {
        setForm(prev => ({
            ...prev,
            purposes: [...prev.purposes, { item_code: '', item_name: '', description: '', work_done: '', service_person: '' }]
        }));
    };

    const updatePurposeRow = (index: number, key: string, value: string) => {
        setForm(prev => {
            const newPurposes = [...prev.purposes];
            newPurposes[index] = { ...newPurposes[index], [key]: value };

            // Trigger item search if item_code is changed
            if (key === 'item_code') {
                if (value.length > 2) {
                    setActiveItemSearchIndex(index);
                    fetchItems(value);
                } else {
                    if (activeItemSearchIndex === index) {
                        setShowItemResults(false);
                    }
                }
            }

            return { ...prev, purposes: newPurposes };
        });
    };

    const removePurposeRow = (index: number) => {
        if (form.purposes.length > 1) {
            setForm(prev => {
                const newPurposes = prev.purposes.filter((_, i) => i !== index);
                return { ...prev, purposes: newPurposes };
            });
        }
    };

    const fetchCustomers = async (query: string = '') => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            setCustomers([]);
            setShowCustomerResults(false);
            return;
        }
        setIsSearchingCustomer(true);
        setSearchError(null);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            // Use frappe.client.get_list — a whitelisted endpoint with simple params
            const params = new URLSearchParams({
                doctype: 'Customer',
                txt: trimmedQuery,
                fields: JSON.stringify(["name", "customer_name", "territory", "customer_primary_address", "customer_primary_contact", "customer_group"]),
                filters: JSON.stringify([["customer_name", "like", `%${trimmedQuery}%`]]),
                limit_page_length: '15',
            });

            const url = `http://13.234.62.39:8080/api/method/frappe.client.get_list?${params.toString()}`;
            console.log('[fetchCustomers] URL:', url);
            const res = await apiGet(url, sessionCookies);
            console.log('[fetchCustomers] Status:', res.status, 'Data:', JSON.stringify(res.data)?.substring(0, 200));

            if (res.ok) {
                setCustomers(res.data?.message || res.data?.data || []);
                setShowCustomerResults(true);
            } else {
                console.error('Customer Fetch Error:', res.status, res.data);
                setSearchError(`Server error (${res.status}). Please try again.`);
                setCustomers([]);
                setShowCustomerResults(true);
            }
        } catch (err) {
            console.warn('Customer Fetch Failed:', err);
            setSearchError('Network error. Please check your connection.');
            setCustomers([]);
            setShowCustomerResults(true);
        } finally {
            setIsSearchingCustomer(false);
        }
    };



    const fetchContacts = async (customerName: string, query: string = '') => {
        const trimmedQuery = query.trim();
        if (!customerName) return;
        setIsSearchingContact(true);
        setSearchError(null);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const fields = ["name", "first_name", "last_name", "email_id", "mobile_no"];
            const filters: any[] = [
                ["Dynamic Link", "link_name", "=", customerName],
                ["Dynamic Link", "link_doctype", "=", "Customer"]
            ];

            if (trimmedQuery) {
                filters.push(["first_name", "like", `%${encodeURIComponent(trimmedQuery)}%`]);
            }

            const url = `http://13.234.62.39:8080/api/method/frappe.client.get_list?doctype=Contact&fields=${encodeURIComponent(JSON.stringify(fields))}&filters=${encodeURIComponent(JSON.stringify(filters))}&limit_page_length=20`;
            const res = await apiGet(url, sessionCookies);

            if (res.ok) {
                const data = res.data?.message || res.data?.data || [];
                setContacts(data);
                setShowContactResults(true);
            } else {
                setSearchError(`Server error (${res.status})`);
                setContacts([]);
                setShowContactResults(true);
            }
        } catch (err) {
            console.warn('Contact Fetch Failed:', err);
            setSearchError('Network error');
            setContacts([]);
            setShowContactResults(true);
        } finally {
            setIsSearchingContact(false);
        }
    };

    const selectContact = (c: Contact) => {
        const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
        updateForm('contact_person', fullName);
        updateForm('contact_email', c.email_id || '');
        updateForm('contact_mobile', c.mobile_no || '');
        setContactQuery(fullName);
        setShowContactResults(false);
    };

    const fetchItems = async (query: string = '') => {
        const trimmedQuery = query.trim();
        setIsSearchingItem(true);
        setSearchError(null);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const fields = ["name", "item_name", "description"];
            const filters = JSON.stringify([["disabled", "=", 0], ["has_variants", "=", 0]]);
            const or_filters = trimmedQuery ? JSON.stringify([
                ["item_code", "like", `%${trimmedQuery}%`],
                ["item_name", "like", `%${trimmedQuery}%`]
            ]) : "[]";

            const url = `http://13.234.62.39:8080/api/resource/Item?fields=${encodeURIComponent(JSON.stringify(fields))}&filters=${encodeURIComponent(filters)}${trimmedQuery ? `&or_filters=${encodeURIComponent(or_filters)}` : ''}&limit_page_length=15`;
            const res = await apiGet(url, sessionCookies);

            if (res.ok) {
                setItems(res.data?.data || []);
                setShowItemResults(true);
            } else {
                setSearchError(`Server error (${res.status})`);
                setItems([]);
                setShowItemResults(true);
            }
        } catch (err) {
            console.warn('Item Fetch Failed:', err);
            setSearchError('Network error');
            setItems([]);
            setShowItemResults(true);
        } finally {
            setIsSearchingItem(false);
        }
    };

    const selectItem = (item: Item, index: number) => {
        setForm(prev => {
            const newPurposes = [...prev.purposes];
            // Remove HTML tags from description if present
            const cleanDescription = item.description ? item.description.replace(/<[^>]*>/g, '') : '';

            newPurposes[index] = {
                ...newPurposes[index],
                item_code: item.name,
                item_name: item.item_name,
                description: cleanDescription
            };
            return { ...prev, purposes: newPurposes };
        });
        setShowItemResults(false);
        setActiveItemSearchIndex(null);
    };

    const fetchAddressAndContact = async (customerName: string, addressName?: string, contactName?: string) => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            // Fetch Address display if name exists
            if (addressName) {
                const addrRes = await apiGet(
                    `http://13.234.62.39:8080/api/resource/Address/${encodeURIComponent(addressName)}?fields=${encodeURIComponent('["display"]')}`,
                    sessionCookies
                );
                if (addrRes.ok) {
                    updateForm('customer_address', addrRes.data?.data?.display || '');
                }
            }

            // Fetch Contact display if name exists
            if (contactName) {
                const contRes = await apiGet(
                    `http://13.234.62.39:8080/api/resource/Contact/${encodeURIComponent(contactName)}?fields=${encodeURIComponent('["first_name","last_name","email_id","mobile_no"]')}`,
                    sessionCookies
                );
                if (contRes.ok) {
                    const c = contRes.data?.data || {};
                    const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || c.full_name || '';
                    updateForm('contact_person', fullName);
                    updateForm('contact_email', c.email_id || '');
                    updateForm('contact_mobile', c.mobile_no || '');
                    setContactQuery(fullName);
                }
            }
        } catch (err) {
            console.warn('Auto-fetch failed:', err);
        }
    };

    const selectCustomer = (c: Customer) => {
        setForm(prev => ({
            ...prev,
            customer: c.name,
            customer_name: c.customer_name,
            customer_address: '',
            territory: c.territory || '',
            customer_group: c.customer_group || '',
            contact_person: ''
        }));
        setCustomerQuery(c.customer_name);
        setContactQuery('');
        setContacts([]);
        setShowCustomerResults(false);

        // Fetch deeper details if needed
        fetchAddressAndContact(c.name, c.customer_primary_address, c.customer_primary_contact);
    };



    useEffect(() => {
        if (customerQuery.length > 2 && customerQuery !== form.customer_name) {
            const delayDebounceFn = setTimeout(() => fetchCustomers(customerQuery), 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [customerQuery]);


    // Fix: Using a ref for debouncing to handle multiple rows correctly
    const searchTimers = React.useRef<{ [key: number]: any }>({});

    // Simplified effect for purposes - no contact searching needed for now
    useEffect(() => {
        // Purposes logic
    }, [form.purposes]);

    const getCurrentLocation = async () => {
        setIsLocating(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Allow location access to tag this record.');
                return;
            }

            const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
            });
            const [address] = await Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude
            });

            let addressStr = `${loc.coords.latitude}, ${loc.coords.longitude}`;
            if (address) {
                const parts = [address.name, address.street, address.district, address.city, address.region, address.postalCode].filter(Boolean);
                addressStr = parts.join(', ');
            }

            const now = new Date();
            const timestamp = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');
            setForm(prev => ({ ...prev, location: addressStr, date_and_time: timestamp }));
        } catch (err: any) {
            console.warn('Location Fetch Failed:', err);
            let errorMessage = 'Could not fetch location.';
            if (err.message?.includes('unsatisfied device settings')) {
                errorMessage = 'Location requested failed. Please ensure GPS is enabled on your device.';
            } else if (err.message?.includes('Timeout')) {
                errorMessage = 'Location request timed out. Please try again.';
            }
            Alert.alert('Location Error', errorMessage);
        } finally {
            setIsLocating(false);
        }
    };

    useEffect(() => {
        getCurrentLocation();
    }, []);

    const handleSave = async () => {
        if (!form.customer) {
            Alert.alert("Missing Info", "Please select a customer.");
            return;
        }

        setIsSaving(true);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const salesExecId = form.follow_up_owner;

            const purposes_payload = form.purposes
                .filter(row => row.item_code.trim() !== '')
                .map(row => ({
                    doctype: 'Maintenance Visit Purpose',
                    item_code: row.item_code,
                    item_name: row.item_name || row.item_code,
                    description: row.description || row.item_name || row.item_code,
                    work_done: row.work_done,
                    service_person: row.service_person || form.follow_up_owner
                }));

            if (purposes_payload.length === 0) {
                Alert.alert("Missing Info", "Please add at least one item to the Purpose table.");
                setIsSaving(false);
                return;
            }

            const payloadData = {
                doctype: 'Maintenance Visit',
                customer: form.customer,
                customer_name: form.customer_name,
                customer_group: form.customer_group,
                maintenance_type: form.maintenance_type,
                customer_address: form.customer_address,
                mntc_date: form.date_and_time ? form.date_and_time.split(' ')[0] : '',
                mntc_time: form.date_and_time ? form.date_and_time.split(' ')[1] : '',
                status: form.status,
                contact_person: form.contact_person,
                territory: form.territory,
                customer_feedback: form.customer_feedback,
                company: form.company,
                completion_status: form.completion_status,
                purposes: purposes_payload,
                maintenance_visit_purposes: purposes_payload,
                location: form.location || '',
                date_and_time: form.date_and_time,
                follow_up_required: String(form.follow_up_required),
                follow_up_due_date: form.follow_up_due_date,
                follow_up_notes: form.follow_up_notes,
                follow_up_type: form.follow_up_type,
                follow_up_status: form.follow_up_status,
                follow_up_owner: form.follow_up_owner || salesExecId,
                contact_email: form.contact_email,
                contact_mobile: form.contact_mobile,
            };

            const payload = {
                customer: form.customer,
                customer_name: form.customer_name,
                customer_group: form.customer_group,
                maintenance_type: form.maintenance_type,
                customer_address: form.customer_address,
                mntc_date: form.date_and_time ? form.date_and_time.split(' ')[0] : '',
                mntc_time: form.date_and_time ? form.date_and_time.split(' ')[1] : '',
                status: form.status,
                contact_person: form.contact_person,
                territory: form.territory,
                customer_feedback: form.customer_feedback,
                company: form.company,
                completion_status: form.completion_status,
                purposes: purposes_payload,
                location: form.location || '',
                date_and_time: form.date_and_time,
                follow_up_required: form.follow_up_required ? 1 : 0,
                follow_up_due_date: form.follow_up_due_date,
                follow_up_notes: form.follow_up_notes,
                follow_up_type: form.follow_up_type,
                follow_up_status: form.follow_up_status,
                follow_up_owner: form.follow_up_owner || salesExecId,
                contact_email: form.contact_email,
                contact_mobile: form.contact_mobile,
            };

            const res = await apiPost(`http://13.234.62.39:8080/api/resource/Maintenance%20Visit`, payload, sessionCookies);

            if (!res.ok) {
                let serverMsg = res.data?.message || res.data?._server_messages || 'Creation failed';
                if (typeof serverMsg === 'object') {
                    serverMsg = JSON.stringify(serverMsg);
                }
                console.error('Server Error:', res.data);
                throw new Error(serverMsg);
            }

            Alert.alert("Success", "Maintenance record created.", [{ text: "OK", onPress: () => router.back() }]);
        } catch (err) {
            console.error('Save Catch Block:', err);
            const msg = (err && typeof err === 'object' && 'message' in err) ? String((err as any).message) : JSON.stringify(err);
            Alert.alert("Sync Error", msg);
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            const normalized = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
            const d = new Date(normalized);
            if (isNaN(d.getTime())) return dateStr;

            const datePart = d.toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            const timePart = d.toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true
            });
            return `${datePart}, ${timePart}`;
        } catch (e) { return dateStr; }
    };

    const getTimeOnly = (dt: string) => {
        if (!dt || typeof dt !== 'string') return '-';
        const parts = dt.split(/[ T]/);
        return parts.length > 1 ? parts[1].split('.')[0] : dt;
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <View
                style={[styles.headerGradient, { backgroundColor: isDark ? '#1E293B' : '#4F46E5' }]}
            >
                <SafeAreaView>
                    <View style={styles.header}>
                        <View style={styles.headerContent}>
                            <TouchableOpacity
                                style={styles.backButton}
                                onPress={() => router.back()}
                            >
                                <Ionicons name="chevron-back" size={24} color="#FFF" />
                            </TouchableOpacity>
                            <View style={styles.headerText}>
                                <Text style={styles.headerTitle}>Add Visit</Text>
                                <Text style={styles.headerSubtitle}>Create new maintenance record</Text>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <ScrollView
                style={styles.scrollContent}
                contentContainerStyle={styles.scrollInner}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    {/* 1. Customer & Schedule */}
                    <Section title="Customer & Schedule" icon="calendar">
                        {(form.maintenance_type === 'Existing' || form.maintenance_type === 'Scheduled' || form.maintenance_type === 'Unscheduled') && (
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer *</Text>
                                <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showCustomerResults && styles.searchBoxActive]}>
                                    <Ionicons name="search" size={18} color={colors.primary} />
                                    <TextInput
                                        style={[styles.searchInput, { color: colors.text }]}
                                        placeholder="Search customer..."
                                        placeholderTextColor={colors.textSecondary}
                                        value={customerQuery}
                                        onChangeText={setCustomerQuery}
                                        onFocus={() => customerQuery.length > 2 && setShowCustomerResults(true)}
                                    />
                                    {isSearchingCustomer && <ActivityIndicator size="small" color={colors.primary} />}
                                </View>
                                {showCustomerResults && customerQuery.length > 2 && !isSearchingCustomer && (customers.length === 0 || searchError) && (
                                    <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center', gap: 12 }]}>
                                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                                            <Ionicons name={searchError ? "alert-circle-outline" : "search-outline"} size={24} color={searchError ? colors.danger : colors.textSecondary} />
                                        </View>
                                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "No match found"}</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                                            {searchError || `We couldn't find any customers matching "${customerQuery}"`}
                                        </Text>
                                    </View>
                                )}
                                {showCustomerResults && customers.length > 0 && (
                                    <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                        <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                            {customers.map((c, i) => (
                                                <TouchableOpacity
                                                    key={c.name}
                                                    style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === customers.length - 1 ? 0 : 1 }]}
                                                    onPress={() => selectCustomer(c)}
                                                >
                                                    <LinearGradient colors={isDark ? ['#4F46E5', '#3730A3'] : ['#EEF2FF', '#E0E7FF']} style={styles.resultIconBox}>
                                                        <Ionicons name="business" size={18} color={isDark ? '#FFF' : colors.primary} />
                                                    </LinearGradient>
                                                    <View style={{ flex: 1, gap: 4 }}>
                                                        <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{c.customer_name}</Text>
                                                        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                                            <Text style={[styles.resultId, { color: colors.textSecondary }]}>{c.name}</Text>
                                                            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.textSecondary, opacity: 0.3 }} />
                                                            <Text style={[styles.resultId, { color: colors.primary }]}>{c.customer_group}</Text>
                                                        </View>
                                                        {c.territory && (
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                                <Ionicons name="location-outline" size={12} color={colors.textSecondary} />
                                                                <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '500' }}>{c.territory}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Ionicons name="chevron-forward" size={16} color={colors.border} />
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                        )
                        }

                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Date *</Text>
                                <TouchableOpacity
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                    onPress={() => setDatePickerMode('from')}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: form.mntc_date ? colors.text : colors.textSecondary }}>
                                            {form.mntc_date.split(' ')[0]}
                                        </Text>
                                        <Ionicons name="calendar-clear-outline" size={18} color={colors.primary} />
                                    </View>
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Time *</Text>
                                <TouchableOpacity
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                    onPress={() => setDatePickerMode('to')}
                                >
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={{ color: form.mntc_time ? colors.text : colors.textSecondary }}>
                                            {getTimeOnly(form.mntc_time)}
                                        </Text>
                                        <Ionicons name="time-outline" size={18} color={colors.primary} />
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Section >

                    {/* 2. Follow Up */}
                    < Section title="Follow Up" icon="notifications" >
                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Follow Up Required</Text>
                            <View style={styles.chipRow}>
                                {[
                                    { label: 'Yes', value: 1 },
                                    { label: 'No', value: 0 }
                                ].map(opt => (
                                    <TouchableOpacity
                                        key={opt.label}
                                        style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border, flex: 1, alignItems: 'center' }, form.follow_up_required === opt.value && { backgroundColor: isDark ? '#334155' : '#EEF2FF', borderColor: colors.primary }]}
                                        onPress={() => updateForm('follow_up_required', opt.value)}
                                    >
                                        <Text style={[styles.chipText, { color: colors.textSecondary }, form.follow_up_required === opt.value && { color: colors.primary }]}>{opt.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {
                            form.follow_up_required === 1 && (
                                <View style={{ gap: 16, marginTop: 8 }}>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Type *</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_type}
                                                onChangeText={t => updateForm('follow_up_type', t)}
                                                placeholder="e.g. Service"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Due Date *</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_due_date}
                                                onChangeText={t => updateForm('follow_up_due_date', t)}
                                                placeholder="YYYY-MM-DD"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Status</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_status}
                                                onChangeText={t => updateForm('follow_up_status', t)}
                                                placeholder="Open"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Owner *</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_owner}
                                                onChangeText={t => updateForm('follow_up_owner', t)}
                                                placeholder="Owner Email"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Notes</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                            value={form.follow_up_notes}
                                            onChangeText={t => updateForm('follow_up_notes', t)}
                                            placeholder="Follow-up instructions..."
                                            multiline
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                    </View>
                                </View>
                            )
                        }
                    </Section >

                    {/* 3. Location */}
                    < Section title="Location" icon="pin" >
                        <View style={styles.inputWrapper}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Visit Location</Text>
                                <TouchableOpacity onPress={getCurrentLocation} disabled={isLocating}>
                                    {isLocating ? (
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    ) : (
                                        <Ionicons name="locate" size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            </View>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                value={form.location}
                                onChangeText={t => updateForm('location', t)}
                                placeholder="Coimbatore"
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>

                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date & Time</Text>
                            <TouchableOpacity
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                onPress={() => setDatePickerMode('location')}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Text style={{ fontSize: 15, color: form.date_and_time ? colors.text : colors.textSecondary }}>
                                        {formatDate(form.date_and_time) || 'Select date and time'}
                                    </Text>
                                    <Ionicons name="time-outline" size={20} color={colors.primary} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </Section >

                    {/* 4. Status & Type */}
                    < Section title="Status & Type" icon="options" >
                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Completion Status *</Text>
                                <TouchableOpacity
                                    style={[styles.input, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                    onPress={() => setSelectionModal({
                                        visible: true,
                                        title: 'Select Completion Status',
                                        options: ['Partially Completed', 'Fully Completed'],
                                        selectedValue: form.completion_status,
                                        onSelect: (val: string) => updateForm('completion_status', val)
                                    })}
                                >
                                    <Text style={{ color: form.completion_status ? colors.text : colors.textSecondary }}>
                                        {form.completion_status || 'Select Status'}
                                    </Text>
                                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Type *</Text>
                                <TouchableOpacity
                                    style={[styles.input, { borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                                    onPress={() => setSelectionModal({
                                        visible: true,
                                        title: 'Select Visit Type',
                                        options: ['Unscheduled', 'Scheduled'],
                                        selectedValue: form.maintenance_type,
                                        onSelect: (val: string) => updateForm('maintenance_type', val)
                                    })}
                                >
                                    <Text style={{ color: form.maintenance_type ? colors.text : colors.textSecondary }}>
                                        {form.maintenance_type || 'Select Type'}
                                    </Text>
                                    <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </Section >

                    {/* 5. RFQ (Items) */}
                    < Section title="RFQ" icon="list" >
                        {
                            form.purposes.map((row, index) => (
                                <View key={index} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>ITEM {index + 1}</Text>
                                        {form.purposes.length > 1 && (
                                            <TouchableOpacity
                                                onPress={() => removePurposeRow(index)}
                                                style={styles.trashBtn}
                                            >
                                                <Ionicons name="trash" size={16} color={colors.danger} />
                                            </TouchableOpacity>
                                        )}
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Item Code</Text>
                                        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }, showItemResults && activeItemSearchIndex === index && styles.searchBoxActive]}>
                                            <TextInput
                                                style={[styles.searchInput, { color: colors.text }]}
                                                value={row.item_code}
                                                onChangeText={t => updatePurposeRow(index, 'item_code', t)}
                                                onFocus={() => {
                                                    setActiveItemSearchIndex(index);
                                                    setShowItemResults(true);
                                                    if (items.length === 0 || row.item_code.length > 2) fetchItems(row.item_code);
                                                }}
                                                placeholder="Search items..."
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                            {isSearchingItem && activeItemSearchIndex === index && (
                                                <ActivityIndicator size="small" color={colors.primary} />
                                            )}
                                        </View>
                                        {showItemResults && activeItemSearchIndex === index && row.item_code.length > 2 && !isSearchingItem && (items.length === 0 || searchError) && (
                                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center', gap: 12 }]}>
                                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                                                    <Ionicons name={searchError ? "alert-circle-outline" : "cube-outline"} size={24} color={searchError ? colors.danger : colors.textSecondary} />
                                                </View>
                                                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "Item not found"}</Text>
                                                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                                                    {searchError || `We couldn't find any items matching "${row.item_code}"`}
                                                </Text>
                                            </View>
                                        )}
                                        {showItemResults && activeItemSearchIndex === index && items.length > 0 && (
                                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                                <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                                    {items.map((it, i) => (
                                                        <TouchableOpacity
                                                            key={it.name}
                                                            style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === items.length - 1 ? 0 : 1 }]}
                                                            onPress={() => selectItem(it, index)}
                                                        >
                                                            <LinearGradient colors={isDark ? ['#6366F1', '#4338CA'] : ['#F5F3FF', '#EDE9FE']} style={styles.resultIconBox}>
                                                                <Ionicons name="cube" size={18} color={isDark ? '#FFF' : '#6366F1'} />
                                                            </LinearGradient>
                                                            <View style={{ flex: 1, gap: 2 }}>
                                                                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{it.item_name}</Text>
                                                                <Text style={[styles.resultId, { color: colors.textSecondary }]}>{it.name}</Text>
                                                            </View>
                                                            <Ionicons name="chevron-forward" size={16} color={colors.border} />
                                                        </TouchableOpacity>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Item Name</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                                            value={row.item_name}
                                            onChangeText={t => updatePurposeRow(index, 'item_name', t)}
                                            placeholder="Item Name"
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Description</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, height: 80 }]}
                                            value={row.description}
                                            onChangeText={t => updatePurposeRow(index, 'description', t)}
                                            placeholder="Description"
                                            multiline
                                            placeholderTextColor={colors.textSecondary}
                                        />
                                    </View>
                                </View>
                            ))
                        }

                        < TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary, backgroundColor: isDark ? '#1E293B' : '#F5F7FF' }]} onPress={addPurposeRow} >
                            <Ionicons name="add-circle" size={20} color={colors.primary} />
                            <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Another Item</Text>
                        </TouchableOpacity >
                    </Section >

                    {/* 6. Visit Summary */}
                    < Section title="Visit Summary" icon="document-text" >
                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Discussion Summary</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 100 }]}
                                value={form.customer_feedback}
                                onChangeText={t => updateForm('customer_feedback', t)}
                                placeholder="Enter discussion summary..."
                                multiline
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>
                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Status *</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.status}
                                    onChangeText={t => updateForm('status', t)}
                                    placeholder="Submitted"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Company *</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.company}
                                    onChangeText={t => updateForm('company', t)}
                                    placeholder="White & Co."
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>
                    </Section >

                    {/* 7. Contact Info */}
                    < Section title="Contact Info" icon="person-add" >
                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Address</Text>
                            <TextInput
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                value={form.customer_address}
                                onChangeText={t => updateForm('customer_address', t)}
                                placeholder="Address"
                                multiline
                                placeholderTextColor={colors.textSecondary}
                            />
                        </View>
                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Territory</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.territory}
                                    onChangeText={t => updateForm('territory', t)}
                                    placeholder="Tamil Nadu"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Group</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.customer_group}
                                    onChangeText={t => updateForm('customer_group', t)}
                                    placeholder="All Customer Groups"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>
                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Person</Text>
                            <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showContactResults && styles.searchBoxActive]}>
                                <Ionicons name="person-outline" size={18} color={colors.primary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text }]}
                                    value={contactQuery}
                                    onChangeText={setContactQuery}
                                    onFocus={() => {
                                        if (form.customer) {
                                            setShowContactResults(true);
                                            if (contacts.length === 0) fetchContacts(form.customer, contactQuery);
                                        }
                                    }}
                                    placeholder="Enter or search contact"
                                    placeholderTextColor={colors.textSecondary}
                                />
                                {isSearchingContact && <ActivityIndicator size="small" color={colors.primary} />}
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Email</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.contact_email}
                                    onChangeText={t => updateForm('contact_email', t)}
                                    placeholder="email@example.com"
                                    keyboardType="email-address"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Mobile</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.contact_mobile}
                                    onChangeText={t => updateForm('contact_mobile', t)}
                                    placeholder="+91 ..."
                                    keyboardType="phone-pad"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>
                        {showContactResults && contactQuery.length > 2 && !isSearchingContact && (contacts.length === 0 || searchError) && (
                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center', gap: 12 }]}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                                    <Ionicons name={searchError ? "alert-circle-outline" : "person-outline"} size={24} color={searchError ? colors.danger : colors.textSecondary} />
                                </View>
                                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "Contact not found"}</Text>
                                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                                    {searchError || `We couldn't find any contacts matching "${contactQuery}"`}
                                </Text>
                            </View>
                        )}
                        {showContactResults && contacts.length > 0 && (
                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                    {contacts.map((c, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === contacts.length - 1 ? 0 : 1 }]}
                                            onPress={() => selectContact(c)}
                                        >
                                            <LinearGradient colors={isDark ? ['#0EA5E9', '#0369A1'] : ['#F0F9FF', '#E0F2FE']} style={styles.resultIconBox}>
                                                <Ionicons name="person" size={18} color={isDark ? '#FFF' : '#0EA5E9'} />
                                            </LinearGradient>
                                            <View style={{ flex: 1, gap: 2 }}>
                                                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</Text>
                                                <Text style={[styles.resultId, { color: colors.textSecondary }]}>{c.email_id || 'No email'}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={16} color={colors.border} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </Section >


                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.cancelButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => router.back()}
                        >
                            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveButtonWrapper, { backgroundColor: isDark ? '#1E293B' : '#4F46E5', borderRadius: 16 }]}
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            <View style={styles.saveButton}>
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.saveButtonText}>Create Visit</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView >
            </ScrollView >

            {
                datePickerMode && (
                    <DateTimePicker
                        value={form.date_and_time && datePickerMode === 'location' ? new Date(form.date_and_time.replace(' ', 'T')) : new Date()}
                        mode={datePickerMode === 'location' ? 'datetime' : 'time'}
                        display="default"
                        onChange={(event, date) => {
                            const mode = datePickerMode;
                            setDatePickerMode(null);
                            if (date) {
                                const today = new Date();
                                const datePrefix = (mode === 'location' ? date : today).getFullYear() + '-' + String((mode === 'location' ? date : today).getMonth() + 1).padStart(2, '0') + '-' + String((mode === 'location' ? date : today).getDate()).padStart(2, '0');
                                const timePart = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                updateForm(mode === 'from' ? 'mntc_date' : mode === 'to' ? 'mntc_time' : 'date_and_time', `${datePrefix} ${timePart}`);
                            }
                        }}
                    />
                )
            }

            {/* Selection Modal (Dropdown) */}
            <Modal
                visible={selectionModal.visible}
                transparent
                animationType="fade"
                onRequestClose={() => setSelectionModal({ ...selectionModal, visible: false })}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
                    onPress={() => setSelectionModal({ ...selectionModal, visible: false })}
                >
                    <View style={{
                        width: '100%',
                        backgroundColor: colors.background,
                        borderRadius: 24,
                        padding: 24,
                        gap: 20,
                        elevation: 20,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.3,
                        shadowRadius: 20,
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>{selectionModal.title}</Text>
                            <TouchableOpacity onPress={() => setSelectionModal({ ...selectionModal, visible: false })}>
                                <Ionicons name="close" size={24} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <View style={{ gap: 8 }}>
                            {selectionModal.options.map((option) => (
                                <TouchableOpacity
                                    key={option}
                                    style={{
                                        padding: 16,
                                        borderRadius: 12,
                                        backgroundColor: selectionModal.selectedValue === option ? (isDark ? '#334155' : '#EEF2FF') : 'transparent',
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                    onPress={() => {
                                        selectionModal.onSelect(option);
                                        setSelectionModal({ ...selectionModal, visible: false });
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 15,
                                        fontWeight: '600',
                                        color: selectionModal.selectedValue === option ? colors.primary : colors.text
                                    }}>
                                        {option}
                                    </Text>
                                    {selectionModal.selectedValue === option && (
                                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </Pressable>
            </Modal>
        </View >
    );
}

const Section = ({ title, icon, children, style }: any) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];

    return (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
            <View style={styles.sectionHeader}>
                <LinearGradient
                    colors={[colors.primary, colors.primary + 'CC']}
                    style={styles.sectionIcon}
                >
                    <Ionicons name={icon} size={14} color="#FFF" />
                </LinearGradient>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
            </View>
            <View style={styles.sectionContent}>{children}</View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    headerGradient: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
    header: { paddingHorizontal: 24, paddingVertical: 20 },
    headerContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    scrollContent: { flex: 1 },
    scrollInner: { padding: 20, paddingBottom: 100 },
    section: { borderRadius: 28, padding: 24, marginBottom: 20, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 2 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
    sectionIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    sectionContent: { gap: 16 },
    inputWrapper: { gap: 8 },
    inputLabel: { fontSize: 13, fontWeight: '700', marginLeft: 4, opacity: 0.8 },
    input: { borderRadius: 16, padding: 16, fontSize: 15, minHeight: 56, borderWidth: 1 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, minHeight: 56 },
    searchBoxActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
    searchInput: { flex: 1, paddingVertical: 14, fontSize: 15, marginLeft: 10 },
    resultsContainer: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderWidth: 1.5,
        borderTopWidth: 0,
        maxHeight: 350,
        overflow: 'hidden',
        marginTop: -10,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        zIndex: 2000
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        gap: 16
    },
    resultIconBox: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    resultName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
    resultId: { fontSize: 12, fontWeight: '600' },
    tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    tagText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    row: { flexDirection: 'row', gap: 12 },
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    textArea: { height: 100, textAlignVertical: 'top' },
    itemCard: { padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 12, gap: 12 },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    itemLabel: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
    trashBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(239, 68, 68, 0.1)', justifyContent: 'center', alignItems: 'center' },
    addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, marginTop: 8 },
    addBtnText: { fontSize: 14, fontWeight: '800' },
    buttonRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: { flex: 1, height: 56, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
    cancelButtonText: { fontSize: 15, fontWeight: '800' },
    saveButtonWrapper: { flex: 2, height: 56, borderRadius: 16, overflow: 'hidden', elevation: 4, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
    saveButton: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    saveButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
    // Search specific
    searchResultsDropdown: { position: 'absolute', top: 60, left: 0, right: 0, borderRadius: 16, borderWidth: 1, zIndex: 1000, elevation: 5 },
    searchResultItem: { padding: 16, borderBottomWidth: 1 },
    searchResultTitle: { fontSize: 14, fontWeight: '700' },
    searchResultSubtitle: { fontSize: 12, opacity: 0.6, marginTop: 2 }
});
