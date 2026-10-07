import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

// Tracks which notification identifiers we've already surfaced so the alert
// never fires twice for the same delivery.
const _seen = new Set<string>();

function handleNotification(
    notification: Notifications.Notification,
    navigate: (id: string) => void,
) {
    const id = notification.request.identifier;
    if (_seen.has(id)) return;
    _seen.add(id);

    const data = notification.request.content.data as any;
    const quotationId: string | undefined = data?.id;
    const title = notification.request.content.title ?? 'Quotation Awaiting Approval';
    const body = notification.request.content.body ?? '';

    const buttons: Alert['prototype']['props']['buttons'] = [];
    if (quotationId) {
        buttons.push({ text: 'View', onPress: () => navigate(quotationId) });
    }
    buttons.push({ text: 'Dismiss', style: 'cancel' });

    Alert.alert(title, body, buttons, { cancelable: false });
}

// This component renders nothing — it only manages notification listeners.
export const NotificationPopup = () => {
    const router = useRouter();

    const navigate = (quotationId: string) => {
        router.push({ pathname: '/quotations/[id]', params: { id: quotationId } });
    };

    useEffect(() => {
        // Foreground: notification arrives while app is open
        const fgSub = Notifications.addNotificationReceivedListener(n => {
            handleNotification(n, navigate);
        });

        // Background → Foreground: user opens the app after seeing the system
        // notification. Check the notification tray for any pending quotation
        // notifications and surface them as an alert.
        const appSub = AppState.addEventListener('change', async nextState => {
            if (nextState !== 'active') return;
            try {
                const presented = await Notifications.getPresentedNotificationsAsync();
                const notif = presented.find(
                    n => (n.request.content.data as any)?.id
                );
                if (!notif) return;
                handleNotification(notif, navigate);
                Notifications.dismissNotificationAsync(notif.request.identifier);
            } catch (_) {}
        });

        return () => {
            fgSub.remove();
            appSub.remove();
        };
    }, []);

    return null;
};
