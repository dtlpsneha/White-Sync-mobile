import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_NOTIFICATION_TASK = 'QUOTATION_BACKGROUND_NOTIFICATION';

// Notifee's default export constructs its native-module singleton at
// import time, which throws when no native module is present (Expo Go,
// or before a dev-client/EAS build exists). Load it lazily so this task
// still registers and no-ops gracefully there instead of crashing.
let notifeeModule: typeof import('@notifee/react-native') | null | undefined;

function getNotifee() {
    if (notifeeModule !== undefined) return notifeeModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        notifeeModule = require('@notifee/react-native');
    } catch (e) {
        notifeeModule = null;
    }
    return notifeeModule;
}

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

    const mod = getNotifee();
    if (!mod) {
        console.warn('[BGNotif] Notifee unavailable (Expo Go or no dev build yet) — skipping persistent display');
        return;
    }

    try {
        // Display persistent notification using Notifee (survives until dismissed)
        await mod.default.displayNotification({
            title: content.title ?? 'Quotation Awaiting Your Approval',
            body: content.body ?? '',
            data: content.data ?? {},
            android: {
                channelId: 'quotation-alerts',
                importance: mod.AndroidImportance.MAX,
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
