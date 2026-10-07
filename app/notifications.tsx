import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { useNotifications } from '@/context/NotificationsContext';
import { NotificationCenter } from '@/components/NotificationCenter';

export default function NotificationsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const isDark = theme === 'dark';
    const styles = useMemo(() => getStyles(theme, { s, vs, ms }), [theme, s, vs, ms]);

    const { notifications, markAsRead, clearAll } = useNotifications();

    const handleNotificationTap = (notification: any) => {
        if (notification.data?.id) {
            router.push({ pathname: '/quotations/[id]', params: { id: notification.data.id } });
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <StatusBar style={isDark ? 'light' : 'dark'} />

            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="chevron-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="notifications" size={20} color={colors.text} />
                    </View>
                </View>
                <View style={{ width: 40 }} />
            </View>

            {/* Notification Center */}
            <NotificationCenter
                notifications={notifications}
                onMarkRead={markAsRead}
                onClearAll={clearAll}
                onNotificationTap={handleNotificationTap}
            />
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
        },
        header: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: s(16),
            paddingVertical: vs(12),
            borderBottomWidth: 1,
            paddingTop: vs(12),
        },
        backButton: {
            width: 40,
            height: 40,
            borderRadius: 20,
            justifyContent: 'center',
            alignItems: 'center',
        },
    });
}
