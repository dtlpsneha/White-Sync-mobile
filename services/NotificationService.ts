import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Handle notifications with sound and badge
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const notificationService = {
    async postLocalNotification(title: string, body: string, data: any = {}, categoryId: string = 'default') {
        try {
            const finalTitle = String(title || 'Quotation Update').trim();
            const finalBody = String(body || 'A quotation requires your attention.').trim();
            await this.setupChannels();
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: finalTitle,
                    body: finalBody,
                    data: data || {},
                    sound: true,
                    priority: Notifications.AndroidNotificationPriority.MAX,
                    color: '#7367F0',
                },
                trigger: Platform.OS === 'android' ? { channelId: 'quotation-alerts' } : null,
            });
        } catch (e) {
            console.error('[NotificationService] Failed to post local notification:', e);
        }
    },

    async postStickyNotification(title: string, body: string, data: any = {}) {
        try {
            await this.setupChannels();
            // Post immediately with trigger: null (don't schedule for future)
            // sticky: true + autoDismiss: false keeps it in tray on Android
            await Notifications.scheduleNotificationAsync({
                content: {
                    title,
                    body,
                    data,
                    sound: true,
                    priority: Notifications.AndroidNotificationPriority.MAX,
                    color: '#7367F0',
                    autoDismiss: false,     // Don't auto-dismiss from tray
                    sticky: true,           // Keep in notification center
                    categoryIdentifier: 'quotation_actions',
                },
                trigger: null,  // Show immediately, don't schedule for later
            });
        } catch (e) {
            console.error('[NotificationService] Failed to post sticky notification:', e);
        }
    },

    async setupChannels() {
        if (Platform.OS !== 'android') return;

        await Notifications.setNotificationChannelAsync('quotation-alerts', {
            name: 'Quotation Alerts',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#7367F0',
            showBadge: true,
            bypassDnd: true,
            enableVibrate: true,
            enableLights: true,
        });

        // Set up action buttons here too so they're available even when the
        // background task posts a sticky notification before the UI mounts.
        await Notifications.setNotificationCategoryAsync('quotation_actions', [
            {
                identifier: 'view',
                buttonTitle: 'View',
                options: { opensAppToForeground: true },
            },
            {
                identifier: 'dismiss',
                buttonTitle: 'Dismiss',
                options: { opensAppToForeground: false },
            },
        ]).catch(e => console.log('[NotificationService] Category setup:', e));
    },
};
