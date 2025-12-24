import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');

export const FloatingNav = () => {
    const router = useRouter();
    const pathname = usePathname();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const isHome = pathname === '/home';
    const isQuotation = pathname.includes('/quotations');

    return (
        <View style={styles.container}>
            <View style={[styles.navBar, { backgroundColor: theme === 'dark' ? 'rgba(30,40,55,0.95)' : 'rgba(255,255,255,0.95)' }]}>
                <TouchableOpacity
                    style={[styles.navItem, isHome && styles.activeItem]}
                    onPress={() => router.replace('/home')}
                >
                    <Ionicons
                        name="grid"
                        size={18}
                        color={isHome ? '#0277BD' : '#90A4AE'}
                    />
                    <Text style={[styles.navText, { color: isHome ? '#0277BD' : '#90A4AE' }]}>Dashboard</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.navItem, isQuotation && styles.activeItem]}
                    onPress={() => router.replace('/quotations')}
                >
                    <View style={[styles.dotIcon, { backgroundColor: isQuotation ? '#00BFA5' : '#90A4AE' }]} />
                    <Text style={[styles.navText, { color: isQuotation ? '#00BFA5' : '#90A4AE' }]}>Quotation</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 30,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
    },
    navBar: {
        flexDirection: 'row',
        padding: 5,
        borderRadius: 40,
        width: width * 0.7,
        gap: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 15,
        elevation: 10,
    },
    navItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 35,
        gap: 8,
    },
    activeItem: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    navText: {
        fontSize: 14,
        fontWeight: '700',
    },
    dotIcon: {
        width: 14,
        height: 14,
        borderRadius: 7,
    }
});
