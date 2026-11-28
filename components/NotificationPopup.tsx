import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useNotifications } from '@/context/NotificationsContext';
import { useRouter } from 'expo-router';
import { notifeeService } from '@/services/NotifeeService';
import { FloatingNotifications } from '@/modules/floating-notifications';
import { isTeamAlert, notificationTarget } from '@/utils/notificationTarget';

export const NotificationPopup = () => {
    const { notifications, markAsRead } = useNotifications();
    const router = useRouter();
    const listRef = useRef(notifications);
    listRef.current = notifications;

    useEffect(() => {
        notifeeService.setupChannels();

        // Opens what the alert is about and marks its list entry read (the list keys
        // entries by their own id, so match on what the alert points at).
        const open = (data: Record<string, any>) => {
            const match = listRef.current.find(n =>
                !n.read && ((data.teamJobId && n.data?.teamJobId === data.teamJobId) || (data.id && n.data?.id === data.id)));
            if (match) markAsRead(match.id);
            const target = notificationTarget(data);
            if (target) router.push(target);
        };
        const off = notifeeService.setupNotificationHandlers(open);
        notifeeService.getInitialData().then(d => { if (d) open(d); });

        const listener = Notifications.addNotificationReceivedListener((notification) => {
            // With the app open, Expo already shows the alert and the in-app card shows it
            // too; a second tray entry and the floating overlay only repeated it.
            if (AppState.currentState === 'active') return;
            const content = notification.request.content;
            const title = content.title || 'New Quotation';
            const body = content.body || 'A quotation requires your attention.';
            const data = content.data || {};
            // A Team chat alert is already on screen as an ordinary notification, and
            // the persistent popup and overlay below only know how to open a quotation.
            if (isTeamAlert(data)) return;
            const quotationId = typeof data.id === 'string' ? data.id : undefined;
            try {
                notifeeService.displayPersistentNotification(title, body, data, quotationId);
                FloatingNotifications.showOverlay(title, body, quotationId ?? null);
            } catch (e) {
                console.warn('[NotificationPopup] could not show the alert:', e);
            }
        });

        return () => {
            listener.remove();
            off();
        };
    }, [markAsRead, router]);

    return null;
};
