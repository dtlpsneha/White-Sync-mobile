import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import notifee from '@notifee/react-native';

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

    console.log('[BGNotif] Quotation notification in background, id:', quotationId);

    try {
        // Display persistent notification using Notifee (survives until dismissed)
        await notifee.displayNotification({
            title: content.title ?? 'Quotation Awaiting Your Approval',
            body: content.body ?? '',
            data: content.data ?? {},
            android: {
                channelId: 'quotation-alerts',
                importance: notifee.AndroidImportance.MAX,
                pressAction: {
                    id: 'default',
                },
                actions: [
                    {
                        title: 'View',
                        pressAction: {
                            id: 'view',
                            launchActivity: 'default',
                        },
                    },
                    {
                        title: 'Dismiss',
                        pressAction: {
                            id: 'dismiss',
                        },
                        destructive: true,
                    },
                ],
                fullScreenAction: {
                    id: 'default',
                },
            },
        });
        console.log('[BGNotif] Persistent notification displayed via Notifee');
    } catch (e) {
        console.error('[BGNotif] Failed to display notification:', e);
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
