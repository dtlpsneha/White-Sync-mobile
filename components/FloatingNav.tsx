import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, PanResponder, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';

// Home screen has nav embedded in scroll content — drawer only needed on other screens
const NAV_ROUTES = [
    '/quotations',
    '/sales-orders',
    '/maintenance',
    '/daily-sales-report',
    '/daily-sales-report/invoice-history',
    '/price-calculator',
    '/profile',
];

const NAV_ITEMS = [
    { id: 'home',       label: 'Home',                         icon: 'home-outline' as const,          activeIcon: 'home' as const,          route: '/home',                           color: '#3B82F6', mode: 'replace' as const },
    { id: 'quotes',     label: 'Quotation',                    icon: 'document-text-outline' as const, activeIcon: 'document-text' as const, route: '/quotations',                     color: '#F59E0B', mode: 'replace' as const },
    { id: 'orders',     label: 'Customer Purchase Order',      icon: 'cart-outline' as const,          activeIcon: 'cart' as const,          route: '/sales-orders',                   color: '#14B8A6', mode: 'replace' as const },
    { id: 'visits',     label: 'Customer Visit',               icon: 'calendar-outline' as const,      activeIcon: 'calendar' as const,      route: '/maintenance',                    color: '#8B5CF6', mode: 'replace' as const },
    { id: 'daily-sales',label: 'Daily Sales Report',           icon: 'bar-chart-outline' as const,     activeIcon: 'bar-chart' as const,     route: '/daily-sales-report',             color: '#F97316', mode: 'push' as const },
    { id: 'invoices',   label: 'Sales Invoice History',        icon: 'receipt-outline' as const,       activeIcon: 'receipt' as const,       route: '/daily-sales-report/invoice-history', color: '#0891B2', mode: 'push' as const },
    { id: 'calculator', label: 'Habasit Calculator',           icon: 'calculator-outline' as const,    activeIcon: 'calculator' as const,    route: '/price-calculator',               color: '#10B981', mode: 'push' as const },
    { id: 'profile',    label: 'Profile',                      icon: 'person-outline' as const,        activeIcon: 'person' as const,        route: '/profile',                        color: '#6366F1', mode: 'replace' as const },
];

export const FloatingNav = () => {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    const { ms } = useResponsive();

    const isNavVisible = NAV_ROUTES.includes(pathname);
    const [isOpen, setIsOpen] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);

    const translateY = useSharedValue(340);
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (evt, { dy, vy }) => {
                return Math.abs(vy) > 0.3;
            },
            onMoveShouldSetPanResponder: (evt, { dy, vy }) => {
                return Math.abs(vy) > 0.3;
            },
            onPanResponderMove: (evt, { dy }) => {
                const newY = Math.max(0, Math.min(340, 340 - dy));
                translateY.value = newY;
            },
            onPanResponderRelease: (evt, { dy, vy }) => {
                if (vy > 0.3 || dy > 50) {
                    setIsOpen(true);
                    translateY.value = withSpring(0);
                } else if (vy < -0.3 || dy < -50) {
                    setIsOpen(false);
                    translateY.value = withSpring(340);
                } else {
                    const targetY = isOpen ? 0 : 340;
                    translateY.value = withSpring(targetY);
                }
            },
        })
    ).current;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
        const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    const activeIndex = useMemo(() => {
        const exact = NAV_ITEMS.findIndex(item => pathname === item.route);
        if (exact !== -1) return exact;
        const prefix = NAV_ITEMS.findIndex(item =>
            item.route !== '/home' && pathname.startsWith(item.route + '/')
        );
        return prefix !== -1 ? prefix : 0;
    }, [pathname]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    if (keyboardVisible || !isNavVisible) return null;

    const row1 = NAV_ITEMS.slice(0, 4);
    const row2 = NAV_ITEMS.slice(4, 8);

    const renderBox = (item: typeof NAV_ITEMS[0], index: number) => {
        const isActive = activeIndex === index;
        return (
            <TouchableOpacity
                key={item.id}
                style={[
                    styles.box,
                    {
                        backgroundColor: isActive ? item.color : isDark ? `${item.color}20` : `${item.color}15`,
                        borderColor: isActive ? item.color : `${item.color}40`,
                        borderWidth: 1,
                    },
                ]}
                onPress={() => {
                    item.mode === 'push'
                        ? router.push(item.route as any)
                        : router.replace(item.route as any);
                    setIsOpen(false);
                    translateY.value = withSpring(340);
                }}
                activeOpacity={0.7}
            >
                <Ionicons
                    name={isActive ? item.activeIcon : item.icon}
                    size={ms(18)}
                    color={isActive ? '#FFF' : item.color}
                />
                <Text
                    style={[
                        styles.label,
                        { color: isActive ? '#FFF' : item.color, fontWeight: isActive ? '800' : '700' },
                    ]}
                    numberOfLines={2}
                >
                    {item.label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <>
            {isOpen && (
                <TouchableOpacity
                    style={styles.overlay}
                    activeOpacity={0.3}
                    onPress={() => {
                        setIsOpen(false);
                        translateY.value = withSpring(340);
                    }}
                />
            )}

            <View
                style={styles.outerContainer}
                {...panResponder.panHandlers}
            >
                <View style={[
                    styles.dragHandle,
                    { backgroundColor: colors.surface, borderColor: colors.border }
                ]}>
                    <View style={[
                        styles.dragBar,
                        { backgroundColor: colors.textSecondary }
                    ]} />
                </View>

                <Animated.View
                    style={[
                        styles.navContainer,
                        {
                            backgroundColor: colors.surface,
                            borderTopColor: colors.border,
                        },
                        animatedStyle,
                    ]}
                >
                    <View style={styles.gridContent}>
                        <View style={styles.row}>
                            {row1.map((item, i) => renderBox(item, i))}
                        </View>
                        <View style={styles.row}>
                            {row2.map((item, i) => renderBox(item, i + 4))}
                        </View>
                    </View>
                </Animated.View>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 999,
    },
    outerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        height: 340,
    },
    dragHandle: {
        height: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderTopLeftRadius: Radius.lg,
        borderTopRightRadius: Radius.lg,
        borderWidth: 1,
        borderBottomWidth: 0,
    },
    dragBar: {
        width: 40,
        height: 5,
        borderRadius: 3,
        opacity: 0.5,
    },
    navContainer: {
        flex: 1,
        borderTopWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 12,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -6 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
            },
            android: { elevation: 12 },
        }),
    },
    gridContent: {
        flex: 1,
        gap: 10,
        justifyContent: 'center',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
    },
    box: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
        borderRadius: Radius.md,
        gap: 4,
    },
    label: {
        fontSize: 9,
        letterSpacing: 0.2,
        textAlign: 'center',
        fontWeight: '700',
    },
});
