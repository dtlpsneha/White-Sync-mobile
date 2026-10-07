import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

export const BACKGROUND_NOTIFICATION_TASK = 'QUOTATION_BACKGROUND_NOTIFICATION';

// Must be defined at module scope (outside any component/function).
// Runs when a notification arrives while the app is backgrounded or killed.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
    if (error) {
        console.error('[BGNotif] Task error:', error);
        return;
    }

    const notification = data?.notification as Notifications.Notification | undefined;
    if (!notification) return;

    const content = notification.request.content;
    const quotationId = (content.data as any)?.id;
    if (!quotationId) return;

    console.log('[BGNotif] Quotation notification in background, id:', quotationId);

    // Brief delay so the OS shows the FCM heads-up before we replace it
    await new Promise(res => setTimeout(res, 800));

    // Dismiss the original push notification
    try {
        await Notifications.dismissNotificationAsync(notification.request.identifier);
    } catch (_) {}

    // Post the sticky replacement — stays in shade until user taps View or Dismiss
    try {
        const channelId = 'quotation-alerts';
        await Notifications.scheduleNotificationAsync({
            content: {
                title: content.title ?? 'Quotation Awaiting Your Approval',
                body: content.body ?? '',
                data: content.data ?? {},
                sound: true,
                priority: Notifications.AndroidNotificationPriority.MAX,
                color: '#7367F0',
                autoDismiss: false,
                sticky: true,
                categoryIdentifier: 'quotation_actions',
            },
            trigger: Platform.OS === 'android' ? { channelId } : null,
        });
        console.log('[BGNotif] Sticky notification posted');
    } catch (e) {
        console.error('[BGNotif] Failed to post sticky notification:', e);
    }
});

export async function registerBackgroundNotificationTask() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK);
        if (!isRegistered) {
            await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
            console.log('[BGNotif] Background task registered');
        }
    } catch (e) {
        console.log('[BGNotif] Could not register background task:', e);
    }
}
