import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

/**
 * Home-screen-only menu — a small toggle button meant to sit inline in a
 * screen's header row. Tapping it opens a dropdown-style menu anchored
 * directly under the button (not a floating, vertically-centered rail
 * overlapping page content, which is what this replaced). FloatingNav stays
 * bottom-pinned everywhere else — this component is Home-only.
 */
export const SideNav = ({ onDark = false }: { onDark?: boolean }) => {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { ms } = useResponsive();

    const [expanded, setExpanded] = useState(false);

    // "push"-mode items are stacked feature screens with their own back
    // button (AI chat, customer search) — replacing them onto the current
    // screen would leave nothing to go back to. The rest are primary,
    // tab-like destinations, where replace avoids growing an unbounded
    // back-stack every time one is picked from the menu.
    const navItems = useMemo(() => [
        { id: 'home', icon: 'home-outline', activeIcon: 'home', label: 'Home', route: '/home', color: '#3B82F6', mode: 'replace' as const },
        { id: 'quotes', icon: 'document-text-outline', activeIcon: 'document-text', label: 'Quotes', route: '/quotations', color: '#F59E0B', mode: 'replace' as const },
        { id: 'orders', icon: 'cart-outline', activeIcon: 'cart', label: 'Sales Orders', route: '/sales-orders', color: '#14B8A6', mode: 'replace' as const },
        { id: 'visits', icon: 'calendar-outline', activeIcon: 'calendar', label: 'Visits', route: '/maintenance', color: '#8B5CF6', mode: 'replace' as const },
        { id: 'calculator', icon: 'calculator-outline', activeIcon: 'calculator', label: 'Price Calculator', route: '/price-calculator', color: '#10B981', mode: 'push' as const },
        { id: 'invoiceHistory', icon: 'receipt-outline', activeIcon: 'receipt', label: 'Sales Invoice History', route: '/daily-sales-report/invoice-history', color: '#0891B2', mode: 'push' as const },
        { id: 'customerSearch', icon: 'search-outline', activeIcon: 'search', label: 'Search Customers', route: '/customer-search', color: '#0EA5E9', mode: 'push' as const },
        { id: 'ai', icon: 'sparkles-outline', activeIcon: 'sparkles', label: 'Smart Ops AI', route: '/ai-chat', color: '#EC4899', mode: 'push' as const },
        { id: 'profile', icon: 'person-outline', activeIcon: 'person', label: 'Profile', route: '/profile', color: '#6366F1', mode: 'replace' as const },
    ], []);

    const activeIndex = useMemo(() => {
        const index = navItems.findIndex(item =>
            pathname === item.route || pathname.startsWith(item.route + '/')
        );
        return index !== -1 ? index : 0;
    }, [pathname, navItems]);

    const closeMenu = () => setExpanded(false);
    const goTo = (route: string, mode: 'push' | 'replace') => {
        setExpanded(false);
        if (mode === 'push') router.push(route as any);
        else router.replace(route as any);
    };

    return (
        <View>
            <TouchableOpacity
                style={[
                    styles.toggleButton,
                    onDark
                        ? { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)' }
                        : { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                ]}
                onPress={() => setExpanded(true)}
                activeOpacity={0.8}
            >
                <Ionicons name="menu-outline" size={ms(20)} color={onDark ? '#FFF' : colors.text} />
            </TouchableOpacity>

            <Modal visible={expanded} transparent animationType="none" onRequestClose={closeMenu}>
                <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu}>
                    <Animated.View
                        entering={FadeIn.duration(150)}
                        exiting={FadeOut.duration(120)}
                        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10,15,25,0.35)' }]}
                    />
                </Pressable>
                <Animated.View
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(120)}
                    style={[
                        styles.menu,
                        {
                            backgroundColor: colors.surface,
                            borderColor: colors.border,
                        },
                        Shadow.raised(theme)
                    ]}
                >
                    {navItems.map((item) => {
                        const isActive = activeIndex === navItems.indexOf(item);
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.menuItem}
                                onPress={() => goTo(item.route, item.mode)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.menuIconWrap, { backgroundColor: `${item.color}18` }]}>
                                    <Ionicons
                                        name={(isActive ? item.activeIcon : item.icon) as any}
                                        size={ms(18)}
                                        color={item.color}
                                    />
                                </View>
                                <Animated.Text style={[styles.menuLabel, { color: colors.text, fontWeight: isActive ? '800' : '600' }]}>
                                    {item.label}
                                </Animated.Text>
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    toggleButton: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    menu: {
        position: 'absolute',
        top: Platform.OS === 'android' ? 70 : 90,
        left: 20,
        width: 220,
        borderRadius: Radius.lg,
        borderWidth: 1,
        paddingVertical: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    menuIconWrap: {
        width: 32,
        height: 32,
        borderRadius: Radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuLabel: {
        fontSize: 14,
    },
});
