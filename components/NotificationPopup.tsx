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
    console.log('[NotificationPopup] handleNotification called for id:', id);
    if (_seen.has(id)) {
        console.log('[NotificationPopup] Already seen this notification, skipping');
        return;
    }
    _seen.add(id);

    const data = notification.request.content.data as any;
    const quotationId: string | undefined = data?.id;
    const title = notification.request.content.title ?? 'Quotation Awaiting Approval';
    const body = notification.request.content.body ?? '';

    console.log('[NotificationPopup] Showing alert:', { title, body, quotationId });

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
        console.log('[NotificationPopup] Setting up listeners');

        // Foreground: notification arrives while app is open
        const fgSub = Notifications.addNotificationReceivedListener(n => {
            console.log('[NotificationPopup] addNotificationReceivedListener FIRED', {
                id: n.request.identifier,
                title: n.request.content.title,
                data: n.request.content.data,
            });
            handleNotification(n, navigate);
        });

        // Background → Foreground: user opens the app after seeing the system
        // notification. Check the notification tray for any pending quotation
        // notifications and surface them as an alert.
        const appSub = AppState.addEventListener('change', async nextState => {
            console.log('[NotificationPopup] AppState changed to:', nextState);
            if (nextState !== 'active') return;
            try {
                const presented = await Notifications.getPresentedNotificationsAsync();
                console.log('[NotificationPopup] Presented notifications:', presented.length);
                const notif = presented.find(
                    n => (n.request.content.data as any)?.id
                );
                if (!notif) {
                    console.log('[NotificationPopup] No quotation notification found in tray');
                    return;
                }
                console.log('[NotificationPopup] Found notification in tray:', notif.request.identifier);
                handleNotification(notif, navigate);
                Notifications.dismissNotificationAsync(notif.request.identifier);
            } catch (e) {
                console.log('[NotificationPopup] Error checking tray:', e);
            }
        });

        return () => {
            fgSub.remove();
            appSub.remove();
        };
    }, []);

    return null;
};
