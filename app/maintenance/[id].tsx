import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiGet, apiPut, uploadFile } from '@/utils/api';
import { parseFrappeError } from '@/utils/frappeError';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
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
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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

interface SalesExecutive {
    name: string;
    sales_person_name: string;
}

export default function MaintenanceDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const [stayPicker, setStayPicker] = useState<{
        visible: boolean;
        idx: number;
        field: 'check_in_date' | 'checkout_date' | 'check_in_time' | 'checkout_time' | 'check_in_datetime' | 'checkout_datetime';
    }>({ visible: false, idx: 0, field: 'check_in_date' });

    // Form fields matching Doctype
    const [form, setForm] = useState({
        name: '',
        customer: '',
        customer_name: '',
        maintenance_type: 'Unscheduled',
        mntc_date: '',
        mntc_time: '',
        customer_address: '',
        purposes: [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '', image: '' }],
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
        assigned_to: '',
        sales_executive: '',
        new_customer: '',
        new_address: '',
        new_contact_number: '',
        new_contact_email: '',
        total: '',
        // Expense fields
        food_expenses: [] as any[],
        travel_expenses: [] as any[],
        stay_expenses: [] as any[],
        other_expenses: [] as any[],
        total_food_cost: 0,
        total_travel_cost: 0,
        total_stay_cost: 0,
        total_other_cost: 0,
    });

    // Customer Selection state
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Date & Time Picker States
    const [datePickerMode, setDatePickerMode] = useState<'from' | 'follow_up' | null>(null);
    const [timePickerMode, setTimePickerMode] = useState<'from' | null>(null);
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

    // Authority Search States
    const [authorities, setAuthorities] = useState<any[]>([]);
    const [authorityQuery, setAuthorityQuery] = useState('');
    const [isSearchingAuthority, setIsSearchingAuthority] = useState(false);
    const [showAuthorityResults, setShowAuthorityResults] = useState(false);
    const [addresses, setAddresses] = useState<any[]>([]);
    const [isSearchingAddress, setIsSearchingAddress] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'location' | 'expenses' | 'summary'>('details');

    // Sales Executive Search States
    const [salesExecutives, setSalesExecutives] = useState<any[]>([]);
    const [salesExecQuery, setSalesExecQuery] = useState('');
    const [isSearchingSalesExec, setIsSearchingSalesExec] = useState(false);
    const [showSalesExecResults, setShowSalesExecResults] = useState(false);
    const [salesExecModalVisible, setSalesExecModalVisible] = useState(false);

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

            const res = await apiGet(apiUrl(`/api/resource/Maintenance%20Visit/${id}`), sessionCookies);

            if (!res.ok) throw new Error(`Failed to fetch details (Status: ${res.status})`);

            const v = res.data?.data || res.data?.message;

            if (!v) {
                console.warn('[MaintenanceDetail] No data found in response:', res.data);
                throw new Error('Record not found on server');
            }
            console.log('[MaintenanceDetail] Loaded Record Data:', v);

            // Deduplicate purposes logic
            const rawPurposes = (v.purposes && Array.isArray(v.purposes)) ? v.purposes : [];
            const rawMntcPurposes = (v.maintenance_visit_purposes && Array.isArray(v.maintenance_visit_purposes)) ? v.maintenance_visit_purposes : [];
            const allPurposes = [...rawPurposes, ...rawMntcPurposes];

            // Filter out duplicates by item_code and work_done
            const uniquePurposes = allPurposes.filter((item, index, self) =>
                index === self.findIndex((t) => (
                    (t.item_code || '').trim().toLowerCase() === (item.item_code || '').trim().toLowerCase() &&
                    (t.item_name || '').trim().toLowerCase() === (item.item_name || '').trim().toLowerCase() &&
                    (t.work_done || '').trim().toLowerCase() === (item.work_done || '').trim().toLowerCase()
                ))
            ).map((p: any) => ({
                item_code: p.item_code || '',
                item_name: p.item_name || '',
                description: p.description || '',
                work_done: p.work_done || '',
                service_person: p.service_person || '',
                image: p.image || ''
            }));

            setForm({
                ...form,
                name: v.name || '',
                customer: v.customer || '',
                customer_name: v.customer_name || '',
                maintenance_type: v.maintenance_type || 'Unscheduled',
                mntc_date: v.mntc_date || '',
                mntc_time: v.mntc_time || '',
                customer_address: v.customer_address || '',
                purposes: uniquePurposes.length > 0 ? uniquePurposes : [{ item_code: '', item_name: '', description: '', work_done: '', service_person: '', image: '' }],
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
                assigned_to: v.assigned_to || '',
                sales_executive: v.sales_executive || '',
                new_customer: v.new_customer || '',
                new_address: v.new_address || '',
                new_contact_number: v.new_contact_number || '',
                new_contact_email: v.new_contact_email || '',
                total: v.total || '',
                food_expenses: (v.food_expenses || v.food_expense || []).map((ex: any) => ({ ...ex, cost: ex.cost || ex.amount || ex.expense_amount || '0' })),
                travel_expenses: (v.travel_expenses || v.travel_expense || v.travel_details || []).map((ex: any) => ({ ...ex, cost: ex.cost || ex.amount || ex.expense_amount || '0' })),
                stay_expenses: (v.stay_expenses || v.stay_expense || []).map((ex: any) => ({ ...ex, cost: ex.cost || ex.amount || ex.expense_amount || '0' })),
                other_expenses: (v.other_expenses || v.other_expense || []).map((ex: any) => ({ ...ex, cost: ex.cost || ex.amount || ex.expense_amount || '0' })),
                total_food_cost: (v.food_expenses || v.food_expense || []).reduce((sum: number, x: any) => sum + (parseFloat(x.cost || x.amount || x.expense_amount) || 0), 0),
                total_travel_cost: (v.travel_expenses || v.travel_expense || v.travel_details || []).reduce((sum: number, x: any) => sum + (parseFloat(x.cost || x.amount || x.expense_amount) || 0), 0),
                total_stay_cost: (v.stay_expenses || v.stay_expense || []).reduce((sum: number, x: any) => sum + (parseFloat(x.cost || x.amount || x.expense_amount) || 0), 0),
                total_other_cost: (v.other_expenses || v.other_expense || []).reduce((sum: number, x: any) => sum + (parseFloat(x.cost || x.amount || x.expense_amount) || 0), 0),
            });
            console.log('[MaintenanceDetail] Loaded Record:', v.name);
            setSearchQuery(v.customer_name || v.customer || '');
            setSalesExecQuery(v.sales_executive || '');

            if (v.customer) {
                fetchAddresses(v.customer);
                fetchContacts(v.customer);
            }
        } catch (err) {
            console.error('Fetch Details Error:', err);
            const msg = (err instanceof Error) ? err.message : String(err);
            Alert.alert("Error", `Could not load visit details: ${msg}`);
            router.back();
        } finally {
            setLoading(false);
        }
    };

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

    const fetchCustomers = async (query: string = '') => {
        if (!query.trim()) {
            setCustomers([]);
            setShowResults(false);
            return;
        }
        setIsSearching(true);
        setSearchError(null);

        const result = await searchCustomers(query);
        if (!result.ok) setSearchError(result.error);
        setCustomers(result.data);
        setShowResults(true);
        setIsSearching(false);
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
        setSearchQuery(c.customer_name);
        setContactQuery('');
        setContacts([]);
        setShowResults(false);

        // Fetch deeper details
        fetchAddressAndContact(c.name, c.customer_primary_address, c.customer_primary_contact);
        fetchAddresses(c.name);
        fetchContacts(c.name);
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
            const cleanDescription = item.description ? item.description.replace(/<[^>]*>/g, '') : '';

            newPurposes[index] = {
                ...newPurposes[index],
                item_code: item.name,
                item_name: item.item_name,
                description: cleanDescription,
                image: newPurposes[index].image || ''
            };
            return { ...prev, purposes: newPurposes };
        });
        setShowItemResults(false);
        setActiveItemSearchIndex(null);
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


    const addPurposeRow = () => {
        setForm(prev => ({
            ...prev,
            purposes: [...prev.purposes, { item_code: '', item_name: '', description: '', work_done: '', service_person: '', image: '' }]
        }));
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
        const f = form.food_expenses.reduce((sum, e) => sum + (parseFloat(e.cost || e.amount) || 0), 0);
        const t = form.travel_expenses.reduce((sum, e) => sum + (parseFloat(e.cost || e.amount) || 0), 0);
        const s = form.stay_expenses.reduce((sum, e) => sum + (parseFloat(e.cost || e.amount) || 0), 0);
        const o = form.other_expenses.reduce((sum, e) => sum + (parseFloat(e.cost || e.amount) || 0), 0);
        const total = (f + t + s + o).toFixed(2);

        if (form.total !== total || form.total_food_cost !== f || form.total_travel_cost !== t || form.total_stay_cost !== s || form.total_other_cost !== o) {
            setForm(prev => ({
                ...prev,
                total: total,
                total_food_cost: f,
                total_travel_cost: t,
                total_stay_cost: s,
                total_other_cost: o
            }));
        }
    }, [form.food_expenses, form.travel_expenses, form.stay_expenses, form.other_expenses]);

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

            // 1. Upload Images for Purposes if new
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

            // 2. Upload Images for Expenses if new
            const uploadExpenseImages = async (expenses: any[]) => {
                return await Promise.all(expenses.map(async (e) => {
                    const img = e.attach_image || e.image;
                    if (img && img.startsWith('file://')) {
                        const uploadRes = await uploadFile(`${IMAGE_HOST}/api/method/upload_file`, { uri: img }, sessionCookies);
                        if (uploadRes.ok && uploadRes.data?.message?.file_url) {
                            const updatedRow = { ...e };
                            if (e.attach_image !== undefined) updatedRow.attach_image = uploadRes.data.message.file_url;
                            if (e.image !== undefined) updatedRow.image = uploadRes.data.message.file_url;
                            if (e.attach_image === undefined && e.image === undefined) updatedRow.attach_image = uploadRes.data.message.file_url;
                            return updatedRow;
                        }
                    }
                    return e;
                }));
            };

            const purposes_updated = await uploadPurposeImages(form.purposes);
            const food_updated = await uploadExpenseImages(form.food_expenses);
            const travel_updated = await uploadExpenseImages(form.travel_expenses);
            const stay_updated = await uploadExpenseImages(form.stay_expenses);
            const other_updated = await uploadExpenseImages(form.other_expenses);

            const purposes_payload = purposes_updated
                .filter(row => row.item_code.trim() !== '')
                .map(row => ({
                    doctype: 'Maintenance Visit Purpose',
                    item_code: row.item_code,
                    item_name: row.item_name || row.item_code,
                    description: row.description || row.item_name || row.item_code,
                    work_done: row.work_done,
                }));

            const payload = {
                doctype: 'Maintenance Visit',
                name: form.name,
                customer: form.customer,
                customer_name: form.customer_name,
                maintenance_type: form.maintenance_type,
                mntc_date: form.mntc_date,
                mntc_time: form.mntc_time,
                customer_address: form.customer_address,
                new_customer: form.new_customer,
                new_address: form.new_address,
                new_contact_number: form.new_contact_number,
                new_contact_email: form.new_contact_email,
                purposes: form.purposes
                    .filter(row => row.item_code.trim() !== '')
                    .map(row => ({
                        doctype: 'Maintenance Visit Purpose',
                        item_code: row.item_code,
                        item_name: row.item_name || row.item_code,
                        description: row.description || row.item_name || row.item_code,
                        work_done: row.work_done,
                        image: row.image || '',
                    })),
                maintenance_visit_purposes: form.purposes
                    .filter(row => row.item_code.trim() !== '')
                    .map(row => ({
                        doctype: 'Maintenance Visit Purpose',
                        item_code: row.item_code,
                        item_name: row.item_name || row.item_code,
                        description: row.description || row.item_name || row.item_code,
                        work_done: row.work_done,
                        image: row.image || '',
                    })),
                status: form.status,
                location: form.location,
                date_and_time: form.date_and_time,
                contact_person: form.contact_person,
                territory: form.territory,
                customer_feedback: form.customer_feedback,
                company: form.company,
                completion_status: form.completion_status,
                follow_up_required: form.follow_up_required ? 1 : 0,
                follow_up_due_date: form.follow_up_due_date,
                follow_up_notes: form.follow_up_notes,
                follow_up_type: form.follow_up_type,
                follow_up_status: form.follow_up_status,
                follow_up_owner: form.follow_up_owner,
                contact_email: form.contact_email,
                contact_mobile: form.contact_mobile,
                sales_executive: form.sales_executive,
                food_expenses: food_updated.filter((e: any) => (e.cost || e.amount) || e.food_type),
                food_expense: food_updated.filter((e: any) => (e.cost || e.amount) || e.food_type),
                travel_expenses: travel_updated.filter((e: any) => (e.cost || e.amount) || e.from_location || e.to_location),
                travel_expense: travel_updated.filter((e: any) => (e.cost || e.amount) || e.from_location || e.to_location),
                stay_expenses: stay_updated.filter((e: any) => (e.cost || e.amount) || e.hotel_name),
                stay_expense: stay_updated.filter((e: any) => (e.cost || e.amount) || e.hotel_name),
                other_expenses: other_updated.filter((e: any) => (e.cost || e.amount) || e.description),
                other_expense: other_updated.filter((e: any) => (e.cost || e.amount) || e.description),
                total: form.total
            };

            const res = await apiPut(
                apiUrl(`/api/resource/Maintenance%20Visit/${id}`),
                payload,
                sessionCookies
            );

            if (!res.ok) {
                console.error('Server Error Data:', res.data);
                throw new Error(parseFrappeError(res.data, 'Update failed'));
            }

            Alert.alert("Success", "Record synced to ERPNext.", [
                { text: "OK", onPress: () => { setIsEditing(false); fetchMaintenanceDetails(); } }
            ]);
        } catch (err) {
            console.error('Update Error:', err);
            // The server's actual reason was parsed into this error above and
            // then thrown away in favour of a generic string, leaving the user
            // with no idea which field the server rejected.
            const msg = (err && typeof err === 'object' && 'message' in err)
                ? String((err as any).message)
                : 'Could not save changes.';
            Alert.alert("Sync Error", msg);
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
                style={[styles.headerGradient, { backgroundColor: isDark ? '#000000' : '#F8FAFC' }]}
            >
                <SafeAreaView>
                    <View style={styles.header}>
                        <TouchableOpacity testID="backBtn" onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
                            <Ionicons name="chevron-back" size={24} color={colors.primary} />
                        </TouchableOpacity>
                        <Text testID="visitHeaderTitle" style={[styles.headerTitle, { color: colors.text }]}>Visit Details</Text>
                        <View style={{ width: 44 }} />
                    </View>
                </SafeAreaView>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                    style={styles.container}
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
                    showsVerticalScrollIndicator={false}
                >
                    {/* New Premium Header */}
                    <View style={styles.premiumHeader}>
                        <View style={{ flex: 1, marginRight: 12 }}>
                            <View style={styles.titleRow}>
                                <Text testID="visitTitle" style={[styles.headerTitle, { color: colors.text }]}>Visit Details</Text>
                                <View style={styles.idBadgePill} testID="visitIDBadge">
                                    <Text style={styles.idBadgeText}>{form.name}</Text>
                                </View>
                            </View>
                            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Complete visit information</Text>
                        </View>
                        <TouchableOpacity testID="editVisitBtn" style={styles.premiumEditBtn} onPress={() => setIsEditing(!isEditing)}>
                            <Ionicons name={isEditing ? "close" : "create-outline"} size={20} color="#FFF" />
                            <Text style={styles.premiumEditBtnText}>{isEditing ? "Cancel" : "Edit"}</Text>
                        </TouchableOpacity>
                    </View>

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
                            <TouchableOpacity
                                style={{ position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 10 }}
                                onPress={() => setPreviewImage(null)}
                            >
                                <Ionicons name="close-circle" size={40} color="#FFF" />
                            </TouchableOpacity>
                            {previewImage && (
                                <Image
                                    source={{ uri: previewImage }}
                                    style={{ width: '95%', height: '80%', resizeMode: 'contain' }}
                                />
                            )}
                        </Pressable>
                    </Modal>

                    {/* Hero Card */}
                    <LinearGradient
                        colors={['#1E40AF', '#1E3A8A']}
                        style={styles.heroCard}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <View style={styles.heroGrid}>
                            <View style={styles.heroItem}>
                                <View style={styles.heroLabelRow}>
                                    <Ionicons name="person-outline" size={14} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.heroLabel}>Customer Name</Text>
                                </View>
                                <Text style={styles.heroValue} numberOfLines={2}>{form.customer_name || form.customer}</Text>
                            </View>
                            <View style={styles.heroItem}>
                                <View style={styles.heroLabelRow}>
                                    <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.heroLabel}>Date</Text>
                                </View>
                                <Text style={styles.heroValue}>{form.mntc_date || 'N/A'}</Text>
                            </View>
                        </View>
                        <View style={[styles.heroGrid, { marginTop: 16 }]}>
                            <View style={styles.heroItem}>
                                <View style={styles.heroLabelRow}>
                                    <Ionicons name="briefcase-outline" size={14} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.heroLabel}>Visit Type</Text>
                                </View>
                                <View style={styles.heroBadge} testID="visitTypeBadge">
                                    <Text style={styles.heroBadgeText}>{form.maintenance_type}</Text>
                                </View>
                            </View>
                            <View style={styles.heroItem}>
                                <View style={styles.heroLabelRow}>
                                    <Ionicons name="cube-outline" size={14} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.heroLabel}>Status</Text>
                                </View>
                                <View style={[styles.heroBadge, { backgroundColor: '#10B981' }]} testID="visitStatusBadge">
                                    <Text style={styles.heroBadgeText}>{form.status}</Text>
                                </View>
                            </View>
                        </View>

                        {form.follow_up_required === 1 && (
                            <View style={[
                                styles.followUpAlert,
                                // The solid pastel-red panel is far too bright on a
                                // dark background — tint it instead.
                                isDark && { backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.35)' },
                            ]}>
                                <View style={[styles.alertIconBox, isDark && { backgroundColor: 'rgba(239, 68, 68, 0.2)' }]}>
                                    <Ionicons name="alert-circle" size={20} color="#EF4444" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.alertTitle, isDark && { color: '#FCA5A5' }]}>Follow Up Required</Text>
                                    <Text style={[styles.alertSubtitle, isDark && { color: '#FCA5A5' }]}>Due: {form.follow_up_due_date || 'N/A'}</Text>
                                </View>
                            </View>
                        )}
                    </LinearGradient>

                    {/* Tab Navigation */}
                    <View style={styles.tabScrollWrapper}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollContent}>
                            {[
                                { id: 'details', label: 'Details', icon: 'document-text' },
                                { id: 'location', label: 'Location & Contact', icon: 'location' },
                                { id: 'expenses', label: 'Expenses', icon: 'cash' },
                                { id: 'summary', label: 'Summary', icon: 'chatbubbles' }
                            ].map((tab) => (
                                <TouchableOpacity
                                    key={tab.id}
                                    style={[
                                        styles.tabItem,
                                        activeTab === tab.id && styles.activeTabItem,
                                        // A white pill looked out of place against the
                                        // dark background; use the elevated surface there.
                                        { backgroundColor: activeTab === tab.id ? (isDark ? colors.surfaceVariant : '#FFF') : 'transparent' }
                                    ]}
                                    onPress={() => setActiveTab(tab.id as any)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? (isDark ? colors.tint : '#1E3A8A') : colors.textSecondary} />
                                        <Text style={[
                                            styles.tabText,
                                            { color: activeTab === tab.id ? (isDark ? colors.tint : '#1E3A8A') : colors.textSecondary }
                                        ]}>
                                            {tab.label}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>

                    {/* Tab Content: Details */}
                    {activeTab === 'details' && (
                        <Animated.View entering={FadeInDown.duration(400)}>
                            <Section title="Customer & Schedule" icon="business">
                                {!isEditing ? (
                                    <>
                                        <DetailItem testID="customerNameDetail" label="Customer" value={form.customer_name} icon="business" flex={2} />
                                        <DetailItem label="Assigned To" value={form.assigned_to} icon="person" />
                                        <View style={styles.row}>
                                            <DetailItem testID="visitDateDetail" label="Visit Date" value={formatDate(form.mntc_date)} icon="calendar" flex={1} />
                                            <DetailItem label="Visit Time" value={form.mntc_time} icon="time" flex={1} />
                                        </View>
                                        <DetailItem label="Sales Executive" value={form.sales_executive} icon="mail" />
                                    </>
                                ) : (
                                    <View style={{ gap: 16 }}>
                                        <View style={styles.inputWrapper}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Customer</Text>
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
                                                    <Ionicons name={searchError ? "alert-circle-outline" : "business-outline"} size={24} color={searchError ? colors.danger : colors.textSecondary} />
                                                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{searchError ? "Search failed" : "No match found"}</Text>
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
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={[styles.resultName, { color: colors.text }]}>{c.customer_name}</Text>
                                                                    <Text style={[styles.resultId, { color: colors.textSecondary }]}>{c.territory || 'All Territories'}</Text>
                                                                </View>
                                                            </TouchableOpacity>
                                                        ))}
                                                    </ScrollView>
                                                </View>
                                            )}
                                        </View>

                                        <View style={[styles.inputWrapper, { marginBottom: 16 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Assigned To</Text>
                                            {isEditing ? (
                                                <View style={{ flex: 1 }}>
                                                    <View style={[styles.searchBox, { backgroundColor: colors.background, borderColor: colors.border }, showAuthorityResults && styles.searchBoxActive]}>
                                                        <Ionicons name="person-outline" size={18} color={colors.primary} />
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
                                            ) : (
                                                <Text style={[styles.detailValue, { color: colors.text }]}>
                                                    {form.assigned_to || '-'}
                                                </Text>
                                            )}
                                        </View>

                                        <View style={styles.row}>
                                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Date</Text>
                                                {isEditing ? (
                                                    <TouchableOpacity
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                        onPress={() => setDatePickerMode('from')}
                                                    >
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Text style={{ color: form.mntc_date ? colors.text : colors.textSecondary }}>
                                                                {form.mntc_date || 'YYYY-MM-DD'}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <Text style={[styles.detailValue, { color: colors.text }]}>{form.mntc_date || '-'}</Text>
                                                )}
                                            </View>
                                            <View style={[styles.inputWrapper, { flex: 1 }]}>
                                                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Visit Time</Text>
                                                {isEditing ? (
                                                    <TouchableOpacity
                                                        testID="timePickerBtn"
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                        onPress={() => setTimePickerMode('from')}
                                                    >
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <Text style={{ color: form.mntc_time ? colors.text : colors.textSecondary }}>
                                                                {form.mntc_time || 'HH:MM:SS'}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : (
                                                    <Text testID="visitTimeDetail" style={[styles.detailValue, { color: colors.text }]}>{form.mntc_time || '-'}</Text>
                                                )}
                                            </View>
                                        </View>

                                        <View style={styles.inputWrapper}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Sales Executive</Text>
                                            <TextInput
                                                testID="salesExecutiveInput"
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.sales_executive}
                                                onChangeText={t => updateForm('sales_executive', t)}
                                            />
                                        </View>
                                    </View>
                                )}
                            </Section>

                            <Section title="Scope of Work" icon="list">
                                <View style={{ gap: 16 }}>
                                    {form.purposes.map((p, idx) => (
                                        <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                            <View style={styles.itemHeader}>
                                                <Text style={[styles.itemLabel, { color: colors.primary }]}>SERVICE ITEM #{idx + 1}</Text>
                                                {isEditing && (
                                                    <TouchableOpacity onPress={() => {
                                                        const newPurp = [...form.purposes];
                                                        newPurp.splice(idx, 1);
                                                        updateForm('purposes', newPurp);
                                                    }}>
                                                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            {isEditing ? (
                                                <View style={{ gap: 12 }}>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                        placeholder="Task/Item name"
                                                        value={p.item_name}
                                                        onChangeText={t => {
                                                            const n = [...form.purposes];
                                                            n[idx].item_name = t;
                                                            updateForm('purposes', n);
                                                        }}
                                                    />
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                                        placeholder="Description"
                                                        value={p.description}
                                                        onChangeText={t => {
                                                            const newPurp = [...form.purposes];
                                                            newPurp[idx].description = t;
                                                            updateForm('purposes', newPurp);
                                                        }}
                                                        multiline
                                                    />

                                                </View>
                                            ) : (
                                                <View>
                                                    <Text style={[styles.detailValue, { color: colors.text }]}>{p.item_name || 'Generic Task'}</Text>
                                                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4 }}>{p.description || 'No description provided'}</Text>
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                    {isEditing && (
                                        <TouchableOpacity
                                            style={[styles.addBtn, { borderColor: colors.primary }]}
                                            onPress={() => updateForm('purposes', [...form.purposes, { item_code: '', item_name: '', description: '', work_done: '', service_person: '' }])}
                                        >
                                            <Ionicons name="add-circle" size={20} color={colors.primary} />
                                            <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Task</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </Section>

                            <Section title="New Customer Details" icon="person-add">
                                <View style={{ gap: 16 }}>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Customer Name</Text>
                                        {isEditing ? (
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                value={form.new_customer}
                                                onChangeText={(v) => updateForm('new_customer', v)}
                                                placeholder="Enter new customer name"
                                            />
                                        ) : (
                                            <Text style={[styles.detailValue, { color: colors.text }]}>{form.new_customer || '-'}</Text>
                                        )}
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Customer Address</Text>
                                        {isEditing ? (
                                            <TextInput
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80, textAlignVertical: 'top', paddingTop: 12 }]}
                                                value={form.new_address}
                                                onChangeText={(v) => updateForm('new_address', v)}
                                                multiline
                                                placeholder="Enter new customer address"
                                            />
                                        ) : (
                                            <Text style={[styles.detailValue, { color: colors.text }]}>{form.new_address || '-'}</Text>
                                        )}
                                    </View>

                                    <View style={styles.row}>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Contact Number</Text>
                                            {isEditing ? (
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    value={form.new_contact_number}
                                                    onChangeText={(v) => updateForm('new_contact_number', v)}
                                                    keyboardType="phone-pad"
                                                    placeholder="Number"
                                                />
                                            ) : (
                                                <Text style={[styles.detailValue, { color: colors.text }]}>{form.new_contact_number || '-'}</Text>
                                            )}
                                        </View>
                                        <View style={[styles.inputWrapper, { flex: 1 }]}>
                                            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>New Contact Email</Text>
                                            {isEditing ? (
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    value={form.new_contact_email}
                                                    onChangeText={(v) => updateForm('new_contact_email', v)}
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                    placeholder="Email"
                                                />
                                            ) : (
                                                <Text style={[styles.detailValue, { color: colors.text }]}>{form.new_contact_email || '-'}</Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </Section>
                        </Animated.View>
                    )}

                    {/* Tab Content: Location */}
                    {activeTab === 'location' && (
                        <Animated.View entering={FadeInDown.duration(400)}>
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

                            <Section title="Contact Info" icon="person">
                                <View style={{ gap: 16 }}>
                                    <View style={styles.inputWrapper}>
                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Address</Text>
                                        {isEditing ? (
                                            <TouchableOpacity
                                                testID="addressPickerBtn"
                                                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, height: 80, justifyContent: 'center' }]}
                                                onPress={() => {
                                                    const options = addresses.map(addr => ({
                                                        id: addr.name,
                                                        label: [addr.address_title, addr.address_line1, addr.city].filter(Boolean).join(', ')
                                                    }));
                                                    setSelectionModal({
                                                        visible: true,
                                                        title: 'Select Address',
                                                        options: options.map(o => o.label),
                                                        onSelect: (label) => {
                                                            const selected = options.find(o => o.label === label);
                                                            if (selected) updateForm('customer_address', selected.id);
                                                        },
                                                        selectedValue: form.customer_address
                                                    });
                                                }}
                                            >
                                                <Text style={{ color: form.customer_address ? colors.text : colors.textSecondary }}>
                                                    {form.customer_address || 'Select Address'}
                                                </Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <Text style={[styles.detailValue, { color: colors.text }]}>{form.customer_address || '-'}</Text>
                                        )}
                                    </View>

                                    <View style={styles.row}>
                                        <DetailItem testID="contactPersonDetail" label="Contact Person" value={form.contact_person} flex={1} />
                                        <DetailItem testID="contactMobileDetail" label="Mobile" value={form.contact_mobile} flex={1} />
                                    </View>
                                    <DetailItem testID="contactEmailDetail" label="Email" value={form.contact_email} icon="mail" />
                                </View>
                            </Section>

                        </Animated.View>
                    )}

                    {/* Tab Content: Expenses */}
                    {activeTab === 'expenses' && (
                        <Animated.View entering={FadeInDown.duration(400)}>
                            <Section title="Expenses Summary" icon="cash">
                                <View style={{ gap: 12 }}>
                                    <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                                        <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Total Visit Cost</Text>
                                        <Text style={[styles.totalValue, { color: colors.primary }]}>₹{form.total || 0}</Text>
                                    </View>
                                    <View style={styles.row}>
                                        <DetailItem testID="totalFoodCostDetail" label="Food" value={`₹${form.total_food_cost || 0}`} flex={1} />
                                        <DetailItem testID="totalTravelCostDetail" label="Travel" value={`₹${form.total_travel_cost || 0}`} flex={1} />
                                    </View>
                                    <View style={styles.row}>
                                        <DetailItem testID="totalStayCostDetail" label="Stay" value={`₹${form.total_stay_cost || 0}`} flex={1} />
                                        <DetailItem testID="totalOtherCostDetail" label="Other" value={`₹${form.total_other_cost || 0}`} flex={1} />
                                    </View>
                                </View>
                            </Section>

                            {/* Food Expenses */}
                            <Section title="Food Expenses" icon="restaurant">
                                {form.food_expenses.map((exp, idx) => (
                                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <View style={styles.itemHeader}>
                                            <Text style={[styles.itemLabel, { color: colors.primary }]}>MEAL #{idx + 1}</Text>
                                            {isEditing && (
                                                <TouchableOpacity onPress={() => removeExpenseRow('food', idx)}>
                                                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        {isEditing ? (
                                            <View style={{ gap: 12 }}>
                                                <TouchableOpacity
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                    onPress={() => setSelectionModal({
                                                        visible: true,
                                                        title: 'Select Meal Type',
                                                        options: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
                                                        onSelect: (v) => updateExpenseRow('food', idx, 'meal_type', v),
                                                        selectedValue: exp.meal_type
                                                    })}
                                                >
                                                    <Text style={{ color: colors.text }}>{exp.meal_type || 'Select Meal'}</Text>
                                                </TouchableOpacity>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    placeholder="Cost"
                                                    value={String(exp.cost || exp.amount || '0')}
                                                    onChangeText={t => updateExpenseRow('food', idx, 'cost', t)}
                                                    keyboardType="numeric"
                                                />
                                                <View style={styles.attachmentRow}>
                                                    <TouchableOpacity
                                                        style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        onPress={() => pickImage('food', idx)}
                                                    >
                                                        <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                                        <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{(exp.attach_image || exp.image) ? 'Change' : 'Attach Image'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('food', idx, 'attach_image', '')}>
                                                            <Ionicons name="close-circle" size={20} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                <View style={styles.row}>
                                                    <DetailItem testID={`foodType_${idx}`} label="Type" value={exp.meal_type} flex={1} />
                                                    <DetailItem testID={`foodAmount_${idx}`} label="Cost" value={`₹${exp.cost || exp.amount || '0'}`} flex={1} />
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <View style={styles.imageOverlay}>
                                                            <Ionicons name="expand-outline" size={14} color="#FFF" />
                                                            <Text style={styles.imageOverlayText}>Tap to enlarge</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        )}
                                    </View>
                                ))}
                                {isEditing && (
                                    <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('food')}>
                                        <Ionicons name="add-circle" size={20} color={colors.primary} />
                                        <Text style={[styles.addBtnText, { color: colors.primary }]}>Add </Text>
                                    </TouchableOpacity>
                                )}
                            </Section>

                            {/* Travel Expenses */}
                            <Section title="Travel Expenses" icon="car">
                                {form.travel_expenses.map((exp, idx) => (
                                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <View style={styles.itemHeader}>
                                            <Text style={[styles.itemLabel, { color: colors.primary }]}>TRAVEL #{idx + 1}</Text>
                                            {isEditing && (
                                                <TouchableOpacity onPress={() => removeExpenseRow('travel', idx)}>
                                                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        {isEditing ? (
                                            <View style={{ gap: 12 }}>
                                                <View style={styles.row}>
                                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>From</Text>
                                                        <TextInput
                                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                            placeholder="From Location"
                                                            value={exp.from_location}
                                                            onChangeText={t => updateExpenseRow('travel', idx, 'from_location', t)}
                                                        />
                                                    </View>
                                                    <View style={[styles.inputWrapper, { flex: 1 }]}>
                                                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>To</Text>
                                                        <TextInput
                                                            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                            placeholder="To Location"
                                                            value={exp.to_location}
                                                            onChangeText={t => updateExpenseRow('travel', idx, 'to_location', t)}
                                                        />
                                                    </View>
                                                </View>
                                                <View style={styles.row}>
                                                    <TouchableOpacity
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center', flex: 1 }]}
                                                        onPress={() => setSelectionModal({
                                                            visible: true,
                                                            title: 'Mode of Travel',
                                                            options: ['Taxi', 'Bus', 'Train', 'Flight', 'Auto', 'Bike', 'Other'],
                                                            onSelect: (v) => updateExpenseRow('travel', idx, 'mode_of_travel', v),
                                                            selectedValue: exp.mode_of_travel
                                                        })}
                                                    >
                                                        <Text style={{ color: colors.text }}>{exp.mode_of_travel || 'Select Mode'}</Text>
                                                    </TouchableOpacity>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, flex: 1 }]}
                                                        placeholder="Cost"
                                                        value={String(exp.cost || exp.amount || '0')}
                                                        onChangeText={t => updateExpenseRow('travel', idx, 'cost', t)}
                                                        keyboardType="numeric"
                                                    />
                                                </View>
                                                <View style={styles.attachmentRow}>
                                                    <TouchableOpacity
                                                        style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        onPress={() => pickImage('travel', idx)}
                                                    >
                                                        <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                                        <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{(exp.attach_image || exp.image) ? 'Change' : 'Attach Image'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('travel', idx, 'attach_image', '')}>
                                                            <Ionicons name="close-circle" size={20} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                <View style={styles.row}>
                                                    <DetailItem label="From" value={exp.from_location} flex={1} />
                                                    <DetailItem label="To" value={exp.to_location} flex={1} />
                                                </View>
                                                <View style={styles.row}>
                                                    <DetailItem testID={`travelMode_${idx}`} label="Mode" value={exp.mode_of_travel} flex={1} />
                                                    <DetailItem testID={`travelAmount_${idx}`} label="Cost" value={`₹${exp.cost || exp.amount || '0'}`} flex={1} />
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <View style={styles.imageOverlay}>
                                                            <Ionicons name="expand-outline" size={14} color="#FFF" />
                                                            <Text style={styles.imageOverlayText}>Tap to enlarge</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        )}
                                    </View>
                                ))}
                                {isEditing && (
                                    <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('travel')}>
                                        <Ionicons name="add-circle" size={20} color={colors.primary} />
                                        <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                                    </TouchableOpacity>
                                )}
                            </Section>

                            {/* Stay Expenses */}
                            <Section title="Stay Expenses" icon="bed">
                                {form.stay_expenses.map((exp, idx) => (
                                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <View style={styles.itemHeader}>
                                            <Text style={[styles.itemLabel, { color: colors.primary }]}>STAY #{idx + 1}</Text>
                                            {isEditing && (
                                                <TouchableOpacity onPress={() => removeExpenseRow('stay', idx)}>
                                                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        {isEditing ? (
                                            <View style={{ gap: 12 }}>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    placeholder="Hotel Name"
                                                    value={exp.hotel_name}
                                                    onChangeText={t => updateExpenseRow('stay', idx, 'hotel_name', t)}
                                                />
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
                                                                            setTimeout(() => {
                                                                                DateTimePickerAndroid.open({
                                                                                    value: exp.check_in_time ? new Date(`2000-01-01T${exp.check_in_time}`) : new Date(),
                                                                                    mode: 'time',
                                                                                    is24Hour: false,
                                                                                    onChange: (timeEvent, time) => {
                                                                                        if (timeEvent.type === 'set' && time) {
                                                                                            const formattedTime = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                                                            updateExpenseRow('stay', idx, 'check_in_time', formattedTime);
                                                                                        }
                                                                                    }
                                                                                });
                                                                            }, 150);
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
                                                            {exp.check_in_time ? new Date(`2000-01-01T${exp.check_in_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : 'hh:mm am/pm'}
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
                                                                            setTimeout(() => {
                                                                                DateTimePickerAndroid.open({
                                                                                    value: exp.checkout_time ? new Date(`2000-01-01T${exp.checkout_time}`) : new Date(),
                                                                                    mode: 'time',
                                                                                    is24Hour: false,
                                                                                    onChange: (timeEvent, time) => {
                                                                                        if (timeEvent.type === 'set' && time) {
                                                                                            const formattedTime = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                                                            updateExpenseRow('stay', idx, 'checkout_time', formattedTime);
                                                                                        }
                                                                                    }
                                                                                });
                                                                            }, 150);
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
                                                            {exp.checkout_time ? new Date(`2000-01-01T${exp.checkout_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : 'hh:mm am/pm'}
                                                        </Text>
                                                        <Ionicons name="time-outline" size={20} color={colors.primary} />
                                                    </TouchableOpacity>
                                                </View>
                                                <View style={styles.row}>
                                                    <TextInput
                                                        style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, flex: 1 }]}
                                                        placeholder="Cost"
                                                        value={String(exp.cost || exp.amount || '0')}
                                                        onChangeText={t => updateExpenseRow('stay', idx, 'cost', t)}
                                                        keyboardType="numeric"
                                                    />
                                                </View>
                                                <View style={styles.attachmentRow}>
                                                    <TouchableOpacity
                                                        style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        onPress={() => pickImage('stay', idx)}
                                                    >
                                                        <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                                        <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{(exp.attach_image || exp.image) ? 'Change' : 'Attach Image'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('stay', idx, 'attach_image', '')}>
                                                            <Ionicons name="close-circle" size={20} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                <Text style={[styles.detailValue, { color: colors.text }]}>{exp.hotel_name || 'Hotel Stay'}</Text>
                                                <View style={{ gap: 4 }}>
                                                    <DetailItem label="Check-in Date & Time" value={`${exp.check_in_date ? exp.check_in_date.split('-').reverse().join('-') : '-'} ${exp.check_in_time ? new Date(`2000-01-01T${exp.check_in_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '-'}`} />
                                                    <DetailItem label="Check-out Date & Time" value={`${exp.checkout_date ? exp.checkout_date.split('-').reverse().join('-') : '-'} ${exp.checkout_time ? new Date(`2000-01-01T${exp.checkout_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '-'}`} />
                                                    <DetailItem label="Cost" value={`₹${exp.cost || exp.amount || '0'}`} />
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <View style={styles.imageOverlay}>
                                                            <Ionicons name="expand-outline" size={14} color="#FFF" />
                                                            <Text style={styles.imageOverlayText}>Tap to enlarge</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        )}
                                    </View>
                                ))}
                                {isEditing && (
                                    <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('stay')}>
                                        <Ionicons name="add-circle" size={20} color={colors.primary} />
                                        <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                                    </TouchableOpacity>
                                )}
                            </Section>

                            {/* Other Expenses */}
                            <Section title="Other Expenses" icon="ellipsis-horizontal">
                                {form.other_expenses.map((exp, idx) => (
                                    <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                        <View style={styles.itemHeader}>
                                            <Text style={[styles.itemLabel, { color: colors.primary }]}>OTHER #{idx + 1}</Text>
                                            {isEditing && (
                                                <TouchableOpacity onPress={() => removeExpenseRow('other', idx)}>
                                                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        {isEditing ? (
                                            <View style={{ gap: 12 }}>
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    placeholder="Expense Type"
                                                    value={exp.expense_type}
                                                    onChangeText={t => updateExpenseRow('other', idx, 'expense_type', t)}
                                                />
                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text }]}
                                                    placeholder="Cost"
                                                    value={String(exp.cost || exp.amount || '0')}
                                                    onChangeText={t => updateExpenseRow('other', idx, 'cost', t)}
                                                    keyboardType="numeric"
                                                />
                                                <View style={styles.attachmentRow}>
                                                    <TouchableOpacity
                                                        style={[styles.cameraButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                                                        onPress={() => pickImage('other', idx)}
                                                    >
                                                        <Ionicons name="camera-outline" size={20} color={colors.primary} />
                                                        <Text style={[styles.cameraButtonText, { color: colors.primary }]}>{(exp.attach_image || exp.image) ? 'Change' : 'Attach Image'}</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <TouchableOpacity style={styles.removeImageBtn} onPress={() => updateExpenseRow('other', idx, 'attach_image', '')}>
                                                            <Ionicons name="close-circle" size={20} color={colors.danger} />
                                                        </TouchableOpacity>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        ) : (
                                            <View style={{ gap: 8 }}>
                                                <View style={styles.row}>
                                                    <DetailItem label="Type" value={exp.expense_type} flex={1} />
                                                    <DetailItem label="Cost" value={`₹${exp.cost || exp.amount || '0'}`} flex={1} />
                                                </View>
                                                {(exp.attach_image || exp.image) ? (
                                                    <TouchableOpacity
                                                        style={styles.imagePreviewContainer}
                                                        onPress={() => setPreviewImage((exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image))}
                                                    >
                                                        <Image source={{ uri: (exp.attach_image || exp.image).startsWith('http') ? (exp.attach_image || exp.image) : (exp.attach_image || exp.image).startsWith('/') ? IMAGE_HOST + (exp.attach_image || exp.image) : (exp.attach_image || exp.image) }} style={styles.imagePreview} />
                                                        <View style={styles.imageOverlay}>
                                                            <Ionicons name="expand-outline" size={14} color="#FFF" />
                                                            <Text style={styles.imageOverlayText}>Tap to enlarge</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ) : null}
                                            </View>
                                        )}
                                    </View>
                                ))}
                                {isEditing && (
                                    <TouchableOpacity style={[styles.addBtn, { borderColor: colors.primary }]} onPress={() => addExpenseRow('other')}>
                                        <Ionicons name="add-circle" size={20} color={colors.primary} />
                                        <Text style={[styles.addBtnText, { color: colors.primary }]}>Add</Text>
                                    </TouchableOpacity>
                                )}
                            </Section>
                        </Animated.View>
                    )}

                    {/* Tab Content: Summary */}
                    {activeTab === 'summary' && (
                        <Animated.View entering={FadeInDown.duration(400)}>
                            <Section title="Visit Summary" icon="document-text">
                                <View style={styles.inputWrapper}>
                                    <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Discussion Summary</Text>
                                    <TextInput
                                        style={[styles.input, {
                                            backgroundColor: colors.background,
                                            borderColor: colors.border,
                                            color: colors.text,
                                            height: 120,
                                            textAlignVertical: 'top'
                                        }]}
                                        value={form.customer_feedback}
                                        onChangeText={t => updateForm('customer_feedback', t)}
                                        placeholder="Enter what was discussed..."
                                        multiline
                                        editable={isEditing}
                                    />
                                </View>
                            </Section>

                            <Section title="Follow Up" icon="calendar">
                                {isEditing ? (
                                    <View style={{ gap: 16 }}>
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
                                            <View style={{ gap: 12 }}>
                                                <TouchableOpacity
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                    onPress={() => setSelectionModal({
                                                        visible: true,
                                                        title: 'Select Next Action',
                                                        options: ['Quotation Required', 'Order Follow-up', 'Payment Follow-up', 'Service Completion', 'Complaint Resolution', 'Installation / Commissioning', 'Sample / Demo Required', 'Technical Clarification', 'Next Visit Scheduled', 'Internal Action', 'No Further Action'],
                                                        onSelect: (v) => updateForm('follow_up_type', v),
                                                        selectedValue: form.follow_up_type
                                                    })}
                                                >
                                                    <Text style={{ color: colors.text }}>{form.follow_up_type || 'Select Next Action'}</Text>
                                                </TouchableOpacity>

                                                <TouchableOpacity
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center' }]}
                                                    onPress={() => setDatePickerMode('follow_up')}
                                                >
                                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text style={{ color: colors.text }}>{form.follow_up_due_date || 'Due Date'}</Text>
                                                        <Ionicons name="calendar-outline" size={20} color={colors.primary} />
                                                    </View>
                                                </TouchableOpacity>

                                                <TextInput
                                                    style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.text, height: 80 }]}
                                                    value={form.follow_up_notes}
                                                    onChangeText={t => updateForm('follow_up_notes', t)}
                                                    placeholder="Follow-up notes..."
                                                    multiline
                                                />
                                            </View>
                                        )}
                                    </View>
                                ) : (
                                    <View style={{ gap: 12 }}>
                                        <View style={styles.row}>
                                            <DetailItem label="Required" value={form.follow_up_required ? 'Yes' : 'No'} flex={1} />
                                            <DetailItem label="Date" value={form.follow_up_due_date || '-'} flex={1} />
                                        </View>
                                        {!!form.follow_up_due_date && (
                                            <DetailItem label="Next Action" value={form.follow_up_type} />
                                        )}
                                        {!!form.follow_up_notes && (
                                            <DetailItem label="Notes" value={form.follow_up_notes} />
                                        )}
                                    </View>
                                )}
                            </Section>
                        </Animated.View>
                    )}

                    {isEditing && (
                        <View style={{ marginTop: 20 }}>
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
            </KeyboardAvoidingView>

            {
                datePickerMode && (
                    <DateTimePicker
                        value={datePickerMode === 'follow_up' && form.follow_up_due_date ? new Date(form.follow_up_due_date) : datePickerMode === 'from' && form.mntc_date ? new Date(form.mntc_date) : new Date()}
                        mode="date"
                        display="default"
                        onChange={(event, date) => {
                            const mode = datePickerMode;
                            setDatePickerMode(null);
                            if (date && event.type !== 'dismissed') {
                                const datePrefix = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
                                if (mode === 'follow_up') {
                                    updateForm('follow_up_due_date', datePrefix);
                                } else if (mode === 'from') {
                                    updateForm('mntc_date', datePrefix);
                                }
                            }
                        }}
                    />
                )
            }

            {/* Time Picker */}
            {
                timePickerMode && (
                    <DateTimePicker
                        value={timePickerMode === 'from' && form.mntc_time ? new Date(`2000-01-01T${form.mntc_time}`) : new Date()}
                        mode="time"
                        display="default"
                        onChange={(event, time) => {
                            const mode = timePickerMode;
                            setTimePickerMode(null);
                            if (time && event.type !== 'dismissed') {
                                const timeString = time.toTimeString().split(' ')[0]; // HH:MM:SS
                                if (mode === 'from') {
                                    updateForm('mntc_time', timeString);
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
                    colors={isDark ? ['#6366F1', '#4F46E5'] : ['#6366F1', '#4F46E5']}
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
    const isDark = colorScheme === 'dark';

    return (
        <View style={[styles.detailItem, flex && { flex }, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', borderRadius: 12, padding: 12 }]}>
            <View style={styles.detailHeader}>
                {icon && <Ionicons name={icon} size={14} color={colors.primary} style={{ marginRight: 6 }} />}
                <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
            </View>
            <Text style={[styles.detailValue, { color: colors.text }]}>{value || '-'}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    // Premium Overhaul Styles
    premiumHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        paddingHorizontal: 4,
        gap: 8,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    idBadgePill: {
        backgroundColor: '#E0F2FE',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    idBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#0369A1',
    },
    headerSubtitle: {
        fontSize: 13,
        fontWeight: '500',
        marginTop: 2,
    },
    premiumEditBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    premiumEditBtnText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
    heroCard: {
        borderRadius: 24,
        padding: 24,
        marginBottom: 24,
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    heroGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    heroItem: {
        flex: 1,
    },
    heroLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    heroLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    heroValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#FFF',
    },
    heroBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    heroBadgeText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#FFF',
    },
    followUpAlert: {
        backgroundColor: '#FEE2E2',
        borderRadius: 20,
        padding: 16,
        marginTop: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    alertIconBox: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: '#FFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    alertTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#991B1B',
    },
    alertSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: '#B91C1C',
        marginTop: 1,
    },
    tabScrollWrapper: {
        marginBottom: 24,
    },
    tabContainer: {
        marginBottom: 24,
    },
    tabScrollContent: {
        gap: 8,
        paddingHorizontal: 4,
    },
    tabItem: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    activeTabItem: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '700',
    },
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
        padding: 24,
        marginBottom: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 6,
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
        fontSize: 16,
        fontWeight: '700',
        lineHeight: 24,
        marginTop: 2,
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
        padding: 20,
        borderRadius: 24,
        borderWidth: 1.5,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
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
        padding: 18,
        borderRadius: 20,
        borderWidth: 2,
        borderStyle: 'dashed',
        gap: 10,
        marginTop: 8,
    },
    addBtnText: {
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.2,
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
    totalCard: {
        padding: 32,
        borderRadius: 32,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginVertical: 8,
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 15,
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 2.5,
        opacity: 0.8,
    },
    totalValue: {
        fontSize: 48,
        fontWeight: '900',
        letterSpacing: -2,
    },
    imagePreviewContainer: {
        width: '100%',
        height: 150,
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 12,
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    expenseImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        padding: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    imageOverlayText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
    },
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        marginTop: 12,
    },
    cameraButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1.5,
        gap: 8,
    },
    cameraButtonText: {
        fontSize: 13,
        fontWeight: '700',
    },
    removeImageBtn: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: 'rgba(255,255,255,0.9)',
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    imagePreview: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
});

