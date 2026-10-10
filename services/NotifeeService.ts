// Notifee's default export constructs its native-module singleton at
// import time, which throws immediately when no native module is present
// (e.g. running in Expo Go, or before a dev-client/EAS build exists).
// Loading it lazily behind try/catch lets the rest of the app keep working
// there instead of crashing the whole tree — persistent notifications are
// simply unavailable until a real dev-client/standalone build is installed.
let notifeeModule: typeof import('@notifee/react-native') | null | undefined;
let initialNotificationHandled = false;

function getNotifee() {
    if (notifeeModule !== undefined) return notifeeModule;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        notifeeModule = require('@notifee/react-native');
    } catch (e) {
        console.warn('[NotifeeService] Notifee native module unavailable (Expo Go or no dev build yet). Persistent notifications disabled.');
        notifeeModule = null;
    }
    return notifeeModule;
}

export const notifeeService = {
    async requestPermission() {
        const mod = getNotifee();
        if (!mod) return false;
        try {
            const permission = await mod.default.requestPermission();
            console.log('[NotifeeService] Permission result:', permission);
            return permission.granted;
        } catch (error) {
            console.error('[NotifeeService] Failed to request permission:', error);
            return false;
        }
    },

    async setupChannels() {
        const mod = getNotifee();
        if (!mod) return;
        try {
            await mod.default.createChannel({
                id: 'quotation-alerts',
                name: 'Quotation Alerts',
                importance: mod.AndroidImportance.MAX,
                sound: 'default',
                vibration: true,
                lights: true,
                lightColor: '#7367F0',
            });
            console.log('[NotifeeService] Channels setup complete');
        } catch (e) {
            console.error('[NotifeeService] Failed to setup channels:', e);
        }
    },

    async displayPersistentNotification(
        title: string,
        body: string,
        data: Record<string, any> = {},
        quotationId?: string
    ) {
        const mod = getNotifee();
        if (!mod) return;
        try {
            const permission = await mod.default.requestPermission();

            if (permission.granted) {
                const notificationId = await mod.default.displayNotification({
                    title,
                    body,
                    data,
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
                        style: {
                            type: mod.AndroidStyle.BIGTEXT,
                            text: body,
                        },
                        fullScreenAction: {
                            id: 'default',
                        },
                    },
                });
                console.log('[NotifeeService] Persistent notification displayed, id:', notificationId);
                return notificationId;
            } else {
                console.log('[NotifeeService] Notification permission not granted');
            }
        } catch (error) {
            console.error('[NotifeeService] Failed to display notification:', error);
        }
    },

    async dismissNotification(notificationId: string) {
        const mod = getNotifee();
        if (!mod) return;
        try {
            await mod.default.cancelNotification(notificationId);
            console.log('[NotifeeService] Notification dismissed:', notificationId);
        } catch (error) {
            console.error('[NotifeeService] Failed to dismiss notification:', error);
        }
    },

    async getInitialQuotationId(): Promise<string | undefined> {
        const mod = getNotifee();
        if (!mod || initialNotificationHandled) return undefined;
        initialNotificationHandled = true;
        try {
            const initial = await mod.default.getInitialNotification();
            return initial?.notification?.data?.id as string | undefined;
        } catch (e) {
            console.error('[NotifeeService] getInitialNotification failed:', e);
            return undefined;
        }
    },

    async setupNotificationHandlers(onViewPress: (quotationId: string) => void) {
        const mod = getNotifee();
        if (!mod) return;

        mod.default.onForegroundEvent(({ type, detail }) => {
            console.log('[NotifeeService] Foreground event:', type, detail);
            const isPress = type === mod.EventType.PRESS || (type === mod.EventType.ACTION_PRESS && detail.pressAction?.id === 'view');
            if (isPress) {
                const quotationId = detail.notification?.data?.id as string | undefined;
                if (quotationId) {
                    onViewPress(quotationId);
                }
            } else if (detail.pressAction?.id === 'dismiss') {
                if (detail.notification?.notificationId) {
                    this.dismissNotification(detail.notification.notificationId);
                }
            }
        });

        mod.default.onBackgroundEvent(async ({ type, detail }) => {
            console.log('[NotifeeService] Background event:', type, detail);
            if (detail.pressAction?.id === 'view') {
                const quotationId = detail.notification?.data?.id;
                if (quotationId) {
                    console.log('[NotifeeService] View pressed from background, quotation id:', quotationId);
                }
            } else if (detail.pressAction?.id === 'dismiss') {
                if (detail.notification?.notificationId) {
                    await mod!.default.cancelNotification(detail.notification.notificationId);
                }
            }
        });
    },
};
