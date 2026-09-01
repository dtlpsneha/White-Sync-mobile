import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, FlatList, Pressable } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { apiGet, apiPost, uploadFile } from '@/utils/api';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL, apiUrl } from '@/constants/config';

const IMAGE_HOST = API_BASE_URL;

interface FormItem {
    item_code: string;
    item_name: string;
    qty: number;
    rate: number;
    amount: number;
    warehouse: string;
}

export default function CreateSalesOrderScreen() {
    const { quotation_id, customer: initCustomer, items: initItems, edit_id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(theme), [theme]);

    const [form, setForm] = useState({
        customer: (initCustomer as string) || '',
        customer_name: (initCustomer as string) || '', // Display name
        transaction_date: new Date().toISOString().split('T')[0],
        delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default 7 days from now
        items: [] as FormItem[],
        attach: ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [itemResults, setItemResults] = useState<any[]>([]);
    const [isSearchingItem, setIsSearchingItem] = useState(false);
    const [warehouseResults, setWarehouseResults] = useState<any[]>([]);
    const [isSearchingWarehouse, setIsSearchingWarehouse] = useState(false);
    const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);
    const [activeWarehouseIndex, setActiveWarehouseIndex] = useState<number | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            const formatted = selectedDate.toISOString().split('T')[0];
            setForm(p => ({ ...p, delivery_date: formatted }));
        }
    };

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return '';
        try {
            const [y, m, d] = dateStr.split('-');
            return `${d}-${m}-${y}`;
        } catch (e) {
            return dateStr;
        }
    };

    useEffect(() => {
        if (edit_id) {
            fetchExistingOrder(edit_id as string);
        }
    }, [edit_id]);

    const fetchExistingOrder = async (id: string) => {
        try {
            setIsLoadingData(true);
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(apiUrl(`/api/resource/Sales Order/${encodeURIComponent(id)}`), cookies);
            
            if (res.ok && res.data?.data) {
                const doc = res.data.data;
                setForm({
                    customer: doc.customer || '',
                    customer_name: doc.customer_name || doc.customer || '',
                    transaction_date: doc.transaction_date || new Date().toISOString().split('T')[0],
                    delivery_date: doc.delivery_date || new Date().toISOString().split('T')[0],
                    items: (doc.items || []).map((it: any) => ({
                        item_code: it.item_code,
                        item_name: it.item_name || it.item_code,
                        qty: it.qty || 1,
                        rate: it.rate || 0,
                        amount: it.amount || 0,
                        warehouse: it.warehouse || ''
                    })),
                    attach: doc.attach || doc.attach_image || ''
                });
            } else {
                Alert.alert('Error', 'Failed to fetch Sales Order details.');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'An error occurred while fetching data.');
        } finally {
            setIsLoadingData(false);
        }
    };

    const pickAttachment = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images', 'videos'],
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled) {
                uploadAttachment(result.assets[0].uri);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const pickDocument = async () => {
        try {
            const { getDocumentAsync } = await import('expo-document-picker');
            const result = await getDocumentAsync({
                type: ['application/pdf', 'image/*'],
                copyToCacheDirectory: true
            });

            if (!result.canceled) {
                uploadAttachment(result.assets[0].uri);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const uploadAttachment = async (uri: string) => {
        try {
            setIsSaving(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const uploadRes: any = await uploadFile(
                apiUrl('/api/method/upload_file'),
                { uri },
                sessionCookies
            );

            if (uploadRes.ok && uploadRes.data?.message?.file_url) {
                setForm(prev => ({ ...prev, attach: uploadRes.data.message.file_url }));
            } else {
                Alert.alert('Upload Failed', 'Could not upload file.');
            }
        } catch (error) {
            console.error('Upload Error:', error);
            Alert.alert('Error', 'An error occurred during upload.');
        } finally {
            setIsSaving(false);
        }
    };

    const calculateTotal = () => {
        return form.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
    };

    /**
     * Build a frappe.client.get_list URL for a "field LIKE %query%" lookup.
     *
     * The filter JSON and the query string are both encoded properly here.
     * These lookups used to interpolate the raw search text straight into the
     * URL, so a quote character produced malformed filter JSON and `%` or `_`
     * silently acted as SQL wildcards.
     */
    const likeSearchUrl = (doctype: string, field: string, query: string, fields: string[]) => {
        const escaped = query.trim().replace(/[\\%_]/g, c => `\\${c}`);
        const filters = JSON.stringify([[field, 'like', `%${escaped}%`]]);

        return apiUrl(
            `/api/method/frappe.client.get_list?doctype=${encodeURIComponent(doctype)}` +
            `&filters=${encodeURIComponent(filters)}` +
            `&fields=${encodeURIComponent(JSON.stringify(fields))}`
        );
    };

    const fetchCustomers = async (query: string) => {
        if (query.length < 2) return;
        setIsSearching(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(likeSearchUrl('Customer', 'customer_name', query, ['name', 'customer_name']), cookies);
            if (res.ok) setSearchResults(res.data?.message || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const fetchItems = async (query: string) => {
        if (query.length < 2) return;
        setIsSearchingItem(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(likeSearchUrl('Item', 'item_code', query, ['name', 'item_name', 'standard_rate']), cookies);
            if (res.ok) setItemResults(res.data?.message || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingItem(false);
        }
    };

    const fetchWarehouses = async (query: string) => {
        if (query.length < 2) return;
        setIsSearchingWarehouse(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            const res = await apiGet(likeSearchUrl('Warehouse', 'name', query, ['name']), cookies);
            if (res.ok) setWarehouseResults(res.data?.message || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearchingWarehouse(false);
        }
    };

    const addItemRow = () => {
        setForm(prev => ({
            ...prev,
            items: [...prev.items, { item_code: '', item_name: '', qty: 1, rate: 0, amount: 0, warehouse: '' }]
        }));
    };

    const removeItemRow = (index: number) => {
        const newItems = [...form.items];
        newItems.splice(index, 1);
        setForm(prev => ({ ...prev, items: newItems }));
    };

    const updateItem = (index: number, key: keyof FormItem, value: any) => {
        const newItems = [...form.items];
        const it = { ...newItems[index], [key]: value };
        
        if (key === 'qty' || key === 'rate') {
            it.amount = Number(it.qty) * Number(it.rate);
        }
        
        newItems[index] = it;
        setForm(prev => ({ ...prev, items: newItems }));
    };

    const handleSave = async () => {
        if (!form.customer) return Alert.alert('Error', 'Please select a customer.');
        if (form.items.length === 0) return Alert.alert('Error', 'Please add at least one item.');

        setIsSaving(true);
        try {
            const cookies = await SecureStore.getItemAsync('session_cookies');
            
            // Updated API Payload matching user specification
            const payload = {
                action: edit_id ? 'update' : 'create',
                customer: form.customer,
                attach: form.attach || undefined,
                items: form.items.map(it => ({
                    item_code: it.item_code,
                    qty: Number(it.qty),
                    rate: Number(it.rate),
                    warehouse: it.warehouse,
                    delivery_date: form.delivery_date,
                })),
                // Optional fields retained if needed by backend, though not in the snippet
                transaction_date: form.transaction_date,
                company: 'White & Co.',
                docstatus: 0,
                quotation: quotation_id || undefined
            };

            const url = edit_id 
                ? apiUrl(`/api/resource/Sales Order/${encodeURIComponent(edit_id as string)}`)
                : apiUrl('/api/resource/Sales Order');
            
            const res = edit_id 
                ? await apiPost(url, { ...payload, _method: 'PUT' }, cookies) 
                : await apiPost(url, payload, cookies);
            
            const data: any = res.data;

            if (res.ok && (data?.data?.name || data?.name)) {
                Alert.alert('Success', `Sales Order ${edit_id || data.data.name} ${edit_id ? 'updated' : 'created'} successfully.`, [{ text: 'OK', onPress: () => router.back() }]);
            } else {
                let errorMsg = `Failed to ${edit_id ? 'update' : 'create'} Sales Order.`;
                try {
                    if (data?._server_messages) {
                        const msgs = JSON.parse(data._server_messages);
                        errorMsg = msgs.map((m: any) => JSON.parse(m).message).join('\n');
                    } else if (data?.message?.error) {
                        errorMsg = data.message.error;
                    } else if (data?.message) {
                        errorMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
                    }
                } catch (e) {
                    errorMsg = 'Failed to create Sales Order. Please check mandatory fields like Customer and Item details.';
                }
                Alert.alert('Save Failed', errorMsg);
                console.error('Save Failure Detail:', data);
            }
        } catch (e) {
            console.error('Save Error:', e);
            Alert.alert('Error', 'An unexpected error occurred while saving.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} 
            style={[styles.container, { backgroundColor: colors.background }]}
        >
            <StatusBar style="dark" />
            <View style={[styles.header, { backgroundColor: colors.surface }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="close" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.text }]}>{edit_id ? 'Edit Sales Order' : 'New Sales Order'}</Text>
                <TouchableOpacity onPress={handleSave} disabled={isSaving}>
                    {isSaving ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={[styles.saveText, { color: colors.primary }]}>{edit_id ? 'Update' : 'Save'}</Text>}
                </TouchableOpacity>
            </View>

            {isLoadingData ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Customer Section */}
                    <Animated.View entering={FadeInUp.delay(100).springify()} style={[styles.card, { backgroundColor: colors.surface }]}>
                        <Text style={styles.label}>Customer</Text>
                        <View style={styles.searchBox}>
                            <TextInput 
                                style={[styles.input, { color: colors.text }]}
                                placeholder="Search Customer..."
                                placeholderTextColor={colors.textSecondary}
                                value={form.customer_name}
                                onChangeText={(t) => {
                                    setForm(p => ({ ...p, customer: t, customer_name: t }));
                                    fetchCustomers(t);
                                }}
                            />
                            {isSearching && <ActivityIndicator size="small" color={colors.primary} />}
                        </View>
                        {searchResults.length > 0 && form.customer.length > 2 && (
                            <View style={styles.resultsContainer}>
                                {searchResults.map((c, i) => (
                                    <TouchableOpacity 
                                        key={i} 
                                        style={styles.resultItem}
                                        onPress={() => {
                                            setForm(p => ({ ...p, customer: c.name, customer_name: c.customer_name }));
                                            setSearchResults([]);
                                        }}
                                    >
                                        <View>
                                            <Text style={{ color: colors.text, fontWeight: '700' }}>{c.customer_name}</Text>
                                            {c.name !== c.customer_name && <Text style={{ color: colors.textSecondary, fontSize: 10 }}>{c.name}</Text>}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </Animated.View>

                    {/* Delivery Date Section */}
                    <Animated.View entering={FadeInUp.delay(150).springify()} style={[styles.card, { backgroundColor: colors.surface }]}>
                        <Text style={styles.label}>Delivery Date</Text>
                        <Pressable style={styles.searchBox} onPress={() => setShowDatePicker(true)}>
                            <Ionicons name="calendar-outline" size={20} color={colors.primary} style={{ marginRight: 12 }} />
                            <Text style={[styles.input, { color: colors.text }]}>
                                {formatDateDisplay(form.delivery_date)}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                        </Pressable>
                        {showDatePicker && (
                            <DateTimePicker
                                value={new Date(form.delivery_date)}
                                mode="date"
                                display="default"
                                onChange={onDateChange}
                                minimumDate={new Date()}
                            />
                        )}
                    </Animated.View>

                    {/* Attachment Section */}
                    <Animated.View entering={FadeInUp.delay(175).springify()} style={[styles.card, { backgroundColor: colors.surface }]}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.label}>Attachment</Text>
                            {form.attach ? (
                                <TouchableOpacity onPress={() => setForm(p => ({ ...p, attach: '' }))}>
                                    <Text style={{ color: '#EF5350', fontSize: 12, fontWeight: '800' }}>REMOVE</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                        
                        {form.attach ? (
                            <View style={styles.imagePreviewContainer}>
                                {form.attach.toLowerCase().endsWith('.pdf') ? (
                                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                        <Ionicons name="document-text-outline" size={48} color={colors.primary} />
                                        <Text style={{ marginTop: 8, fontWeight: '700', color: colors.textSecondary }}>PDF Document</Text>
                                        <Text style={{ fontSize: 10, color: colors.textSecondary }}>{form.attach.split('/').pop()}</Text>
                                    </View>
                                ) : (
                                    <Image source={{ uri: form.attach.startsWith('http') ? form.attach : `${IMAGE_HOST}${form.attach}` }} style={styles.imagePreview} />
                                )}
                            </View>
                        ) : (
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                                <TouchableOpacity style={[styles.uploadBox, { flex: 1 }]} onPress={pickAttachment}>
                                    <Ionicons name="camera-outline" size={32} color={colors.primary} />
                                    <Text style={[styles.uploadText, { color: colors.primary }]}>Image</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.uploadBox, { flex: 1 }]} onPress={pickDocument}>
                                    <Ionicons name="document-outline" size={32} color={colors.primary} />
                                    <Text style={[styles.uploadText, { color: colors.primary }]}>PDF</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </Animated.View>

                    {/* Items Section */}
                    <Animated.View entering={FadeInUp.delay(200).springify()} style={styles.itemsSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={[styles.sectionTitle, { color: colors.text }]}>Items</Text>
                            <TouchableOpacity onPress={addItemRow} style={[styles.addBtn, { backgroundColor: colors.primary + '15' }]}>
                                <Ionicons name="add" size={20} color={colors.primary} />
                                <Text style={[styles.addBtnText, { color: colors.primary }]}>Add Item</Text>
                            </TouchableOpacity>
                        </View>

                        {form.items.map((item, idx) => (
                            <View key={idx} style={[styles.itemCard, { backgroundColor: colors.surface }]}>
                                <View style={styles.itemRowHeader}>
                                    <Text style={[styles.itemIdx, { color: colors.textSecondary }]}>#{idx + 1}</Text>
                                    <TouchableOpacity onPress={() => removeItemRow(idx)}>
                                        <Ionicons name="trash-outline" size={20} color="#EF5350" />
                                    </TouchableOpacity>
                                </View>

                                <TextInput 
                                    style={[styles.itemInput, { color: colors.text }]} 
                                    placeholder="Item Code"
                                    placeholderTextColor={colors.textSecondary}
                                    value={item.item_code}
                                    onChangeText={(t) => {
                                        updateItem(idx, 'item_code', t);
                                        setActiveItemIndex(idx);
                                        fetchItems(t);
                                    }}
                                />
                                
                                {activeItemIndex === idx && itemResults.length > 0 && (
                                    <View style={styles.itemResults}>
                                        {itemResults.map((it, i) => (
                                            <TouchableOpacity 
                                                key={i} 
                                                style={styles.resultItem}
                                                onPress={() => {
                                                    const newItems = [...form.items];
                                                    newItems[idx] = { ...newItems[idx], item_code: it.name, item_name: it.item_name, rate: it.standard_rate || 0, amount: (it.standard_rate || 0) * newItems[idx].qty };
                                                    setForm(p => ({ ...p, items: newItems }));
                                                    setItemResults([]);
                                                    setActiveItemIndex(null);
                                                }}
                                            >
                                                <Text style={{ color: colors.text }}>{it.item_name} ({it.name})</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <TextInput 
                                    style={[styles.itemInput, { color: colors.text }]} 
                                    placeholder="Warehouse"
                                    placeholderTextColor={colors.textSecondary}
                                    value={item.warehouse}
                                    onChangeText={(t) => {
                                        updateItem(idx, 'warehouse', t);
                                        setActiveWarehouseIndex(idx);
                                        fetchWarehouses(t);
                                    }}
                                />

                                {activeWarehouseIndex === idx && warehouseResults.length > 0 && (
                                    <View style={styles.itemResults}>
                                        {warehouseResults.map((w, i) => (
                                            <TouchableOpacity 
                                                key={i} 
                                                style={styles.resultItem}
                                                onPress={() => {
                                                    updateItem(idx, 'warehouse', w.name);
                                                    setWarehouseResults([]);
                                                    setActiveWarehouseIndex(null);
                                                }}
                                            >
                                                <Text style={{ color: colors.text }}>{w.name}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}

                                <View style={styles.qtyRateRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.subLabel}>Quantity</Text>
                                        <TextInput 
                                            style={[styles.miniInput, { color: colors.text }]} 
                                            keyboardType="numeric"
                                            value={item.qty.toString()}
                                            onChangeText={(v) => updateItem(idx, 'qty', parseFloat(v) || 0)}
                                        />
                                    </View>
                                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                                        <Text style={styles.subLabel}>Rate</Text>
                                        <TextInput 
                                            style={[styles.miniInput, { color: colors.text }]} 
                                            keyboardType="numeric"
                                            value={item.rate.toString()}
                                            onChangeText={(v) => updateItem(idx, 'rate', parseFloat(v) || 0)}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.subLabel}>Amount</Text>
                                        <Text style={[styles.amountText, { color: colors.text }]}>₹{item.amount.toLocaleString()}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </Animated.View>

                    {/* Footer Summary */}
                    <View style={styles.footer}>
                        <View style={styles.totalRow}>
                            <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>Grand Total</Text>
                            <Text style={[styles.totalValue, { color: colors.primary }]}>₹{calculateTotal().toLocaleString()}</Text>
                        </View>
                    </View>
                </ScrollView>
            )}
        </KeyboardAvoidingView>
    );
}

/** Theme-aware styles — the dividers, muted labels and result panels were
 *  previously hardcoded to light-mode slate colours. */
const getStyles = (theme: 'light' | 'dark') => {
    const c = Colors[theme];

    return StyleSheet.create({
        container: { flex: 1 },
        center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
        header: { height: 100, paddingTop: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border },
        headerTitle: { fontSize: 18, fontWeight: '900' },
        backButton: { width: 44, height: 44, justifyContent: 'center' },
        saveText: { fontWeight: '900', fontSize: 16 },
        scrollContent: { padding: 20 },
        card: { padding: 20, borderRadius: 24, marginBottom: 20, elevation: 2 },
        label: { fontSize: 12, fontWeight: '800', color: c.textSecondary, marginBottom: 8, textTransform: 'uppercase' },
        searchBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: 8 },
        input: { flex: 1, fontSize: 16, fontWeight: '700', color: c.text },
        resultsContainer: { marginTop: 12, backgroundColor: c.surfaceSecondary, borderRadius: 12, padding: 8 },
        resultItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: c.border },
        itemsSection: { marginBottom: 20 },
        sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
        sectionTitle: { fontSize: 20, fontWeight: '900' },
        addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 },
        addBtnText: { fontWeight: '800', marginLeft: 4, fontSize: 14 },
        itemCard: { padding: 16, borderRadius: 20, marginBottom: 16, elevation: 2 },
        itemRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
        itemIdx: { fontSize: 12, fontWeight: '900' },
        itemInput: { fontSize: 15, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 12, color: c.text },
        itemResults: { backgroundColor: c.surfaceSecondary, borderRadius: 12, marginBottom: 12 },
        qtyRateRow: { flexDirection: 'row', alignItems: 'flex-end' },
        subLabel: { fontSize: 10, fontWeight: '700', color: c.textSecondary, marginBottom: 4 },
        miniInput: { borderBottomWidth: 1, borderBottomColor: c.border, fontSize: 15, fontWeight: '800', paddingBottom: 4, color: c.text },
        amountText: { fontSize: 15, fontWeight: '900', paddingBottom: 4 },
        footer: { marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: c.border },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        totalLabel: { fontSize: 16, fontWeight: '800' },
        totalValue: { fontSize: 26, fontWeight: '900' },
        imagePreviewContainer: { marginTop: 10, borderRadius: 16, overflow: 'hidden', height: 180, backgroundColor: c.surfaceSecondary },
        imagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
        uploadBox: { height: 120, borderStyle: 'dashed', borderWidth: 2, borderColor: c.border, borderRadius: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: c.surfaceSecondary, marginTop: 8 },
        uploadText: { marginTop: 8, fontSize: 13, fontWeight: '800' }
    });
};

