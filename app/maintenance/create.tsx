import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiGet, apiPost, uploadFile } from '@/utils/api';
import { parseFrappeError } from '@/utils/frappeError';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, apiUrl } from '@/constants/config';
import {
    Contact,
    Customer,
    Item,
    getAddressDisplay,
    getContactDetails,
    searchAddresses,
    searchApprovingAuthorities,
    searchContacts,
    searchCustomers,
    searchItems,
} from '@/services/frappeSearch';

const IMAGE_HOST = API_BASE_URL;

export default function CreateMaintenanceScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

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
        date_and_time: '',
        purposes: [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '', image: '' }],
        territory: '',
        customer_feedback: '',
        company: 'White & Co.',
        completion_status: 'Partially Completed',
        contact_person: '',
        customer_group: '',
        // New fields
        new_customer: '',
        new_address: '',
        new_contact_number: '',
        new_contact_email: '',
        follow_up_required: 0,
        follow_up_due_date: '',
        follow_up_notes: '',
        follow_up_type: '',
        follow_up_status: 'Open',
        follow_up_owner: '',
        contact_email: '',
        contact_mobile: '',
        assigned_to: '',
        sales_executive: '',
        total: '0.00',
        food_expenses: [] as any[],
        travel_expenses: [] as any[],
        stay_expenses: [] as any[],
        other_expenses: [] as any[],
    });

    const [stayPicker, setStayPicker] = useState<{
        visible: boolean;
        idx: number;
        field: 'check_in_date' | 'checkout_date' | 'check_in_time' | 'checkout_time' | 'check_in_datetime' | 'checkout_datetime';
    }>({ visible: false, idx: 0, field: 'check_in_date' });

    const [isSaving, setIsSaving] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'from' | 'to' | 'location' | 'follow_up' | null>(null);

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

    // Authority Search States
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [authorityQuery, setAuthorityQuery] = useState('');
    const [isSearchingAuthority, setIsSearchingAuthority] = useState(false);
    const [showAuthorityResults, setShowAuthorityResults] = useState(false);
    const [addresses, setAddresses] = useState<any[]>([]);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);

    // Sales Executive Search States
    const [salesExecutives, setSalesExecutives] = useState<any[]>([]);
    const [salesExecQuery, setSalesExecQuery] = useState('');
    const [isSearchingSalesExec, setIsSearchingSalesExec] = useState(false);
    const [showSalesExecResults, setShowSalesExecResults] = useState(false);
    const [salesExecModalVisible, setSalesExecModalVisible] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

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
        const loadDefaultAuthority = async () => {
            try {
                const sessionCookies = await SecureStore.getItemAsync('session_cookies');
                const userId = await SecureStore.getItemAsync('user_id');
                if (userId && !form.assigned_to) {
                    const params = new URLSearchParams({
                        doctype: 'Approving Authority',
                        filters: JSON.stringify([["user", "=", userId]]),
                        fields: JSON.stringify(["name", "approving_authority_name"])
                    });
                    const res = await apiGet(apiUrl(`/api/method/frappe.client.get_list?${params.toString()}`), sessionCookies);
                    if (res.ok && res.data?.message && res.data.message.length > 0) {
                        const authority = res.data.message[0];
                        updateForm('assigned_to', authority.name);
                        setAuthorityQuery(authority.approving_authority_name || authority.name);
                        console.log('[create.tsx] Found Approving Authority:', authority.name);
                    } else {
                        updateForm('assigned_to', userId);
                    }
                }
            } catch (e) {
                console.warn('Default Approving Authority load failed:', e);
            }
        };
        const loadDefaultFollowUpOwner = async () => {
            try {
                const email = await SecureStore.getItemAsync('user_id');
                if (email) {
                    updateForm('follow_up_owner', email);
                }
            } catch (e) {
                console.warn('Default Follow-up Owner load failed:', e);
            }
        };
        const loadDefaultSalesExecutive = async () => {
            try {
                const email = await SecureStore.getItemAsync('user_id');
                if (email) {
                    updateForm('sales_executive', email);
                    setSalesExecQuery(email); // Show the email in the input
                }
            } catch (e) {
                console.warn('Default Sales Executive load failed:', e);
            }
        };
        loadDefaultAuthority();
        loadDefaultFollowUpOwner();
        loadDefaultSalesExecutive();
    }, []);

    const handleMaintenanceTypeChange = (type: string) => {
        setForm(prev => ({
            ...prev,
            maintenance_type: type,
            // Clear relevant fields when switching
            customer: '',
            customer_name: '',
            contact_person: '',
            new_customer: '',
            new_address: '',
            new_contact_number: '',
            new_contact_email: '',
        }));
        setCustomerQuery('');
    };

    const addPurposeRow = () => {
        setForm(prev => ({
            ...prev,
            purposes: [...prev.purposes, { item_code: '', item_name: '', description: '', work_done: '', service_person: '', image: '' }]
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

    const pickImage = async (type: 'food' | 'travel' | 'stay' | 'other', index: number) => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled) {
                updateExpenseRow(type, index, 'attach_image', result.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert('Error', `Failed to pick image: ${e?.message || e}`);
        }
    };

    const pickPurposeImage = async (index: number) => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to make this work!');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled) {
                updatePurposeRow(index, 'image', result.assets[0].uri);
            }
        } catch (e: any) {
            Alert.alert('Error', `Failed to pick image: ${e?.message || e}`);
        }
    };

    // Expenses logic
    const addExpenseRow = (type: 'food' | 'travel' | 'stay' | 'other') => {
        const templates = {
            food: { date: new Date().toISOString().split('T')[0], meal_type: 'Lunch', cost: '0', attach_image: '' },
            travel: { from_location: '', to_location: '', date: new Date().toISOString().split('T')[0], mode_of_travel: 'Taxi', cost: '0', attach_image: '' },
            stay: { hotel_name: '', check_in_date: new Date().toISOString().split('T')[0], checkout_date: new Date().toISOString().split('T')[0], check_in_time: '12:00:00', checkout_time: '12:00:00', cost: '0', attach_image: '' },
            other: { expense_type: 'Other', expense_in_details: '', cost: '0', attach_image: '' }
        };
        const key = `${type}_expenses` as keyof typeof form;
        updateForm(key, [...(form[key] as any[]), templates[type]]);
    };

    const updateExpenseRow = (type: 'food' | 'travel' | 'stay' | 'other', index: number, field: string, value: any) => {
        const key = `${type}_expenses` as keyof typeof form;
        const newList = [...(form[key] as any[])];
        newList[index] = { ...newList[index], [field]: value };
        updateForm(key, newList);
    };

    const removeExpenseRow = (type: 'food' | 'travel' | 'stay' | 'other', index: number) => {
        const key = `${type}_expenses` as keyof typeof form;
        const newList = (form[key] as any[]).filter((_, i) => i !== index);
        updateForm(key, newList);
    };

    useEffect(() => {
        const f = form.food_expenses.reduce((sum, e) => sum + (parseFloat(e.cost) || 0), 0);
        const t = form.travel_expenses.reduce((sum, e) => sum + (parseFloat(e.cost) || 0), 0);
        const s = form.stay_expenses.reduce((sum, e) => sum + (parseFloat(e.cost) || 0), 0);
        const o = form.other_expenses.reduce((sum, e) => sum + (parseFloat(e.cost) || 0), 0);
        const total = (f + t + s + o).toFixed(2);
        if (form.total !== total) {
            updateForm('total', total);
        }
    }, [form.food_expenses, form.travel_expenses, form.stay_expenses, form.other_expenses]);

    const fetchCustomers = async (query: string = '') => {
        if (!query.trim()) {
            setCustomers([]);
            setShowCustomerResults(false);
            return;
        }
        setIsSearchingCustomer(true);
        setSearchError(null);

        const result = await searchCustomers(query);
        if (!result.ok) setSearchError(result.error);
        setCustomers(result.data);
        setShowCustomerResults(true);
        setIsSearchingCustomer(false);
    };

    const fetchContacts = async (customerName: string, query: string = '') => {
        if (!customerName) return;
        setIsSearchingContact(true);
        setSearchError(null);

        const result = await searchContacts(customerName, query);
        if (!result.ok) setSearchError(result.error);
        setContacts(result.data);
        setShowContactResults(true);
        setIsSearchingContact(false);
    };

    const fetchAuthorities = async (query: string = '') => {
        setIsSearchingAuthority(true);
        setSearchError(null);

        const result = await searchApprovingAuthorities(query);
        if (!result.ok) setSearchError(result.error);
        setAuthorities(result.data);
        setShowAuthorityResults(true);
        setIsSearchingAuthority(false);
    };

    const fetchAddresses = async (customerName: string) => {
        if (!customerName) return;
        setIsSearchingAddress(true);

        const result = await searchAddresses(customerName);
        if (result.ok) setAddresses(result.data);
        setIsSearchingAddress(false);
    };

    useEffect(() => {
        if (authorityQuery.length >= 2 && authorityQuery !== form.assigned_to) {
            const delayDebounceFn = setTimeout(() => fetchAuthorities(authorityQuery), 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [authorityQuery]);

    // Same Approving Authority lookup as fetchAuthorities, feeding the sales
    // executive picker instead.
    const fetchSalesExecutives = async (query: string = '') => {
        setIsSearchingSalesExec(true);
        setSearchError(null);

        const result = await searchApprovingAuthorities(query);
        if (!result.ok) setSearchError(result.error);
        setSalesExecutives(result.data);
        setShowSalesExecResults(true);
        setIsSearchingSalesExec(false);
    };

    useEffect(() => {
        if (salesExecQuery.length >= 2 && salesExecQuery !== form.sales_executive) {
            const delayDebounceFn = setTimeout(() => fetchSalesExecutives(salesExecQuery), 500);
            return () => clearTimeout(delayDebounceFn);
        }
    }, [salesExecQuery]);

    const selectContact = (c: Contact) => {
        updateForm('contact_person', c.name);
        updateForm('contact_email', c.email_id || '');
        updateForm('contact_mobile', c.mobile_no || '');
        setContactQuery([c.first_name, c.last_name].filter(Boolean).join(' '));
        setShowContactResults(false);
    };

    const fetchItems = async (query: string = '') => {
        setIsSearchingItem(true);
        setSearchError(null);

        const result = await searchItems(query);
        if (!result.ok) setSearchError(result.error);
        setItems(result.data);
        setShowItemResults(true);
        setIsSearchingItem(false);
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
        if (addressName) {
            updateForm('customer_address', await getAddressDisplay(addressName));
        }

        if (contactName) {
            const contact = await getContactDetails(contactName);
            if (contact) {
                updateForm('contact_person', contact.fullName);
                updateForm('contact_email', contact.email);
                updateForm('contact_mobile', contact.mobile);
                setContactQuery(contact.fullName);
            }
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
        fetchAddresses(c.name);
        fetchContacts(c.name);
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
        // Validate before uploading anything. ERPNext rejects a Maintenance
        // Visit with no linked Customer ("Value missing for Customer Visits:
        // Customer"), but that only came back after every expense and purpose
        // image had already been uploaded — so the user waited through the
        // whole save just to get an error they could not act on.
        if (!form.customer.trim()) {
            Alert.alert(
                'Select a Customer',
                form.new_customer.trim()
                    // They filled the free-text block, which is the easy mistake
                    // to make: it records extra detail but does not create or
                    // replace the Customer link the server requires.
                    ? `"${form.new_customer.trim()}" is stored as extra detail only — it does not create a customer record.\n\nUse the Customer search at the top to pick an existing customer.`
                    : 'Use the Customer search at the top to pick a customer before saving.'
            );
            return;
        }

        if (!form.date_and_time.trim()) {
            Alert.alert('Set the Visit Date', 'Pick a date and time for this visit before saving.');
            return;
        }

        setIsSaving(true);
        try {
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            // 1. Upload Images for Expenses
            const uploadExpenseImages = async (expenses: any[]) => {
                return await Promise.all(expenses.map(async (exp) => {
                    if (exp.attach_image && exp.attach_image.startsWith('file://')) {
                        const uploadRes = await uploadFile(`${IMAGE_HOST}/api/method/upload_file`, { uri: exp.attach_image }, sessionCookies);
                        if (uploadRes.ok && uploadRes.data?.message?.file_url) {
                            return { ...exp, attach_image: uploadRes.data.message.file_url };
                        }
                    }
                    return exp;
                }));
            };

            const food_exp_updated = await uploadExpenseImages(form.food_expenses);
            const travel_exp_updated = await uploadExpenseImages(form.travel_expenses);
            const stay_exp_updated = await uploadExpenseImages(form.stay_expenses);
            const other_exp_updated = await uploadExpenseImages(form.other_expenses);

            const uploadPurposeImages = async (purposes: any[]) => {
                return await Promise.all(purposes.map(async (p) => {
                    if (p.image && p.image.startsWith('file://')) {
                        const uploadRes = await uploadFile(`${IMAGE_HOST}/api/method/upload_file`, { uri: p.image }, sessionCookies);
                        if (uploadRes.ok && uploadRes.data?.message?.file_url) {
                            return { ...p, image: uploadRes.data.message.file_url };
                        }
                    }
                    return p;
                }));
            };

            const purposes_updated = await uploadPurposeImages(form.purposes);

            const rawPurposes = purposes_updated
                .filter(row => row.item_code.trim() !== '')
                .map(row => ({
                    doctype: 'Maintenance Visit Purpose',
                    item_code: row.item_code,
                    item_name: row.item_name || row.item_code,
                    description: row.description || row.item_name || row.item_code,
                    work_done: row.work_done,
                    image: row.image || '',
                }));

            // ERPNext requires at least one purpose row — send a placeholder if none added
            const purposes_payload = rawPurposes.length > 0 ? rawPurposes : [{
                doctype: 'Maintenance Visit Purpose',
                item_code: 'N/A',
                item_name: 'N/A',
                description: 'General Visit',
                work_done: '',
            }];

            const payload = {
                doctype: 'Maintenance Visit',
                customer: form.customer,
                customer_name: form.customer_name,
                customer_group: form.customer_group,
                maintenance_type: form.maintenance_type,
                customer_address: form.customer_address,
                new_customer: form.new_customer,
                new_address: form.new_address,
                new_contact_number: form.new_contact_number,
                new_contact_email: form.new_contact_email,
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
                follow_up_required: form.follow_up_required ? 1 : 0,
                follow_up_due_date: form.follow_up_due_date,
                follow_up_notes: form.follow_up_notes,
                follow_up_type: form.follow_up_type,
                follow_up_status: form.follow_up_status,
                follow_up_owner: form.follow_up_owner || form.sales_executive,
                contact_email: form.contact_email,
                contact_mobile: form.contact_mobile,
                sales_executive: form.sales_executive,
                food_expenses: food_exp_updated.filter(e => (e.cost || e.amount) || e.food_type),
                food_expense: food_exp_updated.filter(e => (e.cost || e.amount) || e.food_type),
                travel_expenses: travel_exp_updated.filter(e => (e.cost || e.amount) || e.from_location || e.to_location),
                travel_expense: travel_exp_updated.filter(e => (e.cost || e.amount) || e.from_location || e.to_location),
                stay_expenses: stay_exp_updated.filter(e => (e.cost || e.amount) || e.hotel_name),
                stay_expense: stay_exp_updated.filter(e => (e.cost || e.amount) || e.hotel_name),
                other_expenses: other_exp_updated.filter(e => (e.cost || e.amount) || e.description),
                other_expense: other_exp_updated.filter(e => (e.cost || e.amount) || e.description),
                total: form.total,
            };

            const res = await apiPost(apiUrl('/api/resource/Maintenance%20Visit'), payload, sessionCookies);

            if (!res.ok) {
                console.error('Server Error Data:', res.data);
                throw new Error(parseFrappeError(res.data, 'Creation failed'));
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
                style={[styles.headerGradient, { backgroundColor: isDark ? '#000000' : '#4F46E5' }]}
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
                            <View style={[styles.headerText, { flex: 1 }]}>
                                <Text style={styles.headerTitle}>Add Visit</Text>
                                <Text style={styles.headerSubtitle}>Create new Visit record</Text>
                            </View>
                        </View>
                    </View>
                </SafeAreaView>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}>
                <ScrollView
                    style={styles.scrollContent}
                    contentContainerStyle={[styles.scrollInner, { paddingBottom: 100 + insets.bottom }]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* 1. Customer & Schedule */}
                    <Section title="Customer & Schedule" icon="calendar">
                        {(form.maintenance_type === 'Existing' || form.maintenance_type === 'Scheduled' || form.maintenance_type === 'Unscheduled') && (
                            <View style={styles.inputWrapper}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer</Text>
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

                        {/* New Customer Details Section */}
                        <View style={{ marginTop: 16, gap: 16 }}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Customer Name</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.new_customer}
                                    onChangeText={(v) => updateForm('new_customer', v)}
                                    placeholder="Enter new customer name"
                                    placeholderTextColor={colors.placeholder}
                                />
                            </View>

                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Customer Address</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                                    value={form.new_address}
                                    onChangeText={(v) => updateForm('new_address', v)}
                                    placeholder="Enter new customer address"
                                    placeholderTextColor={colors.placeholder}
                                    multiline
                                />
                            </View>

                            <View style={[styles.row, { flexWrap: 'wrap', gap: 12 }]}>
                                <View style={[styles.inputWrapper, { flex: 1, minWidth: '45%' }]}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>New Contact Number</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                        value={form.new_contact_number}
                                        onChangeText={(v) => updateForm('new_contact_number', v)}
                                        placeholder="Enter contact number"
                                        placeholderTextColor={colors.placeholder}
                                        keyboardType="phone-pad"
                                    />
                                </View>
                                <View style={[styles.inputWrapper, { flex: 1, minWidth: '45%' }]}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit>New Contact Email</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                        value={form.new_contact_email}
                                        onChangeText={(v) => updateForm('new_contact_email', v)}
                                        placeholder="Enter contact email"
                                        placeholderTextColor={colors.placeholder}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                    />
                                </View>
                            </View>
                        </View>

                        <View style={[styles.inputWrapper, { marginBottom: 16 }]}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Assigned To</Text>
                            <View style={{ flex: 1 }}>
                                <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showAuthorityResults && styles.searchBoxActive]}>
                                    <Ionicons name="search" size={18} color={colors.primary} />
                                    <TextInput
                                        style={[styles.searchInput, { color: colors.text }]}
                                        placeholder="Search Assigned To..."
                                        placeholderTextColor={colors.textSecondary}
                                        value={authorityQuery || form.assigned_to}
                                        onChangeText={(text) => {
                                            setAuthorityQuery(text);
                                            if (text !== form.assigned_to) {
                                                updateForm('assigned_to', '');
                                            }
                                        }}
                                        onFocus={() => {
                                            setShowAuthorityResults(true);
                                            if (authorities.length === 0) fetchAuthorities(authorityQuery || form.assigned_to);
                                        }}
                                    />
                                    {isSearchingAuthority && <ActivityIndicator size="small" color={colors.primary} />}
                                </View>
                                {showAuthorityResults && authorityQuery.length > 2 && !isSearchingAuthority && (authorities.length === 0 || searchError) && (
                                    <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center', gap: 12 }]}>
                                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "No match found"}</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 32 }}>
                                            {searchError || `We couldn't find any authorities matching "${authorityQuery}"`}
                                        </Text>
                                    </View>
                                )}
                                {showAuthorityResults && authorities.length > 0 && (
                                    <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                        <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                            {authorities.map((a, i) => (
                                                <TouchableOpacity
                                                    key={a.value || a.name || i}
                                                    style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === authorities.length - 1 ? 0 : 1 }]}
                                                    onPress={() => {
                                                        const val = a.value || a.name;
                                                        const desc = a.description || a.approving_authority_name || a.name;
                                                        updateForm('assigned_to', val);
                                                        setAuthorityQuery(desc);
                                                        setShowAuthorityResults(false);
                                                    }}
                                                >
                                                    <View style={{ flex: 1, gap: 2 }}>
                                                        <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{a.description || a.approving_authority_name || a.name}</Text>
                                                        <Text style={[styles.resultId, { color: colors.textSecondary }]}>{a.value || a.name}</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Sales Executive</Text>
                            <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showSalesExecResults && styles.searchBoxActive]}>
                                <Ionicons name="search" size={18} color={colors.textSecondary} />
                                <TextInput
                                    style={[styles.searchInput, { color: colors.text }]}
                                    value={salesExecQuery}
                                    onChangeText={t => {
                                        setSalesExecQuery(t);
                                        if (t.length < 2) {
                                            setShowSalesExecResults(false);
                                            updateForm('sales_executive', '');
                                        }
                                    }}
                                    onFocus={() => {
                                        setShowSalesExecResults(true);
                                        if (salesExecutives.length === 0) fetchSalesExecutives(salesExecQuery);
                                    }}
                                    placeholder="Search Sales Executive..."
                                    placeholderTextColor={colors.textSecondary}
                                />
                                {isSearchingSalesExec && <ActivityIndicator size="small" color={colors.primary} />}
                            </View>

                            {showSalesExecResults && salesExecQuery.length > 2 && !isSearchingSalesExec && salesExecutives.length === 0 && (
                                <View style={[styles.resultsContainer, { backgroundColor: colors.surface, paddingVertical: 24, alignItems: 'center' }]}>
                                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>No match found</Text>
                                </View>
                            )}

                            {showSalesExecResults && salesExecutives.length > 0 && (
                                <View style={[styles.resultsContainer, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                    <ScrollView style={{ maxHeight: 250 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                                        {salesExecutives.map((exec, i) => (
                                            <TouchableOpacity
                                                key={exec.value || i}
                                                style={[styles.resultItem, { borderBottomColor: colors.border, borderBottomWidth: i === salesExecutives.length - 1 ? 0 : 1 }]}
                                                onPress={() => {
                                                    const val = exec.value || exec.name;
                                                    const desc = exec.description || exec.sales_person_name || exec.name;
                                                    updateForm('sales_executive', val);
                                                    setSalesExecQuery(desc);
                                                    setShowSalesExecResults(false);
                                                }}
                                            >
                                                <LinearGradient colors={isDark ? ['#10B981', '#059669'] : ['#ECFDF5', '#D1FAE5']} style={styles.resultIconBox}>
                                                    <Ionicons name="person" size={18} color={isDark ? '#FFF' : '#10B981'} />
                                                </LinearGradient>
                                                <View style={{ flex: 1, gap: 2 }}>
                                                    <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{exec.description || exec.sales_person_name || exec.name}</Text>
                                                    <Text style={[styles.resultId, { color: colors.textSecondary }]}>{exec.value || exec.name}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Date</Text>
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
                        </View>
                    </Section >



                    {/* 2. Follow Up */}
                    <Section title="Follow Up" icon="notifications">
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

                        {form.follow_up_required === 1 && (
                            <View style={{ gap: 16, marginTop: 8 }}>
                                <View style={styles.row}>
                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Next Action</Text>
                                        <TouchableOpacity
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                            onPress={() => {
                                                setSelectionModal({
                                                    visible: true,
                                                    title: 'Select Next Action',
                                                    options: ['Quotation Required', 'Order Follow-up', 'Payment Follow-up', 'Service Completion', 'Complaint Resolution', 'Installation / Commissioning', 'Sample / Demo Required', 'Technical Clarification', 'Next Visit Scheduled', 'Internal Action', 'No Further Action'],
                                                    onSelect: (v) => updateForm('follow_up_type', v),
                                                    selectedValue: form.follow_up_type
                                                });
                                            }}
                                        >
                                            <Text style={{ color: form.follow_up_type ? colors.text : colors.textSecondary }}>
                                                {form.follow_up_type || 'Select Next Action'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Due Date</Text>
                                        <TouchableOpacity
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                            onPress={() => setDatePickerMode('follow_up')}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text style={{ color: form.follow_up_due_date ? colors.text : colors.textSecondary }}>
                                                    {form.follow_up_due_date || 'YYYY-MM-DD'}
                                                </Text>
                                                <Ionicons name="calendar-clear-outline" size={18} color={colors.primary} />
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.inputWrapper}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Status</Text>
                                    <TextInput
                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                        value={form.follow_up_status}
                                        onChangeText={t => updateForm('follow_up_status', t)}
                                        placeholder="Open"
                                        placeholderTextColor={colors.textSecondary}
                                        editable={false}
                                    />
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
                        )}
                    </Section>

                    {/* 3. Location */}
                    <Section title="Location" icon="location">
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
                    </Section>

                    {/* 4. Purpose of Visit */}
                    <Section title="Purpose of Visit" icon="briefcase">
                        {form.purposes.map((row, index) => (
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
                        ))}

                        <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary, backgroundColor: isDark ? colors.surface : '#F5F7FF' }]} onPress={addPurposeRow}>
                            <Ionicons name="add-circle" size={20} color={colors.primary} />
                            <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Another Item</Text>
                        </TouchableOpacity>
                    </Section>
                    {/* 5. Feedback */}
                    <Section title="Customer Feedback" icon="chatbubbles">
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
                    </Section>

                    {/* 6. Attachments */}
                    <Section title="Attachments" icon="image">
                        {/* This section is currently empty in the provided code, but the diff implies it should be here. */}
                        {/* Add attachment related UI here if needed */}
                    </Section>

                    {/* 7. Expenses */}
                    <Section title="Expenses" icon="wallet">
                        {/* 7.1 Travel Expenses */}
                        <View style={{ marginBottom: 20 }}>
                            <View style={styles.itemHeader}>
                                <Text style={[styles.itemLabel, { color: colors.primary }]}>Travel Expenses</Text>
                            </View>
                            {form.travel_expenses.map((exp, idx) => (
                                <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>TRAVEL #{idx + 1}</Text>
                                        <TouchableOpacity onPress={() => removeExpenseRow('travel', idx)}>
                                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>From</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.from_location}
                                                onChangeText={t => updateExpenseRow('travel', idx, 'from_location', t)}
                                                placeholder="City"
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>To</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.to_location}
                                                onChangeText={t => updateExpenseRow('travel', idx, 'to_location', t)}
                                                placeholder="City"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Mode</Text>
                                            <TouchableOpacity
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                onPress={() => setSelectionModal({
                                                    visible: true,
                                                    title: 'Select Mode of Travel',
                                                    options: ['Taxi', 'Bus', 'Train', 'Flight', 'Own Vehicle', 'Other'],
                                                    onSelect: (v) => updateExpenseRow('travel', idx, 'mode_of_travel', v),
                                                    selectedValue: exp.mode_of_travel
                                                })}
                                            >
                                                <Text style={{ color: exp.mode_of_travel ? colors.text : colors.textSecondary }}>{exp.mode_of_travel || 'Select Mode'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cost (₹)</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.cost}
                                                onChangeText={t => updateExpenseRow('travel', idx, 'cost', t)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.date}
                                                onChangeText={t => updateExpenseRow('travel', idx, 'date', t)}
                                                placeholder="YYYY-MM-DD"
                                            />
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                            onPress={() => pickImage('travel', idx)}
                                        >
                                            <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                            <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{exp.attach_image ? 'Change' : 'Attach'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {exp.attach_image ? (
                                        <TouchableOpacity
                                            style={styles.imagePreviewContainer}
                                            onPress={() => setPreviewImage(exp.attach_image)}
                                        >
                                            <Image source={{ uri: exp.attach_image }} style={styles.imagePreview} />
                                            <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('travel', idx, 'attach_image', '')}>
                                                <Ionicons name="close-circle" size={20} color={colors.danger} />
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('travel')}>
                                <Ionicons name="add-circle" size={20} color={colors.primary} />
                                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 7.2 Food Expenses */}
                        <View style={{ marginBottom: 20 }}>
                            <View style={styles.itemHeader}>
                                <Text style={[styles.itemLabel, { color: colors.primary }]}>Food Expenses</Text>
                            </View>
                            {form.food_expenses.map((exp, idx) => (
                                <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>FOOD #{idx + 1}</Text>
                                        <TouchableOpacity onPress={() => removeExpenseRow('food', idx)}>
                                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Meal Type</Text>
                                            <TouchableOpacity
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                onPress={() => setSelectionModal({
                                                    visible: true,
                                                    title: 'Select Meal Type',
                                                    options: ['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Other'],
                                                    onSelect: (v) => updateExpenseRow('food', idx, 'meal_type', v),
                                                    selectedValue: exp.meal_type
                                                })}
                                            >
                                                <Text style={{ color: exp.meal_type ? colors.text : colors.textSecondary }}>{exp.meal_type || 'Select Meal'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cost (₹)</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.cost}
                                                onChangeText={t => updateExpenseRow('food', idx, 'cost', t)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.date}
                                                onChangeText={t => updateExpenseRow('food', idx, 'date', t)}
                                                placeholder="YYYY-MM-DD"
                                            />
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                            onPress={() => pickImage('food', idx)}
                                        >
                                            <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                            <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{exp.attach_image ? 'Change' : 'Attach'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {exp.attach_image ? (
                                        <TouchableOpacity
                                            style={styles.imagePreviewContainer}
                                            onPress={() => setPreviewImage(exp.attach_image)}
                                        >
                                            <Image source={{ uri: exp.attach_image }} style={styles.imagePreview} />
                                            <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('food', idx, 'attach_image', '')}>
                                                <Ionicons name="close-circle" size={20} color={colors.danger} />
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('food')}>
                                <Ionicons name="add-circle" size={20} color={colors.primary} />
                                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 7.3 Stay Expenses */}
                        <View style={{ marginBottom: 20 }}>
                            <View style={styles.itemHeader}>
                                <Text style={[styles.itemLabel, { color: colors.primary }]}>Stay Expenses</Text>
                            </View>
                            {form.stay_expenses.map((exp, idx) => (
                                <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>STAY #{idx + 1}</Text>
                                        <TouchableOpacity onPress={() => removeExpenseRow('stay', idx)}>
                                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Hotel Name</Text>
                                        <TextInput
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                            value={exp.hotel_name}
                                            onChangeText={t => updateExpenseRow('stay', idx, 'hotel_name', t)}
                                            placeholder="Hotel Name"
                                        />
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Check-in Date & Time</Text>
                                        <TouchableOpacity
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                                            onPress={() => {
                                                if (Platform.OS === 'android') {
                                                    DateTimePickerAndroid.open({
                                                        value: exp.check_in_date ? new Date(exp.check_in_date) : new Date(),
                                                        mode: 'date',
                                                        onChange: (event, date) => {
                                                            if (event.type === 'set' && date) {
                                                                const formattedDate = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
                                                                updateExpenseRow('stay', idx, 'check_in_date', formattedDate);
                                                                DateTimePickerAndroid.open({
                                                                    value: exp.check_in_time ? new Date(`2000-01-01T${exp.check_in_time}`) : new Date(),
                                                                    mode: 'time',
                                                                    onChange: (timeEvent, time) => {
                                                                        if (timeEvent.type === 'set' && time) {
                                                                            const formattedTime = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                                            updateExpenseRow('stay', idx, 'check_in_time', formattedTime);
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    setStayPicker({ visible: true, idx, field: 'check_in_datetime' });
                                                }
                                            }}
                                        >
                                            <Text style={{ color: colors.text }}>
                                                {exp.check_in_date ? new Date(exp.check_in_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'DD MMM YYYY'}
                                                {', '}
                                                {exp.check_in_time ? new Date(`2000-01-01T${exp.check_in_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : 'HH:MM am/pm'}
                                            </Text>
                                            <Ionicons name="time-outline" size={20} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Check-out Date & Time</Text>
                                        <TouchableOpacity
                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                                            onPress={() => {
                                                if (Platform.OS === 'android') {
                                                    DateTimePickerAndroid.open({
                                                        value: exp.checkout_date ? new Date(exp.checkout_date) : new Date(),
                                                        mode: 'date',
                                                        onChange: (event, date) => {
                                                            if (event.type === 'set' && date) {
                                                                const formattedDate = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
                                                                updateExpenseRow('stay', idx, 'checkout_date', formattedDate);
                                                                DateTimePickerAndroid.open({
                                                                    value: exp.checkout_time ? new Date(`2000-01-01T${exp.checkout_time}`) : new Date(),
                                                                    mode: 'time',
                                                                    onChange: (timeEvent, time) => {
                                                                        if (timeEvent.type === 'set' && time) {
                                                                            const formattedTime = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                                            updateExpenseRow('stay', idx, 'checkout_time', formattedTime);
                                                                        }
                                                                    }
                                                                });
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    setStayPicker({ visible: true, idx, field: 'checkout_datetime' });
                                                }
                                            }}
                                        >
                                            <Text style={{ color: colors.text }}>
                                                {exp.checkout_date ? new Date(exp.checkout_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'DD MMM YYYY'}
                                                {', '}
                                                {exp.checkout_time ? new Date(`2000-01-01T${exp.checkout_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : 'HH:MM am/pm'}
                                            </Text>
                                            <Ionicons name="time-outline" size={20} color={colors.primary} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cost (₹)</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.cost}
                                                onChangeText={t => updateExpenseRow('stay', idx, 'cost', t)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                        <TouchableOpacity
                                            style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                            onPress={() => pickImage('stay', idx)}
                                        >
                                            <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                            <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{exp.attach_image ? 'Change' : 'Attach'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {exp.attach_image ? (
                                        <TouchableOpacity
                                            style={styles.imagePreviewContainer}
                                            onPress={() => setPreviewImage(exp.attach_image)}
                                        >
                                            <Image source={{ uri: exp.attach_image }} style={styles.imagePreview} />
                                            <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('stay', idx, 'attach_image', '')}>
                                                <Ionicons name="close-circle" size={20} color={colors.danger} />
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('stay')}>
                                <Ionicons name="add-circle" size={20} color={colors.primary} />
                                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                            </TouchableOpacity>
                        </View>

                        {/* 7.4 Other Expenses */}
                        <View style={{ marginBottom: 20 }}>
                            <View style={styles.itemHeader}>
                                <Text style={[styles.itemLabel, { color: colors.primary }]}>Other Expenses</Text>
                            </View>
                            {form.other_expenses.map((exp, idx) => (
                                <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                    <View style={styles.itemHeader}>
                                        <Text style={[styles.itemLabel, { color: colors.primary }]}>OTHER #{idx + 1}</Text>
                                        <TouchableOpacity onPress={() => removeExpenseRow('other', idx)}>
                                            <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Type</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.expense_type}
                                                onChangeText={t => updateExpenseRow('other', idx, 'expense_type', t)}
                                                placeholder="e.g. Purchase"
                                            />
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Cost (₹)</Text>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={exp.cost}
                                                onChangeText={t => updateExpenseRow('other', idx, 'cost', t)}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Details</Text>
                                        <View style={styles.row}>
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 60, flex: 1 }]}
                                                value={exp.expense_in_details}
                                                onChangeText={t => updateExpenseRow('other', idx, 'expense_in_details', t)}
                                                multiline
                                                placeholder="Detailed description..."
                                            />
                                            <TouchableOpacity
                                                style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border, height: 60, justifyContent: 'center' }]}
                                                onPress={() => pickImage('other', idx)}
                                            >
                                                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                                <Text style={[styles.cameraButtonText, { color: colors.primary, fontSize: 10 }]}>{exp.attach_image ? 'Change' : 'Attach'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    {exp.attach_image ? (
                                        <TouchableOpacity
                                            style={styles.imagePreviewContainer}
                                            onPress={() => setPreviewImage(exp.attach_image)}
                                        >
                                            <Image source={{ uri: exp.attach_image }} style={styles.imagePreview} />
                                            <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('other', idx, 'attach_image', '')}>
                                                <Ionicons name="close-circle" size={20} color={colors.danger} />
                                            </TouchableOpacity>
                                        </TouchableOpacity>
                                    ) : null}
                                </View>
                            ))}
                            <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('other')}>
                                <Ionicons name="add-circle" size={20} color={colors.primary} />
                                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </Section>

                    {/* 8. Visit Summary */}
                    <Section title="Visit Summary" icon="document-text">
                        <View style={[styles.inputWrapper, { marginTop: 16 }]}>
                            <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Expenses</Text>
                                <Text testID="totalVisitCostDetail" style={[styles.totalValue, { color: colors.primary }]}>₹{form.total}</Text>
                            </View>
                        </View>

                        <View style={styles.row}>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Status</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.status}
                                    editable={false}
                                    placeholder="Submitted"
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Company</Text>
                                <TextInput
                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                    value={form.company}
                                    onChangeText={t => updateForm('company', t)}
                                    placeholder="White & Co."
                                    placeholderTextColor={colors.textSecondary}
                                />
                            </View>
                        </View>
                    </Section>

                    {/* 9. Contact Info */}
                    <Section title="Contact Info" icon="person-add">
                        <View style={styles.inputWrapper}>
                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer Address</Text>
                            <TouchableOpacity
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, height: 80, justifyContent: 'center' }]}
                                onPress={() => {
                                    if (!form.customer) {
                                        Alert.alert('Selection Required', 'Please select a customer first.');
                                        return;
                                    }
                                    if (addresses.length === 0) {
                                        Alert.alert('No Addresses', 'No addresses found for this customer.');
                                        return;
                                    }
                                    const options = addresses.map(addr => {
                                        return {
                                            id: addr.name,
                                            label: [addr.address_title, addr.address_line1, addr.address_line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')
                                        };
                                    });
                                    setSelectionModal({
                                        visible: true,
                                        title: 'Select Customer Address',
                                        options: options.map(o => o.label),
                                        onSelect: (label) => {
                                            const selected = options.find(o => o.label === label);
                                            if (selected) updateForm('customer_address', selected.id);
                                        },
                                        selectedValue: addresses.find(a => a.name === form.customer_address)
                                            ? [addresses.find(a => a.name === form.customer_address)!.address_title, addresses.find(a => a.name === form.customer_address)!.address_line1, addresses.find(a => a.name === form.customer_address)!.address_line2, addresses.find(a => a.name === form.customer_address)!.city, addresses.find(a => a.name === form.customer_address)!.state, addresses.find(a => a.name === form.customer_address)!.pincode].filter(Boolean).join(', ')
                                            : form.customer_address
                                    });
                                }}
                            >
                                <Text style={{ color: form.customer_address ? colors.text : colors.textSecondary }} numberOfLines={3}>
                                    {addresses.find(a => a.name === form.customer_address)
                                        ? [addresses.find(a => a.name === form.customer_address)!.address_title, addresses.find(a => a.name === form.customer_address)!.address_line1, addresses.find(a => a.name === form.customer_address)!.address_line2, addresses.find(a => a.name === form.customer_address)!.city, addresses.find(a => a.name === form.customer_address)!.state, addresses.find(a => a.name === form.customer_address)!.pincode].filter(Boolean).join(', ')
                                        : form.customer_address || 'Select Address'}
                                </Text>
                            </TouchableOpacity>
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
                            <TouchableOpacity
                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                onPress={() => {
                                    if (!form.customer) {
                                        Alert.alert('Selection Required', 'Please select a customer first.');
                                        return;
                                    }
                                    if (contacts.length === 0) {
                                        Alert.alert('No Contacts', 'No contacts found for this customer.');
                                        return;
                                    } const options = contacts.map(c => {
                                        return {
                                            id: c.name,
                                            label: [c.first_name, c.last_name].filter(Boolean).join(' ')
                                        };
                                    });
                                    setSelectionModal({
                                        visible: true,
                                        title: 'Select Contact Person',
                                        options: options.map(o => o.label),
                                        onSelect: (label) => {
                                            const selected = options.find(o => o.label === label);
                                            const contact = contacts.find(c => c.name === selected?.id);
                                            if (contact) selectContact(contact);
                                        },
                                        selectedValue: contacts.find(c => c.name === form.contact_person)
                                            ? [contacts.find(c => c.name === form.contact_person)!.first_name, contacts.find(c => c.name === form.contact_person)!.last_name].filter(Boolean).join(' ')
                                            : form.contact_person
                                    });
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <Ionicons name="person-outline" size={18} color={colors.primary} />
                                    <Text style={{ color: form.contact_person ? colors.text : colors.textSecondary }}>
                                        {contacts.find(c => c.name === form.contact_person)
                                            ? [contacts.find(c => c.name === form.contact_person)!.first_name, contacts.find(c => c.name === form.contact_person)!.last_name].filter(Boolean).join(' ')
                                            : form.contact_person || 'Select Contact Person'}
                                    </Text>
                                    {isSearchingContact && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 'auto' }} />}
                                </View>
                            </TouchableOpacity>
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
                    </Section>


                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.cancelButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                            onPress={() => router.back()}
                        >
                            <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.saveButtonWrapper, { backgroundColor: isDark ? colors.surface : '#4F46E5', borderRadius: 16 }]}
                            onPress={handleSave}
                            disabled={isSaving}
                        >
                            <View style={styles.saveButton}>
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <Text style={styles.saveButtonText}>Save Visit</Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {
                datePickerMode && (
                    <DateTimePicker
                        value={form.date_and_time && datePickerMode === 'location' ? new Date(form.date_and_time.replace(' ', 'T')) : form.follow_up_due_date && datePickerMode === 'follow_up' ? new Date(form.follow_up_due_date) : new Date()}
                        mode={(datePickerMode === 'from' || datePickerMode === 'follow_up') ? 'date' : datePickerMode === 'location' ? 'datetime' : 'time'}
                        display="default"
                        onChange={(event, date) => {
                            const mode = datePickerMode;
                            setDatePickerMode(null);
                            if (date) {
                                const today = new Date();
                                const chosenDate = (mode === 'from' || mode === 'follow_up') ? date : mode === 'location' ? date : today;
                                const datePrefix = chosenDate.getFullYear() + '-' + String(chosenDate.getMonth() + 1).padStart(2, '0') + '-' + String(chosenDate.getDate()).padStart(2, '0');
                                const timePart = (mode === 'from' || mode === 'follow_up') ? '00:00:00' : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                                if (mode === 'follow_up') {
                                    updateForm('follow_up_due_date', datePrefix);
                                } else {
                                    updateForm(mode === 'from' ? 'mntc_date' : mode === 'to' ? 'mntc_time' : 'date_and_time', mode === 'from' ? datePrefix : `${datePrefix} ${timePart}`);
                                }
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

            {/* Image Preview Modal */}
            <Modal
                visible={!!previewImage}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPreviewImage(null)}
            >
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' }}
                    onPress={() => setPreviewImage(null)}
                >
                    <Ionicons
                        name="close"
                        size={32}
                        color="#FFF"
                        style={{ position: 'absolute', top: 50, right: 20, zIndex: 1 }}
                    />
                    {previewImage && (
                        <Image
                            source={{ uri: previewImage }}
                            style={{ width: '90%', height: '80%', resizeMode: 'contain' }}
                        />
                    )}
                </Pressable>
            </Modal>

            {stayPicker.visible && Platform.OS !== 'android' && (
                <DateTimePicker
                    value={(() => {
                        const val = form.stay_expenses[stayPicker.idx][stayPicker.field];
                        if (stayPicker.field.includes('date')) return val ? new Date(val) : new Date();
                        if (stayPicker.field.includes('time')) return val ? new Date(`2000-01-01T${val}`) : new Date();
                        return new Date();
                    })()}
                    mode={stayPicker.field.includes('date') ? 'date' : 'time'}
                    display="default"
                    onChange={(event, date) => {
                        if (event.type === 'dismissed' || !date) {
                            setStayPicker({ ...stayPicker, visible: false });
                            return;
                        }
                        const formatted = stayPicker.field.includes('date')
                            ? date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
                            : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                        updateExpenseRow('stay', stayPicker.idx, stayPicker.field, formatted);
                        setStayPicker({ ...stayPicker, visible: false });
                    }}
                />
            )}
        </View>
    );
}

const Section = ({ title, icon, children, style }: any) => {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'];
    const isDark = colorScheme === 'dark';

    return (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
            <View style={styles.sectionHeader}>
                <LinearGradient
                    colors={['#4F46E5', '#3730A3']}
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
    cameraButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        borderWidth: 1,
        marginLeft: 8,
        alignSelf: 'flex-end',
        height: 48,
        gap: 4
    },
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginTop: 8,
    },
    cameraButtonText: {
        fontSize: 12,
        fontWeight: '700',
    },
    imagePreviewContainer: {
        marginTop: 12,
        position: 'relative',
        width: '100%',
        height: 150,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.light.border,
    },
    imagePreview: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    removeImageBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 12,
    },
    headerContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
    headerText: { flex: 1 },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFF', letterSpacing: -0.5 },
    headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    scrollContent: { flex: 1 },
    scrollInner: { padding: 20, paddingBottom: 100 },
    section: { borderRadius: 28, padding: 24, marginBottom: 20, borderWidth: 1 },
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
    row: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
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
    // Total Card
    totalCard: {
        padding: 24,
        borderRadius: 24,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    totalLabel: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1.5,
    },
    totalValue: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -1,
    },
    // Search specific
    searchResultsDropdown: { position: 'absolute', top: 60, left: 0, right: 0, borderRadius: 16, borderWidth: 1, zIndex: 1000, elevation: 5 },
    searchResultItem: { padding: 16, borderBottomWidth: 1 },
    searchResultTitle: { fontSize: 14, fontWeight: '700' },
    searchResultSubtitle: { fontSize: 12, opacity: 0.6, marginTop: 2 }
});

