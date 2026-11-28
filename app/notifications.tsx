import React from 'react';
import { Alert, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationsContext';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { NotificationCenter } from '@/components/NotificationCenter';
import { notificationTarget } from '@/utils/notificationTarget';

export default function NotificationsScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const { notifications, markAsRead, clearAll } = useNotifications();
    const unread = notifications.filter(n => !n.read).length;

    const handleNotificationTap = (notification: any) => {
        const target = notificationTarget(notification.data);
        if (target) router.push(target);
    };

    // Clearing removes every notification from this phone, so ask first.
    const confirmClear = () =>
        Alert.alert('Clear all notifications?', 'They will be removed from this phone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear all', style: 'destructive', onPress: clearAll },
        ]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Notifications"
                subtitle={notifications.length ? `${unread} new · ${notifications.length} in all` : 'Nothing new'}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                rightIcon={notifications.length ? 'trash-outline' : undefined}
                onRightPress={notifications.length ? confirmClear : undefined}
            />

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
