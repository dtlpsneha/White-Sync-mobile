import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { FloatingNotifications } from '@/modules/floating-notifications';

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

function safeStringify(value: unknown) {
    try {
        return JSON.stringify(value, (_key, v) => (typeof v === 'function' ? '[fn]' : v));
    } catch (e) {
        return `[unstringifiable: ${String(e)}]`;
    }
}

// Must be defined at module scope (outside any component/function).
// Runs when a notification arrives while the app is backgrounded or killed.
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }: any) => {
    // The raw shape of `data` on Android background delivery isn't guaranteed to
    // match the `Notification` TS type (expo-notifications types it as
    // `Record<string, unknown> | null`), so dump it on any failure instead of
    // guessing which field access blew up.
    try {
        if (error) {
            console.error('[BGNotif] Task error:', error);
            return;
        }

        console.log('[BGNotif] Raw task data:', safeStringify(data));

        // Server now sends a data-only FCM message (no top-level title/body) so
        // Android doesn't auto-display it and skip this task. For a data-only
        // message, `data.notification` is null and expo-notifications' native
        // RemoteMessageSerializer puts the raw FCM "data" map (title/message
        // keys, plus our custom payload JSON-encoded under "body") at `data.data`.
        // See services/NotifeeService's counterpart in NotificationPopup.tsx,
        // which instead goes through expo-notifications' own content mapping and
        // doesn't need this fallback.
        const notification = data?.notification as Notifications.Notification | undefined;
        const rawData = data?.data as Record<string, any> | undefined;

        let title: string | undefined;
        let body: string | undefined;
        let customData: Record<string, any> = {};

        if (notification) {
            const content = notification.request?.content ?? (notification as any);
            title = content?.title;
            body = content?.body;
            customData = content?.data ?? {};
        } else if (rawData) {
            let payload: Record<string, any> = {};
            try {
                payload = JSON.parse(rawData.body ?? rawData.dataString ?? '{}');
            } catch (e) {
                payload = {};
            }
            title = payload.title ?? rawData.title;
            body = payload.message ?? rawData.message;
            customData = { id: payload.id ?? rawData.id };
        }

        if (!title && !body) return;
        const quotationId = customData?.id;

        console.log('[BGNotif] Quotation notification in background, id:', quotationId);

        const mod = getNotifee();
        if (!mod) {
            console.warn('[BGNotif] Notifee unavailable (Expo Go or no dev build yet) — skipping persistent display');
            return;
        }

        try {
            // Display persistent notification using Notifee (survives until dismissed)
            await mod.default.displayNotification({
                title: title ?? 'Quotation Awaiting Your Approval',
                body: body ?? '',
                data: customData,
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

        try {
            // The Notifee call above only puts an entry in the notification tray —
            // this is what actually pops the Truecaller-style floating card.
            console.log('[BGNotif] FloatingNotifications.isAvailable():', FloatingNotifications.isAvailable());
            FloatingNotifications.showOverlay(
                title ?? 'Quotation Awaiting Your Approval',
                body ?? '',
                quotationId ?? null
            );
            console.log('[BGNotif] showOverlay call completed');
        } catch (e) {
            console.error('[BGNotif] Failed to show floating overlay:', e);
        }
    } catch (e: any) {
        console.error('[BGNotif] Task threw:', e?.message, e?.stack, 'raw data was:', safeStringify(data));
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
