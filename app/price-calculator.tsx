import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    Modal,
    FlatList,
    Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated from 'react-native-reanimated';
import { appear, enterSection, sheetIn, smoothLayout } from '@/constants/motion';
import { useFocusEffect, useRouter } from 'expo-router';
// Removed expo-blur to avoid native view config warnings in some environments

import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SectionCard } from '@/components/ui/Midnight';
import { useResponsive } from '@/hooks/useResponsive';
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
    const colors = Colors[theme];

    // Derived from the shared palette rather than a second hardcoded copy —
    // this screen previously pinned its own dark values and drifted out of
    // sync with the rest of the app whenever the theme changed.
    const UI_COLORS = {
        bg: colors.background,
        card: colors.surface,
        input: colors.surfaceSecondary,
        border: colors.border,
        accent: colors.primary,
        success: colors.success,
        text: colors.text,
        textMuted: colors.textSecondary,
        headerText: colors.text,
    };

    const { s, vs, ms } = useResponsive();
    const insets = useSafeAreaInsets();

    // Safety net for Android's hardware/gesture back button. This screen is
    // meant to always be pushed (there's a real screen underneath), but if
    // it's ever somehow reached with nothing on the stack, router.back()
    // would silently no-op — falling back to Home keeps the button working
    // either way instead of leaving the user stuck.
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/home');
                }
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [router])
    );

    // State
    const [grades, setGrades] = useState<Grade[]>([]);
    const [loadingGrades, setLoadingGrades] = useState(true);
    
    const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
    const [jointType, setJointType] = useState<string>('Flexproof');
    const [lengthStr, setLengthStr] = useState<string>('');
    const [widthStr, setWidthStr] = useState<string>('');
    const [quantityStr, setQuantityStr] = useState<string>('1');

    const [calculating, setCalculating] = useState(false);
    const [gradesFailed, setGradesFailed] = useState(false);
    const [calcFailed, setCalcFailed] = useState(false);
    const calcSeq = useRef(0);
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
        setGradesFailed(false);
        const data = await fetchGrades();
        setGrades(data);
        // fetchGrades answers [] when the call fails; ERPNext always has grades.
        setGradesFailed(data.length === 0);
        setLoadingGrades(false);
    };

    const triggerCalculation = useCallback((
        grade: Grade | null, 
        length: string, 
        width: string, 
        quantity: string, 
        joint: string
    ) => {
        calcSeq.current += 1;
        setCalcFailed(false);
        if (!grade) {
            setResult(null);
            setCalculating(false);
            return;
        }

        const l = parseInt(length, 10);
        const w = parseInt(width, 10);
        const q = parseInt(quantity, 10);

        if (isNaN(q) || q <= 0) {
            setResult(null);
            setCalculating(false);
            return;
        }

        // Validate based on UOM
        if (grade.uom === 'Sq. Mtr.') {
            if (isNaN(l) || isNaN(w) || l <= 0 || w <= 0) { setCalculating(false); return setResult(null); }
        } else if (grade.uom === 'Metre') {
            if (isNaN(l) || l <= 0) { setCalculating(false); return setResult(null); }
        }

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(async () => {
            const seq = ++calcSeq.current;
            setCalculating(true);
            setCalcFailed(false);
            const res = await calculateBeltPrice({
                id: grade.name,
                length_mm: isNaN(l) ? 0 : l,
                width_mm: isNaN(w) ? 0 : w,
                quantity: q,
                joint_type: joint
            });
            if (seq !== calcSeq.current) return; // a newer calculation is on its way
            setResult(res);
            setCalcFailed(!res);
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

    const qty = parseInt(quantityStr, 10) || 0;
    const rupees = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <View style={[styles.container, { backgroundColor: UI_COLORS.bg }]}>
            <ScreenHeader
                title="Habasit Calculator"
                subtitle="Live prices from ERPNext"
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                rightIcon="refresh"
                onRightPress={handleClearAll}
            >
                {/* Grade picker sits on the band: it decides everything below. */}
                <TouchableOpacity style={styles.gradeSel} activeOpacity={0.85} onPress={() => setGradeModalVisible(true)}>
                    <View style={[styles.gradeTile, { backgroundColor: colors.primary }]}>
                        <Ionicons name="options-outline" size={20} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.gradeSelLabel}>ID / Grade *</Text>
                        <Text style={styles.gradeSelValue} numberOfLines={1}>{selectedGrade ? selectedGrade.grade : 'Select grade…'}</Text>
                        {selectedGrade ? <Text style={styles.gradeSelSub} numberOfLines={1}>{selectedGrade.name}</Text> : null}
                    </View>
                    <Ionicons name="chevron-down" size={20} color={colors.onInk} />
                </TouchableOpacity>
            </ScreenHeader>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={styles.scrollView}
                    contentContainerStyle={{ paddingBottom: vs(120), paddingHorizontal: s(16), paddingTop: 16, gap: 14 }}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View layout={smoothLayout} entering={enterSection(0)}>
                        <SectionCard icon="resize-outline" title="Size & joint" subtitle={selectedGrade ? undefined : 'Pick a grade first'}>
                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1.3, marginRight: s(10) }]}>
                                    <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Joint Type</Text>
                                    <View style={[styles.staticField, { backgroundColor: UI_COLORS.bg, borderColor: UI_COLORS.border }]}>
                                        <Text style={[styles.staticText, { color: UI_COLORS.text }]}>{jointType || '---'}</Text>
                                    </View>
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>UOM</Text>
                                    <View style={[styles.staticField, { backgroundColor: UI_COLORS.bg, borderColor: UI_COLORS.border }]}>
                                        <Text style={[styles.staticText, { color: UI_COLORS.text }]}>{selectedGrade?.uom || '---'}</Text>
                                    </View>
                                </View>
                            </View>

                            {(showLength || showWidth) && (
                                <View style={styles.row}>
                                    {showLength && (
                                        <Animated.View entering={appear} style={[styles.inputGroup, { flex: 1, marginRight: showWidth ? s(10) : 0 }]}>
                                            <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Length (mm)</Text>
                                            <TextInput
                                                style={[styles.textInput, { backgroundColor: UI_COLORS.bg, borderColor: UI_COLORS.border, color: UI_COLORS.text }]}
                                                keyboardType="numeric"
                                                placeholder="0"
                                                placeholderTextColor={colors.placeholder}
                                                value={lengthStr}
                                                onChangeText={(t) => setLengthStr(t.replace(/[^0-9]/g, ''))}
                                            />
                                        </Animated.View>
                                    )}
                                    {showWidth && (
                                        <Animated.View entering={appear} style={[styles.inputGroup, { flex: 1 }]}>
                                            <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Width (mm)</Text>
                                            <TextInput
                                                style={[styles.textInput, { backgroundColor: UI_COLORS.bg, borderColor: UI_COLORS.border, color: UI_COLORS.text }]}
                                                keyboardType="numeric"
                                                placeholder="0"
                                                placeholderTextColor={colors.placeholder}
                                                value={widthStr}
                                                onChangeText={(t) => setWidthStr(t.replace(/[^0-9]/g, ''))}
                                            />
                                        </Animated.View>
                                    )}
                                </View>
                            )}

                            <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                                <Text style={[styles.label, { color: UI_COLORS.textMuted }]}>Quantity</Text>
                                <View style={[styles.qtyRow, { backgroundColor: UI_COLORS.bg, borderColor: UI_COLORS.border }]}>
                                    <TouchableOpacity
                                        style={[styles.qtyBtn, { backgroundColor: colors.ink }]}
                                        onPress={() => setQuantityStr(String(Math.max(1, qty - 1)))}
                                        accessibilityLabel="Less"
                                    >
                                        <Ionicons name="remove" size={18} color="#FFF" />
                                    </TouchableOpacity>
                                    <TextInput
                                        style={[styles.qtyInput, { color: UI_COLORS.text }]}
                                        keyboardType="numeric"
                                        placeholder="1"
                                        placeholderTextColor={colors.placeholder}
                                        value={quantityStr}
                                        onChangeText={(t) => setQuantityStr(t.replace(/[^0-9]/g, ''))}
                                    />
                                    <TouchableOpacity
                                        style={[styles.qtyBtn, { backgroundColor: colors.primary }]}
                                        onPress={() => setQuantityStr(String(qty + 1))}
                                        accessibilityLabel="More"
                                    >
                                        <Ionicons name="add" size={18} color="#FFF" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </SectionCard>
                    </Animated.View>

                    {calculating ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={UI_COLORS.accent} />
                            <Text style={[styles.calculatingText, { color: UI_COLORS.textMuted }]}>Calculating...</Text>
                        </View>
                    ) : result ? (
                        <Animated.View layout={smoothLayout} entering={appear} style={[styles.result, { backgroundColor: colors.ink }, Shadow.raised(theme)]}>
                            <View pointerEvents="none" style={styles.resultGlow} />
                            <View style={styles.resultTop}>
                                <Text style={[styles.resultLabel, { color: colors.onInkMuted }]}>FINAL PRICE (INR)</Text>
                                {result.product_category ? (
                                    <View style={[styles.catPill, { backgroundColor: colors.ink2 }]}>
                                        <Text style={[styles.catPillText, { color: colors.amber }]} numberOfLines={1}>{result.product_category}</Text>
                                    </View>
                                ) : null}
                            </View>
                            <Text style={[styles.totalValue, { color: colors.mint }]} adjustsFontSizeToFit numberOfLines={1}>
                                ₹{result.final_price_inr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </Text>
                            {result.custom_item_name ? (
                                <Text style={[styles.resultItem, { color: colors.onInkMuted }]} numberOfLines={2}>{result.custom_item_name}</Text>
                            ) : null}
                            <View style={{ marginTop: 6 }}>
                                {([
                                    ['Area', `${result.area_sqm} sq.m`],
                                    ['Base price', rupees(result.base_price_inr)],
                                    ['Slitting charges', rupees(result.slitting_charges)],
                                    ['Joining charges', rupees(result.joining_charges)],
                                ] as const).map(([k, v]) => (
                                    <View key={k} style={styles.resultRow}>
                                        <Text style={[styles.resultRowLabel, { color: colors.onInk }]}>{k}</Text>
                                        <Text style={styles.resultRowValue}>{v}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>
                    ) : calcFailed ? (
                        <Animated.View entering={appear} style={[styles.infoBox, styles.errorBox, { borderColor: colors.danger + '55', backgroundColor: colors.danger + '12' }]}>
                            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                            <Text style={[styles.infoText, { color: colors.danger, flex: 1 }]}>
                                Could not get a price from ERPNext. Check your connection and the size, then try again.
                            </Text>
                            <TouchableOpacity
                                onPress={() => triggerCalculation(selectedGrade, lengthStr, widthStr, quantityStr, jointType)}
                                style={[styles.retryBtn, { backgroundColor: colors.danger }]}
                            >
                                <Text style={styles.retryText}>Try again</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    ) : (
                        !calculating && selectedGrade && (
                            <View style={styles.infoBox}>
                                <Ionicons name="information-circle-outline" size={16} color={UI_COLORS.accent} />
                                <Text style={[styles.infoText, { color: UI_COLORS.textMuted }]}>Enter dimensions to see results</Text>
                            </View>
                        )
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <Modal
                visible={gradeModalVisible}
                animationType="fade"
                transparent={true}
                statusBarTranslucent
                onRequestClose={() => setGradeModalVisible(false)}
            >
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setGradeModalVisible(false)} />
                    <Animated.View
                        entering={sheetIn}
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
                                <Text style={[styles.modalSubtitle, { color: UI_COLORS.textMuted }]}>Search and select grade</Text>
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
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')}>
                                    <Ionicons name="close-circle" size={18} color={UI_COLORS.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>

                        {loadingGrades ? (
                            <ActivityIndicator size="large" color={UI_COLORS.accent} style={{ marginTop: 40 }} />
                        ) : gradesFailed ? (
                            <View style={styles.gradesFailed}>
                                <Ionicons name="cloud-offline-outline" size={36} color={UI_COLORS.textMuted} />
                                <Text style={[styles.infoText, { color: UI_COLORS.textMuted, textAlign: 'center' }]}>
                                    Could not load the grades from ERPNext. Check your connection.
                                </Text>
                                <TouchableOpacity onPress={loadGrades} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
                                    <Text style={styles.retryText}>Try again</Text>
                                </TouchableOpacity>
                            </View>
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
                                            backgroundColor: selectedGrade?.name === item.name ? colors.primarySoft : 'transparent'
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
                                                    <View style={[styles.miniTag, { backgroundColor: colors.surfaceSecondary }]}>
                                                        <Text style={[styles.miniTagText, { color: UI_COLORS.textMuted }]}>{item.uom}</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={[styles.gradeId, { color: UI_COLORS.textMuted }]}>{item.name}</Text>
                                            {item.joint_type && (
                                                <View style={styles.jointTypeRow}>
                                                    <Ionicons name="link-outline" size={10} color={UI_COLORS.textMuted} />
                                                    <Text style={[styles.jointTypeTagText, { color: UI_COLORS.textMuted }]}>Default Joint: {item.joint_type}</Text>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    gradeSel: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#2A302C', borderRadius: 18, padding: 14 },
    gradeTile: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    gradeSelLabel: { fontSize: 11, fontWeight: '700', color: '#A79C8E' },
    gradeSelValue: { fontSize: 17, fontWeight: '800', color: '#FFF', marginTop: 2 },
    gradeSelSub: { fontSize: 11, color: '#A79C8E', marginTop: 1 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, height: 50, paddingHorizontal: 6 },
    qtyBtn: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    qtyInput: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800' },
    result: { borderRadius: 24, padding: 18, overflow: 'hidden' },
    resultGlow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, right: -50, top: -60, backgroundColor: 'rgba(127,209,168,0.12)' },
    resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    resultLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
    catPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
    catPillText: { fontSize: 11, fontWeight: '800' },
    resultItem: { fontSize: 12, marginTop: 2 },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
    resultRowLabel: { fontSize: 13.5 },
    resultRowValue: { fontSize: 13.5, fontWeight: '800', color: '#FFF' },
    scrollView: { flex: 1 },
    card: {
        borderRadius: Radius.lg,
        padding: 16,
        borderWidth: 1,
        marginBottom: 16,
        marginTop: 8,
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
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        height: 50,
    },
    dropdownText: { fontSize: 15, fontWeight: '500' },
    dropdownSubtext: { fontSize: 10, marginTop: 1 },
    staticField: {
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: 12,
        height: 50,
        justifyContent: 'center',
    },
    staticText: { fontSize: 14, fontWeight: '600' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    textInput: {
        borderWidth: 1,
        borderRadius: Radius.md,
        height: 50,
        paddingHorizontal: 12,
        fontSize: 15,
        fontWeight: '600',
    },
    loadingContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, flexDirection: 'row', gap: 10 },
    calculatingText: { fontSize: 13, fontWeight: '500' },
    detailsBox: {
        backgroundColor: 'rgba(139, 148, 158, 0.08)',
        borderRadius: Radius.md,
        padding: 12,
        marginBottom: 16,
    },
    detailRow: { marginBottom: 8 },
    detailLabel: { fontSize: 10, textTransform: 'uppercase', marginBottom: 2 },
    detailValue: { fontSize: 13, fontWeight: '600' },
    priceGrid: { flexDirection: 'row', marginBottom: 12 },
    priceItem: { flex: 1 },
    priceLabel: { fontSize: 11, marginBottom: 2 },
    priceValue: { fontSize: 15, fontWeight: '700' },
    totalContainer: {
        marginTop: 8,
        borderRadius: Radius.md,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
    },
    totalLabel: { fontSize: 11, fontWeight: '800', marginBottom: 4, letterSpacing: 1 },
    totalValue: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 },
    infoBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
    infoText: { fontSize: 13 },
    modalContent: {
        height: '75%',
        width: '100%',
        position: 'absolute',
        bottom: 0,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        paddingBottom: 64,
        padding: 20,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800' },
    modalSubtitle: { fontSize: 12, marginTop: 2 },
    modalClose: { padding: 4 },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Radius.md,
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
    miniTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: 'transparent' },
    miniTagText: { fontSize: 9, fontWeight: '700' },
    jointTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    jointTypeTagText: { fontSize: 10, fontWeight: '500' },
    gradeId: { fontSize: 11, marginTop: 2 },
    uomTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    uomTagText: { fontSize: 10, fontWeight: '800' },
    errorBox: { borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
    retryBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    retryText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
    gradesFailed: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 24 },
});
