import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { notificationService } from '../services/NotificationService';
import { apiPost } from '../utils/api';
import { apiUrl } from '../constants/config';

/**
 * Registers this device's Expo push token against the logged-in ERPNext
 * user (`register_push_token`), so the server can push a notification to
 * them directly — e.g. when a Quotation is assigned to them — without the
 * app needing to be open. Runs once per app load, then again whenever the
 * app returns to the foreground while logged in, since a token can rotate
 * and there's otherwise no other point where a freshly-logged-in session
 * would pick one up.
 */
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (!Device.isDevice) {
        // Push tokens aren't meaningful on a simulator/emulator.
        return undefined;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        return undefined;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
        return undefined;
    }

    try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        return tokenResponse.data;
    } catch (error) {
        console.error('[usePushNotifications] Failed to get Expo push token:', error);
        return undefined;
    }
}

async function registerTokenWithServer(token: string) {
    try {
        const sessionCookies = await SecureStore.getItemAsync('session_cookies');
        // Not logged in yet — nothing to attach the token to. The next
        // foreground/login will retry this.
        if (!sessionCookies) return;

        await apiPost(apiUrl('/api/method/register_push_token'), { token }, sessionCookies);
    } catch (error) {
        console.error('[usePushNotifications] Failed to register push token with server:', error);
    }
}

export const usePushNotifications = () => {
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
    const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
    const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
    const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

    const router = useRouter();

    useEffect(() => {
        notificationService.setupChannels();

        const registerAndSend = () => {
            registerForPushNotificationsAsync().then(token => {
                if (token) {
                    setExpoPushToken(token);
                    registerTokenWithServer(token);
                }
            });
        };

        registerAndSend();

        // A session can start (login) or a token can rotate after the app
        // was already running, so re-registering on every foreground catches
        // both without needing a dedicated "just logged in" hook elsewhere.
        const appStateSub = AppState.addEventListener('change', state => {
            if (state === 'active') registerAndSend();
        });

        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            setNotification(notification);
        });

        const openQuotationFromResponse = (response: Notifications.NotificationResponse | null) => {
            const data = response?.notification.request.content.data;
            if (data && data.id) {
                router.push({ pathname: '/quotations/[id]', params: { id: data.id as string } });
            }
        };

        // Catches the tap that COLD-STARTS the app (from killed/background)
        // — the app wasn't running yet when that tap happened, so the live
        // listener below never sees it. Without this, a cold-start tap just
        // opens the app to whatever its default launch route is.
        Notifications.getLastNotificationResponseAsync().then(openQuotationFromResponse);

        // Catches taps while the app is already running (foreground or
        // backgrounded-but-alive).
        responseListener.current = Notifications.addNotificationResponseReceivedListener(openQuotationFromResponse);

        return () => {
            appStateSub.remove();
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { expoPushToken, notification };
};
