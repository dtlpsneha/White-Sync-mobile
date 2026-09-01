import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    StyleSheet, 
    Text, 
    View, 
    TextInput, 
    TouchableOpacity, 
    ScrollView, 
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Modal,
    FlatList,
    Dimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeIn, FadeInDown, SlideInDown, Layout } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
// Removed expo-blur to avoid native view config warnings in some environments

import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { FloatingNav } from '@/components/FloatingNav';
import { 
    fetchGrades, 
    calculateBeltPrice, 
    Grade, 
    CalculateBeltPriceResponse 
} from '@/services/calculatorApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const JOINT_TYPES = ['Flexproof', 'Thermofix', 'Mechanical', 'Endless', 'Open', 'Not Required'];

export default function PriceCalculatorScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];

    // Derived from the shared palette rather than a second hardcoded copy —
    // this screen previously pinned its own dark values and drifted out of
    // sync with the rest of the app whenever the theme changed.
    const UI_COLORS = {
        bg: colors.background,
        card: colors.surface,
        input: colors.surfaceSecondary,
        border: colors.border,
        accent: '#58A6FF',
        success: '#3FB950',
        text: colors.text,
        textMuted: colors.textSecondary,
        headerText: colors.text,
    };

    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();

    // State
    const [grades, setGrades] = useState<Grade[]>([]);
    const [loadingGrades, setLoadingGrades] = useState(true);
    
    const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
    const [jointType, setJointType] = useState<string>('Flexproof');
    const [lengthStr, setLengthStr] = useState<string>('');
    const [widthStr, setWidthStr] = useState<string>('');
    const [quantityStr, setQuantityStr] = useState<string>('1');

    const [calculating, setCalculating] = useState(false);
    const [result, setResult] = useState<CalculateBeltPriceResponse | null>(null);
    
    // UI State
    const [gradeModalVisible, setGradeModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        loadGrades();
    }, []);

    const loadGrades = async () => {
        setLoadingGrades(true);
        const data = await fetchGrades();
        setGrades(data);
        setLoadingGrades(false);
    };

    const triggerCalculation = useCallback((
        grade: Grade | null, 
        length: string, 
        width: string, 
        quantity: string, 
        joint: string
    ) => {
        if (!grade) {
            setResult(null);
            return;
        }

        const l = parseInt(length, 10);
        const w = parseInt(width, 10);
        const q = parseInt(quantity, 10);

        if (isNaN(q) || q <= 0) {
            setResult(null);
            return;
        }

        // Validate based on UOM
        if (grade.uom === 'Sq. Mtr.') {
            if (isNaN(l) || isNaN(w) || l <= 0 || w <= 0) return setResult(null);
        } else if (grade.uom === 'Metre') {
            if (isNaN(l) || l <= 0) return setResult(null);
        }

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(async () => {
            setCalculating(true);
            const res = await calculateBeltPrice({
                id: grade.name,
                length_mm: isNaN(l) ? 0 : l,
                width_mm: isNaN(w) ? 0 : w,
                quantity: q,
                joint_type: joint
            });
            setResult(res);
            setCalculating(false);
        }, 300);
    }, []);

    useEffect(() => {
        triggerCalculation(selectedGrade, lengthStr, widthStr, quantityStr, jointType);
    }, [selectedGrade, lengthStr, widthStr, quantityStr, jointType, triggerCalculation]);

    const handleClearAll = () => {
        setSelectedGrade(null);
        setLengthStr('');
        setWidthStr('');
        setQuantityStr('1');
        setJointType('Flexproof');
        setResult(null);
    };

    const filteredGrades = grades.filter(g => 
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        g.grade.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const showLength = selectedGrade?.uom === 'Sq. Mtr.' || selectedGrade?.uom === 'Metre';
    const showWidth = selectedGrade?.uom === 'Sq. Mtr.';

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: UI_COLORS.bg }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={UI_COLORS.headerText} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, { color: UI_COLORS.headerText }]}>Habasit Calculator</Text>
                    <Text style={styles.headerSubtitle}>ERPNext Professional Sync</Text>
                </View>
                <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
                    <Ionicons name="refresh" size={20} color={UI_COLORS.accent} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView 
                    style={styles.scrollView} 
                    contentContainerStyle={{ paddingBottom: vs(120), paddingHorizontal: s(16) }}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Input Section */}
                    <Animated.View layout={Layout.springify()} entering={FadeInDown.delay(100)} style={[styles.card, { backgroundColor: UI_COLORS.card, borderColor: UI_COLORS.border }]}>
                        <View style={styles.cardHeader}>
                            <Ionicons name="settings-outline" size={18} color={UI_COLORS.accent} />
                            <Text style={[styles.cardTitle, { color: UI_COLORS.headerText }]}>Configuration</Text>
                        </View>

                        {/* Grade Selector */}
                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>ID / Grade *</Text>
                            <TouchableOpacity 
                                style={[styles.dropdown, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border }]}
                                onPress={() => setGradeModalVisible(true)}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.dropdownText, { color: selectedGrade ? UI_COLORS.text : UI_COLORS.textMuted }]}>
                                        {selectedGrade ? selectedGrade.grade : 'Select Grade...'}
                                    </Text>
                                    {selectedGrade && <Text style={styles.dropdownSubtext}>{selectedGrade.name}</Text>}
                                </View>
                                <Ionicons name="chevron-down" size={20} color={UI_COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.row}>
                            {/* Static Joint Type (Auto-fetched) */}
                            <View style={[styles.inputGroup, { flex: 1.5, marginRight: s(12) }]}>
                                <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Joint Type</Text>
                                <View style={[styles.staticField, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border }]}>
                                    <Text style={[styles.staticText, { color: UI_COLORS.text }]}>{jointType || '---'}</Text>
                                </View>
                            </View>

                            {/* UOM Display */}
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>UOM</Text>
                                <View style={[styles.staticField, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border }]}>
                                    <Text style={[styles.staticText, { color: UI_COLORS.text }]}>{selectedGrade?.uom || '---'}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Dimensions Row */}
                        <View style={styles.row}>
                            {showLength && (
                                <Animated.View entering={FadeIn} style={[styles.inputGroup, { flex: 1, marginRight: showWidth ? s(12) : 0 }]}>
                                    <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Length (mm)</Text>
                                    <TextInput
                                        style={[styles.textInput, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border, color: UI_COLORS.text }]}
                                        keyboardType="numeric"
                                        placeholder="0"
                                        placeholderTextColor={UI_COLORS.textMuted}
                                        value={lengthStr}
                                        onChangeText={(t) => setLengthStr(t.replace(/[^0-9]/g, ''))}
                                    />
                                </Animated.View>
                            )}

                            {showWidth && (
                                <Animated.View entering={FadeIn} style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Width (mm)</Text>
                                    <TextInput
                                        style={[styles.textInput, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border, color: UI_COLORS.text }]}
                                        keyboardType="numeric"
                                        placeholder="0"
                                        placeholderTextColor={UI_COLORS.textMuted}
                                        value={widthStr}
                                        onChangeText={(t) => setWidthStr(t.replace(/[^0-9]/g, ''))}
                                    />
                                </Animated.View>
                            )}
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Quantity</Text>
                            <TextInput
                                style={[styles.textInput, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border, color: UI_COLORS.text }]}
                                keyboardType="numeric"
                                placeholder="1"
                                placeholderTextColor={UI_COLORS.textMuted}
                                value={quantityStr}
                                onChangeText={(t) => setQuantityStr(t.replace(/[^0-9]/g, ''))}
                            />
                        </View>
                    </Animated.View>

                    {/* Result Section */}
                    {calculating ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={UI_COLORS.accent} />
                            <Text style={[styles.calculatingText, { color: UI_COLORS.textMuted }]}>Calculating...</Text>
                        </View>
                    ) : result ? (
                        <Animated.View layout={Layout.springify()} entering={FadeInDown.delay(200)} style={[styles.card, { backgroundColor: UI_COLORS.card, borderColor: UI_COLORS.border }]}>
                            <View style={styles.cardHeader}>
                                <Ionicons name="stats-chart-outline" size={18} color={UI_COLORS.success} />
                                <Text style={[styles.cardTitle, { color: UI_COLORS.headerText }]}>Calculation Results</Text>
                            </View>

                            {/* Category & Item Details */}
                            <View style={styles.detailsBox}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Product Category</Text>
                                    <Text style={[styles.detailValue, { color: UI_COLORS.accent }]}>{result.product_category}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Searched Item</Text>
                                    <Text style={[styles.detailValue, { fontSize: 11 }]} numberOfLines={2}>{result.custom_item_name}</Text>
                                </View>
                            </View>

                            <View style={styles.priceGrid}>
                                <View style={styles.priceItem}>
                                    <Text style={styles.priceLabel}>Area (sq.m)</Text>
                                    <Text style={[styles.priceValue, { color: UI_COLORS.text }]}>{result.area_sqm}</Text>
                                </View>
                                <View style={styles.priceItem}>
                                    <Text style={styles.priceLabel}>Base Price (INR)</Text>
                                    <Text style={[styles.priceValue, { color: UI_COLORS.text }]}>₹{result.base_price_inr.toFixed(2)}</Text>
                                </View>
                            </View>

                            <View style={styles.priceGrid}>
                                <View style={styles.priceItem}>
                                    <Text style={styles.priceLabel}>Slitting Charges</Text>
                                    <Text style={[styles.priceValue, { color: UI_COLORS.text }]}>₹{result.slitting_charges.toFixed(2)}</Text>
                                </View>
                                <View style={styles.priceItem}>
                                    <Text style={styles.priceLabel}>Joining Charges</Text>
                                    <Text style={[styles.priceValue, { color: UI_COLORS.text }]}>₹{result.joining_charges.toFixed(2)}</Text>
                                </View>
                            </View>

                            <View style={[styles.totalContainer, { backgroundColor: isDark ? 'rgba(63, 185, 80, 0.1)' : '#F0FFF4', borderColor: UI_COLORS.success }]}>
                                <Text style={styles.totalLabel}>FINAL PRICE (INR)</Text>
                                <Text style={[styles.totalValue, { color: UI_COLORS.success }]}>
                                    ₹{result.final_price_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </Text>
                            </View>
                        </Animated.View>
                    ) : (
                        !calculating && selectedGrade && (
                            <View style={styles.infoBox}>
                                <Ionicons name="information-circle-outline" size={16} color={UI_COLORS.accent} />
                                <Text style={styles.infoText}>Enter dimensions to see results</Text>
                            </View>
                        )
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal visible={gradeModalVisible} animationType="fade" transparent={true}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setGradeModalVisible(false)} />
                    <Animated.View
                        entering={SlideInDown}
                        style={[
                            styles.modalContent,
                            {
                                backgroundColor: UI_COLORS.card,
                                // Keep the last list rows clear of the system
                                // navigation bar on devices with a tall one.
                                paddingBottom: insets.bottom,
                            },
                        ]}
                    >
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={[styles.modalTitle, { color: UI_COLORS.headerText }]}>Habasit Price Master</Text>
                                <Text style={styles.modalSubtitle}>Search and select grade</Text>
                            </View>
                            <TouchableOpacity onPress={() => setGradeModalVisible(false)} style={styles.modalClose}>
                                <Ionicons name="close" size={24} color={UI_COLORS.textMuted} />
                            </TouchableOpacity>
                        </View>
                        
                        <View style={[styles.searchBox, { backgroundColor: UI_COLORS.input, borderColor: UI_COLORS.border }]}>
                            <Ionicons name="search" size={20} color={UI_COLORS.textMuted} />
                            <TextInput 
                                style={[styles.searchInput, { color: UI_COLORS.text }]}
                                placeholder="Search grade name..."
                                placeholderTextColor={UI_COLORS.textMuted}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                autoFocus
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={18} color={UI_COLORS.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {loadingGrades ? (
                            <ActivityIndicator size="large" color={UI_COLORS.accent} style={{ marginTop: 40 }} />
                        ) : (
                            <FlatList 
                                data={filteredGrades}
                                keyExtractor={(item) => item.name}
                                style={{ flex: 1 }}
                                keyboardShouldPersistTaps="handled"
                                renderItem={({ item }) => (
                                    <TouchableOpacity 
                                        style={[styles.gradeItem, { 
                                            borderBottomColor: UI_COLORS.border,
                                            backgroundColor: selectedGrade?.name === item.name ? 'rgba(88, 166, 255, 0.05)' : 'transparent'
                                        }]}
                                        onPress={() => {
                                            setSelectedGrade(item);
                                            if (item.joint_type) {
                                                setJointType(item.joint_type);
                                            } else {
                                                setJointType('Not Required');
                                            }
                                            setGradeModalVisible(false);
                                            setSearchQuery('');
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.gradeRow}>
                                                <Text style={[styles.gradeName, { color: UI_COLORS.headerText }]}>{item.grade}</Text>
                                                {item.uom && (
                                                    <View style={[styles.miniTag, { backgroundColor: isDark ? '#21262D' : '#F1F5F9' }]}>
                                                        <Text style={styles.miniTagText}>{item.uom}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={styles.gradeId}>{item.name}</Text>
                                            {item.joint_type && (
                                                <View style={styles.jointTypeRow}>
                                                    <Ionicons name="link-outline" size={10} color={UI_COLORS.textMuted} />
                                                    <Text style={styles.jointTypeTagText}>Default Joint: {item.joint_type}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Ionicons 
                                            name={selectedGrade?.name === item.name ? "checkmark-circle" : "chevron-forward"} 
                                            size={20} 
                                            color={selectedGrade?.name === item.name ? UI_COLORS.success : UI_COLORS.border} 
                                        />
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </Animated.View>
                </View>
            </Modal>

            <FloatingNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        justifyContent: 'space-between',
    },
    headerTitleContainer: { flex: 1, marginLeft: 12 },
    headerTitle: { fontSize: 18, fontWeight: '800' },
    headerSubtitle: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', letterSpacing: 1 },
    backBtn: { padding: 4 },
    clearBtn: { padding: 8, backgroundColor: 'rgba(88, 166, 255, 0.1)', borderRadius: 12 },
    scrollView: { flex: 1 },
    card: {
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        marginBottom: 16,
        marginTop: 8,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
            android: { elevation: 4 }
        })
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
    cardTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    inputGroup: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '600', marginBottom: 6, opacity: 0.8 },
    dropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 50,
    },
    dropdownText: { fontSize: 15, fontWeight: '500' },
    dropdownSubtext: { fontSize: 10, color: '#8B949E', marginTop: 1 },
    staticField: {
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 50,
        justifyContent: 'center',
    },
    staticText: { fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    textInput: {
        borderWidth: 1,
        borderRadius: 10,
        height: 50,
        paddingHorizontal: 12,
        fontSize: 15,
        fontWeight: '600',
    },
    loadingContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, flexDirection: 'row', gap: 10 },
    calculatingText: { fontSize: 13, fontWeight: '500' },
    detailsBox: {
        backgroundColor: 'rgba(139, 148, 158, 0.05)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
    },
    detailRow: { marginBottom: 8 },
    detailLabel: { fontSize: 10, color: '#8B949E', textTransform: 'uppercase', marginBottom: 2 },
    detailValue: { fontSize: 13, fontWeight: '600', color: '#C9D1D9' },
    priceGrid: { flexDirection: 'row', marginBottom: 12 },
    priceItem: { flex: 1 },
    priceLabel: { fontSize: 11, color: '#8B949E', marginBottom: 2 },
    priceValue: { fontSize: 15, fontWeight: '700' },
    totalContainer: {
        marginTop: 8,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    totalLabel: { fontSize: 11, fontWeight: '800', marginBottom: 4, letterSpacing: 1 },
    totalValue: { fontSize: 32, fontWeight: '900' },
    infoBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    infoText: { fontSize: 13, color: '#8B949E' },
    modalContent: {
        height: '75%',
        width: '100%',
        position: 'absolute',
        bottom: 0,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    modalSubtitle: { fontSize: 12, color: '#8B949E', marginTop: 2 },
    modalClose: { padding: 4 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 50,
        borderWidth: 1,
        marginBottom: 16,
    },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 16 },
    gradeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    gradeName: { fontSize: 16, fontWeight: '700' },
    gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    miniTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: '#30363D' },
    miniTagText: { fontSize: 9, fontWeight: '700', color: '#8B949E' },
    jointTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    jointTypeTagText: { fontSize: 10, color: '#8B949E', fontWeight: '500' },
    gradeId: { fontSize: 11, color: '#8B949E', marginTop: 2 },
    uomTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    uomTagText: { fontSize: 10, fontWeight: '800', color: '#8B949E' }
});
