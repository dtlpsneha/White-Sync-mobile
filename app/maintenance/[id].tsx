import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiGet, apiPost } from '@/utils/api';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
    StatusBar,
    Modal,
    Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';

interface Customer {
    name: string;
    customer_name: string;
    customer_group?: string;
    territory?: string;
    customer_primary_address?: string;
    customer_primary_contact?: string;
}

interface SalesExecutive {
    name: string;
    sales_person_name: string;
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

export default function MaintenanceDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form fields matching Doctype
    const [form, setForm] = useState({
        name: '',
        customer: '',
        customer_name: '',
        maintenance_type: 'Unscheduled',
        mntc_date: '',
        mntc_time: '',
        customer_address: '',
        purposes: [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '' }],
        location: '',
        date_and_time: '',
        creation: '',
        status: 'Draft',
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
        follow_up_status: '',
        follow_up_owner: '',
        contact_email: '',
        contact_mobile: '',
    });

    // Customer Selection state
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Date Picker States
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);

    // Location States
    const [isLocating, setIsLocating] = useState(false);
    const [showLocationPicker, setShowLocationPicker] = useState(false);


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

    const fetchMaintenanceDetails = async () => {
        setLoading(true);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const res = await apiGet(`http://13.234.62.39:8080/api/method/create_full_visit?name=${id}`, sessionCookies);

            if (!res.ok) throw new Error(`Failed to fetch details (Status: ${res.status})`);

            const responseData = res.data?.message?.data || res.data?.data;

            if (!responseData || (Array.isArray(responseData) && responseData.length === 0)) {
                console.warn('[MaintenanceDetail] No data found in response:', res.data);
                throw new Error('Record not found on server');
            }

            const v = Array.isArray(responseData) ? responseData[0] : responseData;
            console.log('[MaintenanceDetail] Loaded Record Data:', v);

            setForm({
                name: v.name || '',
                customer: v.customer || '',
                customer_name: v.customer_name || '',
                maintenance_type: v.maintenance_type || 'Existing',
                mntc_date: v.mntc_date || '',
                mntc_time: v.mntc_time || '',
                customer_address: v.customer_address || '',
                purposes: (v.purposes && Array.isArray(v.purposes) && v.purposes.length > 0)
                    ? v.purposes.map((p: any) => ({
                        item_code: p.item_code || '',
                        item_name: p.item_name || '',
                        description: p.description || '',
                        work_done: p.work_done || '',
                        service_person: p.service_person || ''
                    }))
                    : [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '' }],
                status: v.status || 'Draft',
                location: v.location || '',
                date_and_time: v.date_and_time || '',
                contact_person: v.contact_person || '',
                customer_group: v.customer_group || '',
                territory: v.territory || '',
                customer_feedback: v.customer_feedback || '',
                company: v.company || '',
                completion_status: v.completion_status || '',
                creation: v.creation || '',
                follow_up_required: v.follow_up_required || 0,
                follow_up_due_date: v.follow_up_due_date || '',
                follow_up_notes: v.follow_up_notes || '',
                follow_up_type: v.follow_up_type || '',
                follow_up_status: v.follow_up_status || '',
                follow_up_owner: v.follow_up_owner || '',
                contact_email: v.contact_email || '',
                contact_mobile: v.contact_mobile || '',
            });
            console.log('[MaintenanceDetail] Loaded Record:', v.name);
            setSearchQuery(v.customer_name || v.customer || '');
        } catch (err) {
            console.error('Fetch Details Error:', err);
            const msg = (err instanceof Error) ? err.message : String(err);
            Alert.alert("Error", `Could not load visit details: ${msg}`);
            router.back();
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomers = async (query: string = '') => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            setCustomers([]);
            setShowResults(false);
            return;
        }
        setIsSearching(true);
        setSearchError(null);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const fields = ["name", "customer_name", "customer_group", "territory", "customer_primary_address", "customer_primary_contact"];
            const or_filters = JSON.stringify([
                ["customer_name", "like", `%${trimmedQuery}%`],
                ["name", "like", `%${trimmedQuery}%`]
            ]);

            const url = `http://13.234.62.39:8080/api/resource/Customer?fields=${encodeURIComponent(JSON.stringify(fields))}&or_filters=${encodeURIComponent(or_filters)}&limit_page_length=15`;
            const res = await apiGet(url, sessionCookies);

            if (res.ok) {
                setCustomers(res.data?.data || []);
                setShowResults(true);
            } else {
                console.error('Customer Fetch Error:', res.status);
                setSearchError(`Server error (${res.status})`);
                setCustomers([]);
                setShowResults(true);
            }
        } catch (err) {
            console.warn('Customer Fetch Failed:', err);
            setSearchError('Network error');
            setCustomers([]);
            setShowResults(true);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchAddressAndContact = async (customerName: string, addressName?: string, contactName?: string) => {
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            if (addressName) {
                const addrRes = await apiGet(
                    `http://13.234.62.39:8080/api/resource/Address/${encodeURIComponent(addressName)}?fields=${encodeURIComponent('["display"]')}`,
                    sessionCookies
                );
                if (addrRes.ok) {
                    updateForm('customer_address', addrRes.data?.data?.display || '');
                }
            }

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
        setSearchQuery(c.customer_name);
        setContactQuery('');
        setContacts([]);
        setShowResults(false);

        // Fetch deeper details
        fetchAddressAndContact(c.name, c.customer_primary_address, c.customer_primary_contact);
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

            // Get Readable Address
            const [address] = await Location.reverseGeocodeAsync({
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude
            });

            let addressStr = `${loc.coords.latitude}, ${loc.coords.longitude}`;
            if (address) {
                const parts = [address.name, address.street, address.district, address.city, address.region, address.postalCode].filter(Boolean);
                addressStr = parts.join(', ');
            }

            // Get Current Timestamp for Date & Time field
            const now = new Date();
            const timestamp = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0') + ' ' +
                String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');

            setForm(prev => ({
                ...prev,
                location: addressStr,
                date_and_time: timestamp
            }));
        } catch (err: any) {
            console.warn('Location Fetch Failed:', err);
            let errorMessage = 'Could not fetch location.';
            if (err.message?.includes('unsatisfied device settings')) {
                errorMessage = 'Location requested failed. Please ensure GPS is enabled on your device.';
            }
            Alert.alert('Location Error', errorMessage);
        } finally {
            setIsLocating(false);
        }
    };

    useEffect(() => {
        fetchMaintenanceDetails();
    }, [id]);


    useEffect(() => {
        if (isEditing && searchQuery.length > 2 && searchQuery !== form.customer_name) {
            const delayDebounceFn = setTimeout(() => {
                fetchCustomers(searchQuery);
            }, 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [searchQuery, isEditing]);

    const updateForm = (key: string, value: any) => {
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const handleUpdateRecord = async () => {
        setIsSaving(true);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const purposes_payload = form.purposes
                .filter(row => row.item_code.trim() !== '')
                .map(row => ({
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

            const payload = {
                name: form.name,
                customer: form.customer,
                customer_name: form.customer_name,
                maintenance_type: form.maintenance_type,
                mntc_date: form.mntc_date,
                mntc_time: form.mntc_time,
                customer_address: form.customer_address,
                purposes: purposes_payload,
                status: form.status,
                location: form.location,
                date_and_time: form.date_and_time,
                contact_person: form.contact_person,
                territory: form.territory,
                customer_feedback: form.customer_feedback,
                company: form.company,
                completion_status: form.completion_status,
                follow_up_required: form.follow_up_required,
                follow_up_due_date: form.follow_up_due_date,
                follow_up_notes: form.follow_up_notes,
                follow_up_type: form.follow_up_type,
                follow_up_status: form.follow_up_status,
                follow_up_owner: form.follow_up_owner,
                contact_email: form.contact_email,
                contact_mobile: form.contact_mobile
            };

            const res = await apiPost(
                `http://13.234.62.39:8080/api/resource/Maintenance%20Visit/${id}`,
                payload,
                sessionCookies
            );

            if (!res.ok) {
                const serverMsg = res.data?.message || res.data?._server_messages || 'Update failed';
                console.error('Server Error:', res.data);
                throw new Error(serverMsg);
            }

            Alert.alert("Success", "Record synced to ERPNext.", [
                { text: "OK", onPress: () => { setIsEditing(false); fetchMaintenanceDetails(); } }
            ]);
        } catch (err) {
            console.error('Update Error:', err);
            Alert.alert("Sync Error", "Could not save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr || dateStr === '-') return '-';
        try {
            // Handle both Space and T separators
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

    if (loading) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textSecondary, fontWeight: '600' }}>Loading Details...</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

            <View
                style={[styles.headerGradient, { backgroundColor: isDark ? '#1E293B' : '#F8FAFC' }]}
            >
                <SafeAreaView>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
                            <Ionicons name="chevron-back" size={24} color={colors.primary} />
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>Visit Details</Text>
                        <TouchableOpacity
                            onPress={() => setIsEditing(!isEditing)}
                            style={[styles.editBtn, { backgroundColor: isEditing ? colors.primary : colors.surface }]}
                            activeOpacity={0.7}
                        >
                            <Ionicons name={isEditing ? "close" : "create-outline"} size={22} color={isEditing ? "#FFF" : colors.primary} />
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.idCard, { backgroundColor: colors.surface }]}>
                        <LinearGradient
                            colors={isDark ? ['#334155', '#1E293B'] : ['#F1F5F9', '#E2E8F0']}
                            style={styles.idBadge}
                        >
                            <Ionicons name="document-text" size={18} color={colors.primary} />
                            <Text style={[styles.idText, { color: colors.text }]}>{form.name}</Text>
                        </LinearGradient>
                        <View style={[styles.statusBadge, {
                            backgroundColor: form.status === 'Draft' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            borderColor: form.status === 'Draft' ? 'rgba(79, 70, 229, 0.2)' : 'rgba(16, 185, 129, 0.2)'
                        }]}>
                            <View style={[styles.statusDot, { backgroundColor: form.status === 'Draft' ? '#6366F1' : '#10B981' }]} />
                            <Text style={[styles.statusText, { color: form.status === 'Draft' ? '#6366F1' : '#10B981' }]}>{form.status}</Text>
                        </View>
                    </View>

                    <View>
                        <Section title="Customer & Schedule" icon="business">
                            {!isEditing ? (
                                <>
                                    <DetailItem label="Customer *" value={form.customer_name || form.customer} icon="business" />
                                    <View style={styles.row}>
                                        <DetailItem label="Visit Date" value={form.mntc_date} icon="calendar" flex={1} />
                                        <DetailItem label="Visit Time" value={form.mntc_time} icon="time" flex={1} />
                                    </View>
                                </>
                            ) : (
                                <View style={{ gap: 16 }}>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer *</Text>
                                        <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showResults && styles.searchBoxActive]}>
                                            <Ionicons name="search" size={18} color={colors.primary} />
                                            <TextInput
                                                style={[styles.searchInput, { color: colors.text }]}
                                                placeholder="Search customer..."
                                                placeholderTextColor={colors.textSecondary}
                                                value={searchQuery}
                                                onChangeText={setSearchQuery}
                                                onFocus={() => searchQuery.length > 2 && setShowResults(true)}
                                            />
                                            {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
                                        </View>
                                        {showResults && searchQuery.length > 2 && !isSearching && (customers.length === 0 || searchError) && (
                                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center', gap: 12 }]}>
                                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', justifyContent: 'center', alignItems: 'center' }}>
                                                    <Ionicons name={searchError ? "alert-circle-outline" : "business-outline"} size={24} color={searchError ? colors.danger : colors.textSecondary} />
                                                </View>
                                                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "No match found"}</Text>
                                                <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                                                    {searchError || `We couldn't find any results for "${searchQuery}"`}
                                                </Text>
                                            </View>
                                        )}
                                        {showResults && customers.length > 0 && (
                                            <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                                <ScrollView style={{ maxHeight: 350 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                                    {customers.map((c, i) => (
                                                        <TouchableOpacity
                                                            key={c.name}
                                                            style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === customers.length - 1 ? 0 : 1 }]}
                                                            onPress={() => selectCustomer(c)}
                                                        >
                                                            <LinearGradient colors={isDark ? ['#6366F1', '#4F46E5'] : ['#EEF2FF', '#E0E7FF']} style={styles.resultIconBox}>
                                                                <Ionicons name="business" size={18} color={isDark ? '#FFF' : '#6366F1'} />
                                                            </LinearGradient>
                                                            <View style={{ flex: 1, gap: 4 }}>
                                                                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{c.customer_name}</Text>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                                    <View style={[styles.tag, { backgroundColor: isDark ? 'rgba(99, 102, 241, 0.2)' : '#F5F3FF' }]}>
                                                                        <Text style={[styles.tagText, { color: colors.primary }]}>{c.customer_group || 'General'}</Text>
                                                                    </View>
                                                                    <Text style={[styles.resultId, { color: colors.textSecondary }]}>{c.territory || 'All Territories'}</Text>
                                                                </View>
                                                            </View>
                                                            <Ionicons name="chevron-forward" size={16} color={colors.border} />
                                                        </TouchableOpacity>
                                                    ))}
                                                </ScrollView>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Date</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.mntc_date}
                                                onChangeText={t => updateForm('mntc_date', t)}
                                                placeholder="YYYY-MM-DD"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Time</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.mntc_time}
                                                onChangeText={t => updateForm('mntc_time', t)}
                                                placeholder="HH:MM:SS"
                                                placeholderTextColor={colors.textSecondary}
                                            />
                                        </View>
                                    </View>
                                </View>
                            )}
                        </Section>
                    </View>

                    <View>
                        <Section title="Follow Up" icon="notifications">
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Follow Up Required?</Text>
                                <View style={styles.chipRow}>
                                    {[0, 1].map(v => (
                                        <TouchableOpacity
                                            key={v}
                                            style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.border }, form.follow_up_required === v && { backgroundColor: isDark ? '#334155' : '#EEF2FF', borderColor: colors.primary }]}
                                            onPress={() => updateForm('follow_up_required', v)}
                                            disabled={!isEditing}
                                        >
                                            <Text style={[styles.chipText, { color: colors.textSecondary }, form.follow_up_required === v && { color: colors.primary }]}>{v === 1 ? 'Yes' : 'No'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>

                            {form.follow_up_required === 1 && (
                                <View style={{ gap: 16, marginTop: 12 }}>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Follow-up Type</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_type}
                                                onChangeText={t => updateForm('follow_up_type', t)}
                                                editable={isEditing}
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Due Date</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.follow_up_due_date}
                                                onChangeText={t => updateForm('follow_up_due_date', t)}
                                                editable={isEditing}
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Assign To (Owner)</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                            value={form.follow_up_owner}
                                            onChangeText={t => updateForm('follow_up_owner', t)}
                                            editable={isEditing}
                                        />
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Notes</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                            value={form.follow_up_notes}
                                            onChangeText={t => updateForm('follow_up_notes', t)}
                                            multiline
                                            editable={isEditing}
                                        />
                                    </View>
                                </View>
                            )}
                        </Section>
                    </View>

                    <View>
                        <Section title="Location" icon="navigate">
                            <View style={styles.locationCard}>
                                <View style={[styles.locationInfo, { backgroundColor: colors.background }]}>
                                    <Ionicons name="pin" size={20} color={form.location ? colors.success : colors.textSecondary} />
                                    <TextInput
                                        style={[styles.locationText, { color: colors.text }]}
                                        value={form.location}
                                        onChangeText={t => updateForm('location', t)}
                                        multiline
                                        editable={isEditing}
                                        placeholder="Tag location"
                                    />
                                    {isEditing && (
                                        <TouchableOpacity onPress={getCurrentLocation} disabled={isLocating}>
                                            {isLocating ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="locate" size={24} color={colors.primary} />}
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <DetailItem label="Captured On" value={formatDate(form.date_and_time)} icon="time" />
                            </View>
                        </Section>
                    </View>

                    <View>
                        <Section title="Status & Type" icon="options">
                            <View style={styles.row}>
                                <View style={[styles.inputWrapper, { flex: 1 }]}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Maintenance Type</Text>
                                    {isEditing ? (
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
                                    ) : (
                                        <Text style={[styles.detailValue, { color: colors.text }]}>{form.maintenance_type}</Text>
                                    )}
                                </View>
                                <View style={[styles.inputWrapper, { flex: 1 }]}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Completion Status</Text>
                                    {isEditing ? (
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
                                    ) : (
                                        <Text style={[styles.detailValue, { color: colors.text }]}>{form.completion_status}</Text>
                                    )}
                                </View>
                            </View>
                        </Section>
                    </View>

                    <View>
                        <Section title="RFQ" icon="cart">
                            {form.purposes.map((row, index) => (
                                <View key={index} style={[styles.itemCard, { backgroundColor: colors.background, borderColor: colors.border, marginBottom: 12 }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>ITEM {index + 1}</Text>
                                        {isEditing && form.purposes.length > 1 && (
                                            <TouchableOpacity onPress={() => removePurposeRow(index)}>
                                                <Ionicons name="trash" size={20} color={colors.danger} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    {isEditing ? (
                                        <View style={{ gap: 12 }}>
                                            <View style={styles.inputWrapper}>
                                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Item Code / Name</Text>
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
                                                    {isSearchingItem && activeItemSearchIndex === index && <ActivityIndicator size="small" color={colors.primary} />}
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
                                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Work Done</Text>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, height: 60 }]}
                                                    value={row.work_done}
                                                    onChangeText={t => updatePurposeRow(index, 'work_done', t)}
                                                    multiline
                                                />
                                            </View>
                                        </View>
                                    ) : (
                                        <>
                                            <DetailItem label="Item" value={row.item_name || row.item_code} icon="cube" />
                                            {row.description && <DetailItem label="Description" value={row.description} icon="information-circle" />}
                                            <DetailItem label="Work Done" value={row.work_done} icon="hammer" />
                                            <DetailItem label="Engineer" value={row.service_person || form.follow_up_owner} icon="person-sharp" />
                                        </>
                                    )}
                                </View>
                            ))}
                            {isEditing && (
                                <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={addPurposeRow}>
                                    <Ionicons name="add-circle" size={24} color={colors.primary} />
                                    <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Item</Text>
                                </TouchableOpacity>
                            )}
                        </Section>
                    </View>

                    <View>
                        <Section title="Visit Summary" icon="chatbubbles">
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Summary of Discussion</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 120 }]}
                                    value={form.customer_feedback}
                                    onChangeText={t => updateForm('customer_feedback', t)}
                                    multiline
                                    editable={isEditing}
                                    placeholder="Enter summary..."
                                />
                            </View>
                        </Section>
                    </View>

                    <View>
                        <Section title="Contact Info" icon="person">
                            <View style={{ gap: 16 }}>
                                <View style={styles.inputWrapper}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Address</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                        value={form.customer_address}
                                        onChangeText={t => updateForm('customer_address', t)}
                                        multiline
                                        editable={isEditing}
                                    />
                                </View>
                                <View style={styles.row}>
                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Territory</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                            value={form.territory}
                                            onChangeText={t => updateForm('territory', t)}
                                            editable={isEditing}
                                        />
                                    </View>
                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Group</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                            value={form.customer_group}
                                            onChangeText={t => updateForm('customer_group', t)}
                                            editable={isEditing}
                                        />
                                    </View>
                                </View>
                                <View style={styles.inputWrapper}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Person</Text>
                                    {isEditing ? (
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
                                                placeholder="Enter contact person"
                                            />
                                            {isSearchingContact && <ActivityIndicator size="small" color={colors.primary} />}
                                        </View>
                                    ) : (
                                        <Text style={[styles.detailValue, { color: colors.text }]}>{form.contact_person}</Text>
                                    )}
                                </View>

                                {isEditing ? (
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Email</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.contact_email}
                                                onChangeText={t => updateForm('contact_email', t)}
                                                placeholder="email@example.com"
                                                keyboardType="email-address"
                                                editable={isEditing}
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
                                                editable={isEditing}
                                            />
                                        </View>
                                    </View>
                                ) : (
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Email</Text>
                                            <Text style={[styles.detailValue, { color: colors.text }]}>{form.contact_email || '-'}</Text>
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Contact Mobile</Text>
                                            <Text style={[styles.detailValue, { color: colors.text }]}>{form.contact_mobile || '-'}</Text>
                                        </View>
                                    </View>
                                )}
                                {isEditing && showContactResults && contactQuery.length > 2 && !isSearchingContact && (contacts.length === 0 || searchError) && (
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
                                {isEditing && showContactResults && contacts.length > 0 && (
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
                            </View>
                        </Section>
                    </View>

                    {isEditing && (
                        <View>
                            <TouchableOpacity
                                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                                onPress={handleUpdateRecord}
                                disabled={isSaving}
                                activeOpacity={0.8}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Ionicons name="cloud-upload" size={22} color="#FFF" />
                                        <Text style={styles.saveButtonText}>Sync to ERPNext</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </ScrollView>

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
            </KeyboardAvoidingView>
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
                    colors={['#6366F1', '#4F46E5']}
                    style={styles.sectionIconBox}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <Ionicons name={icon} size={16} color="#FFF" />
                </LinearGradient>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
            </View>
            <View style={styles.sectionContent}>{children}</View>
        </View>
    );
};

const DetailItem = ({ label, value, icon, flex }: any) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];

    return (
        <View style={[styles.detailItem, flex && { flex }]}>
            <View style={styles.detailHeader}>
                {icon && <Ionicons name={icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />}
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
            </View>
            <Text style={[styles.detailValue, { color: colors.text }]}>{value || '-'}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerGradient: {
        paddingBottom: 10,
        zIndex: 100,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    editBtn: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 40,
    },
    idCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 24,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
        elevation: 4,
    },
    idBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
    },
    idText: {
        fontSize: 14,
        fontWeight: '800',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        gap: 6,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    section: {
        borderRadius: 28,
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.04,
        shadowRadius: 20,
        elevation: 3,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    sectionIconBox: {
        width: 32,
        height: 32,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
    },
    sectionContent: {
        gap: 16,
    },
    detailItem: {
        marginBottom: 16,
    },
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    detailLabel: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    detailValue: {
        fontSize: 15,
        fontWeight: '600',
        lineHeight: 22,
    },
    inputWrapper: {
        gap: 6,
    },
    inputLabel: {
        fontSize: 11,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginLeft: 4,
    },
    input: {
        borderRadius: 16,
        padding: 16,
        fontSize: 15,
        fontWeight: '600',
        borderWidth: 1,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 1,
    },
    searchBoxActive: {
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
    },
    searchInput: {
        flex: 1,
        marginLeft: 12,
        fontSize: 15,
        fontWeight: '600',
    },
    resultsContainer: {
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderWidth: 1.5,
        borderTopWidth: 0,
        maxHeight: 350,
        overflow: 'hidden',
        marginTop: -6,
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        zIndex: 1000,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        gap: 16,
    },
    resultIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultName: {
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    resultId: {
        fontSize: 12,
        opacity: 0.6,
        fontWeight: '600',
    },
    tag: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    tagText: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    chipRow: {
        flexDirection: 'row',
        gap: 8,
    },
    chip: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    chipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    itemCard: {
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        marginBottom: 4,
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    itemLabel: {
        fontSize: 10,
        fontWeight: '900',
        letterSpacing: 1,
    },
    editItemCard: {
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        gap: 12,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderStyle: 'dashed',
        gap: 8,
    },
    addBtnText: {
        fontSize: 14,
        fontWeight: '800',
    },
    gridContainer: {
        gap: 12,
    },
    gridRow: {
        flexDirection: 'row',
        gap: 12,
    },
    locationCard: {
        gap: 16,
    },
    locationInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 16,
        borderRadius: 16,
    },
    locationText: {
        flex: 1,
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600',
    },
    followupCard: {
        borderRadius: 20,
        padding: 16,
        gap: 4,
    },
    statusTag: {
        padding: 10,
        borderRadius: 14,
    },
    saveButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        borderRadius: 20,
        paddingHorizontal: 24,
        gap: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 8,
        marginTop: 10,
    },
    saveButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
});

