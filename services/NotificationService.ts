import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export const notificationService = {
    /**
     * Schedules a local notification to be displayed immediately
     */
    async postLocalNotification(title: string, body: string, data: any = {}, categoryId: string = "default") {
        try {
            const finalTitle = String(title || "Quotation Update").trim();
            const finalBody = String(body || "A quotation requires your attention.").trim();

            console.log(`[NotificationService] 🔔 Posting Notification:
            Title: "${finalTitle}"
            Body: "${finalBody}"
            Data: ${JSON.stringify(data)}`);

            // Safety: Ensure channels are set up before posting
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
            console.log('[NotificationService] ✅ Notification scheduled successfully');
        } catch (error) {
            console.error('[NotificationService] ❌ Failed to post local notification:', error);
        }
    },

    /**
     * Sets up notification channels (required for Android)
     */
    async setupChannels() {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('quotation-alerts', {
                name: 'Quotation Alerts',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#7367F0',
                showBadge: true,
            });
        }
    }
};
