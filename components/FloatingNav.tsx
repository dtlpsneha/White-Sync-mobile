import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const FloatingNav = () => {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    const { ms, s } = useResponsive();

    const isHome = pathname === '/home';
    const isQuotation = pathname.includes('/quotations');
    const isMaintenance = pathname.includes('/maintenance');

    return (
        <View style={styles.container}>
            <View style={[styles.navBar, {
                backgroundColor: theme === 'dark' ? '#0F172A' : '#FFFFFF',
                borderTopColor: theme === 'dark' ? '#1E293B' : '#F1F5F9',
                borderTopWidth: 1,
                paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, ms(25)) : Math.max(insets.bottom, ms(12)),
                paddingTop: ms(12),
                paddingHorizontal: s(10),
            }]}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => router.replace('/home')}
                >
                    <Ionicons
                        name={isHome ? "grid" : "grid-outline"}
                        size={ms(22)}
                        color={isHome ? '#0277BD' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, { color: isHome ? '#0277BD' : '#94A3B8', fontSize: ms(10) }]} numberOfLines={1}>Home</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => router.replace('/quotations')}
                >
                    <Ionicons
                        name={isQuotation ? "document-text" : "document-text-outline"}
                        size={ms(22)}
                        color={isQuotation ? '#00BFA5' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, { color: isQuotation ? '#00BFA5' : '#94A3B8', fontSize: ms(10) }]} numberOfLines={1}>Quote</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => router.replace('/maintenance')}
                >
                    <Ionicons
                        name={isMaintenance ? "calendar" : "calendar-outline"}
                        size={ms(22)}
                        color={isMaintenance ? '#F4511E' : '#94A3B8'}
                    />
                    <Text style={[styles.navText, { color: isMaintenance ? '#F4511E' : '#94A3B8', fontSize: ms(10) }]} numberOfLines={1}>Records</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
    },
    navBar: {
        flexDirection: 'row',
        width: SCREEN_WIDTH,
        justifyContent: 'space-around',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 20,
    },
    navItem: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 4,
        minWidth: 60,
    },
    navText: {
        fontWeight: '700',
    }
});
