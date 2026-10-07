import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native';

export const notifeeService = {
    async setupChannels() {
        try {
            // Create quotation alerts channel
            await notifee.createChannel({
                id: 'quotation-alerts',
                name: 'Quotation Alerts',
                importance: AndroidImportance.MAX,
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
        try {
            // Request permission if needed (permission request UI)
            const permission = await notifee.requestPermission();

            if (permission.granted) {
                const notificationId = await notifee.displayNotification({
                    title,
                    body,
                    data,
                    android: {
                        channelId: 'quotation-alerts',
                        importance: AndroidImportance.MAX,
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
                            type: AndroidStyle.BIGTEXT,
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
        try {
            await notifee.cancelNotification(notificationId);
            console.log('[NotifeeService] Notification dismissed:', notificationId);
        } catch (error) {
            console.error('[NotifeeService] Failed to dismiss notification:', error);
        }
    },

    async setupNotificationHandlers(onViewPress: (quotationId: string) => void) {
        notifee.onForegroundEvent(({ type, detail }) => {
            console.log('[NotifeeService] Foreground event:', type, detail);
            if (detail.pressAction?.id === 'view') {
                const quotationId = detail.notification?.data?.id;
                if (quotationId) {
                    onViewPress(quotationId);
                }
            } else if (detail.pressAction?.id === 'dismiss') {
                if (detail.notification?.notificationId) {
                    this.dismissNotification(detail.notification.notificationId);
                }
            }
        });

        notifee.onBackgroundEvent(async ({ type, detail }) => {
            console.log('[NotifeeService] Background event:', type, detail);
            if (detail.pressAction?.id === 'view') {
                const quotationId = detail.notification?.data?.id;
                if (quotationId) {
                    // App will launch and handle navigation
                    console.log('[NotifeeService] View pressed from background, quotation id:', quotationId);
                }
            } else if (detail.pressAction?.id === 'dismiss') {
                if (detail.notification?.notificationId) {
                    await notifee.cancelNotification(detail.notification.notificationId);
                }
            }
        });
    },
};
