import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { useNotifications } from '@/context/NotificationsContext';
import { useRouter } from 'expo-router';
import { notifeeService } from '@/services/NotifeeService';

export const NotificationPopup = () => {
    const { notifications, markAsRead } = useNotifications();
    const router = useRouter();

    useEffect(() => {
        // Setup Notifee notification handlers for persistent popups
        notifeeService.setupChannels();
        notifeeService.setupNotificationHandlers((quotationId) => {
            markAsRead(quotationId);
            router.push({
                pathname: '/quotations/[id]',
                params: { id: quotationId }
            });
        });

        // When notification arrives, display as persistent popup via Notifee
        const listener = Notifications.addNotificationReceivedListener((notification) => {
            const content = notification.request.content;
            const title = content.title || 'New Quotation';
            const body = content.body || 'A quotation requires your attention.';
            const data = content.data || {};
            const quotationId = data.id as string | undefined;

            console.log('[NotificationPopup] Received notification, displaying persistently');
            notifeeService.displayPersistentNotification(title, body, data, quotationId);
        });

        return () => listener.remove();
    }, [markAsRead, router]);

    return null;
};
