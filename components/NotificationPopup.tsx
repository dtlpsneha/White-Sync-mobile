import * as Notifications from 'expo-notifications';
import React, { useEffect } from 'react';
import { useNotifications } from '@/context/NotificationsContext';

export const NotificationPopup = () => {
    const { notifications } = useNotifications();

    useEffect(() => {
        // When notification arrives, it will be captured by NotificationsContext listener
        // This component just ensures the context is active
        const listener = Notifications.addNotificationReceivedListener(() => {
            // Notification received and saved to context by NotificationsContext listener
        });

        return () => listener.remove();
    }, []);

    return null;
};
