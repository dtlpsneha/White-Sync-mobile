import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationsContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { NotificationCenter } from '@/components/NotificationCenter';
import { notificationTarget } from '@/utils/notificationTarget';

export default function NotificationsScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const { notifications, markAsRead, clearAll } = useNotifications();

    const handleNotificationTap = (notification: any) => {
        const target = notificationTarget(notification.data);
        if (target) router.push(target);
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader title="Notifications" onBack={() => router.back()} />

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

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
