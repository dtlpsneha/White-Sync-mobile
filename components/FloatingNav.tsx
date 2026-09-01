import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View, LayoutChangeEvent, Text } from 'react-native';
import Animated, { 
    useAnimatedStyle, 
    useSharedValue, 
    withSpring,
    withTiming,
    interpolateColor
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const FloatingNav = () => {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    const { ms } = useResponsive();

    // Navigation Items with specific colors
    const navItems = useMemo(() => [
        { id: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home', route: '/home', color: '#3B82F6' },
        { id: 'quotes', label: 'Quotes', icon: 'document-text-outline', activeIcon: 'document-text', route: '/quotations', color: '#F59E0B' },
        { id: 'orders', label: 'Orders', icon: 'cart-outline', activeIcon: 'cart', route: '/sales-orders', color: '#00BFA5' },
        { id: 'visits', label: 'Visits', icon: 'calendar-outline', activeIcon: 'calendar', route: '/maintenance', color: '#8B5CF6' },
        { id: 'calculator', label: 'Calculator', icon: 'calculator-outline', activeIcon: 'calculator', route: '/price-calculator', color: '#10B981' },
        { id: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person', route: '/profile', color: '#6366F1' },
    ], []);

    // Active Index Calculation
    const activeIndex = useMemo(() => {
        const index = navItems.findIndex(item => 
            pathname === item.route || pathname.startsWith(item.route + '/')
        );
        return index !== -1 ? index : 0;
    }, [pathname, navItems]);

    // Animation values
    const translateX = useSharedValue(0);
    const activeIndexShared = useSharedValue(0);
    const indicatorOpacity = useSharedValue(0);
    const [layouts, setLayouts] = useState<number[]>([]);

    useEffect(() => {
        if (layouts[activeIndex] !== undefined) {
            translateX.value = withSpring(layouts[activeIndex], {
                damping: 20,
                stiffness: 150,
            });
            activeIndexShared.value = withTiming(activeIndex, { duration: 300 });
            indicatorOpacity.value = withTiming(1, { duration: 300 });
        }
    }, [activeIndex, layouts]);

    const onLayout = (event: LayoutChangeEvent, index: number) => {
        const { x, width } = event.nativeEvent.layout;
        const center = x + width / 2;

        // Functional update: all tabs fire onLayout in the same commit, so
        // copying `layouts` from the render closure meant every write but the
        // last was discarded — often leaving layouts[activeIndex] undefined
        // and the indicator stuck at opacity 0.
        setLayouts(prev => {
            if (prev[index] === center) return prev;
            const next = [...prev];
            next[index] = center;
            return next;
        });
    };

    const indicatorOffset = ms(28); // Slightly bigger indicator for labels

    const animatedIndicatorStyle = useAnimatedStyle(() => {
        // Build color palette for interpolation
        const inputMap = navItems.map((_, i) => i);
        const colorMap = navItems.map(item => `${item.color}18`); // Very subtle background

        return {
            transform: [{ translateX: translateX.value - indicatorOffset }],
            opacity: indicatorOpacity.value,
            backgroundColor: interpolateColor(
                activeIndexShared.value,
                inputMap,
                colorMap
            )
        };
    });

    return (
        <View style={[styles.container, { bottom: Math.max(insets.bottom, 20) + 10 }]}>
            <View 
                style={[
                    styles.navBar,
                    {
                        // Tracks Colors.dark.surface so the bar sits on the same
                        // elevation step as the cards behind it.
                        backgroundColor: isDark ? 'rgba(21, 24, 29, 0.94)' : 'rgba(255, 255, 255, 0.92)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(0, 0, 0, 0.05)',
                    }
                ]}
            >
                {/* Visual Depth Gradient */}
                <LinearGradient
                    colors={isDark 
                        ? ['rgba(255,255,255,0.04)', 'transparent', 'rgba(0,0,0,0.12)'] 
                        : ['rgba(255,255,255,0.4)', 'transparent', 'rgba(0,0,0,0.03)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />

                {/* Sliding Indicator */}
                <Animated.View 
                    style={[
                        styles.indicator, 
                        animatedIndicatorStyle,
                    ]} 
                />

                {/* Navigation Items */}
                {navItems.map((item, index) => {
                    const isActive = activeIndex === index;
                    const activeColor = item.color;
                    
                    return (
                        <TouchableOpacity
                            key={item.id}
                            onLayout={(e) => onLayout(e, index)}
                            style={styles.navItem}
                            onPress={() => router.replace(item.route as any)}
                            activeOpacity={0.7}
                        >
                            <Animated.View style={styles.iconContainer}>
                                <Ionicons
                                    name={isActive ? (item.activeIcon as any) : (item.icon as any)}
                                    size={ms(22)}
                                    color={isActive ? activeColor : '#94A3B8'}
                                />
                            </Animated.View>
                            <Text 
                                style={[
                                    styles.itemLabel, 
                                    { 
                                        color: isActive ? activeColor : '#94A3B8',
                                        fontWeight: isActive ? '800' : '600'
                                    }
                                ]}
                                numberOfLines={1}
                            >
                                {item.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 20,
        right: 20,
        zIndex: 1000,
        alignItems: 'center',
    },
    navBar: {
        flexDirection: 'row',
        height: 78,
        borderRadius: 39,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: 500,
        borderWidth: 1,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.15,
                shadowRadius: 20,
            },
            android: {
                elevation: 10,
            }
        })
    },
    navItem: {
        flex: 1,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    itemLabel: {
        fontSize: 10,
        letterSpacing: 0.2,
    },
    indicator: {
        position: 'absolute',
        width: 56,
        height: 56,
        borderRadius: 28,
        zIndex: -1,
    }
});
