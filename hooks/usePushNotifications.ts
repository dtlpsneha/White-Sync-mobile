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

async function registerTokenWithServer(token: string): Promise<boolean> {
    try {
        const sessionCookies = await SecureStore.getItemAsync('session_cookies');
        // Not logged in yet — nothing to attach the token to. The retry
        // loop / next foreground will try again.
        if (!sessionCookies) return false;

        const res = await apiPost(apiUrl('/api/method/register_push_token'), { token }, sessionCookies);
        return res.ok;
    } catch (error) {
        console.error('[usePushNotifications] Failed to register push token with server:', error);
        return false;
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

        let cancelled = false;
        let registeredWithServer = false;

        const registerAndSend = () => {
            registerForPushNotificationsAsync().then(token => {
                if (cancelled || !token) return;
                setExpoPushToken(token);
                registerTokenWithServer(token).then(sent => {
                    if (sent) registeredWithServer = true;
                });
            });
        };

        registerAndSend();

        // The app is already "active" on cold start — AppState only fires on
        // a TRANSITION into active, so logging in during that same first
        // launch (the common case: open app -> log in -> Home) never
        // triggers a foreground event to retry the registration that
        // no-opped earlier for having no session yet. Poll briefly after
        // mount until the token is actually saved server-side, covering
        // exactly that gap without needing the login screen to know about
        // this hook. Capped at 2 minutes so it doesn't poll forever if the
        // user just sits on the login screen — the AppState listener below
        // still catches login whenever the app is next foregrounded.
        let retryCount = 0;
        const MAX_RETRIES = 24;
        const retryInterval = setInterval(() => {
            retryCount += 1;
            if (registeredWithServer || retryCount >= MAX_RETRIES) {
                clearInterval(retryInterval);
                return;
            }
            registerAndSend();
        }, 5000);

        // A session can also start (login) or a token can rotate after the
        // app was already running and gets backgrounded/foregrounded, so
        // re-registering on every foreground catches that case too.
        const appStateSub = AppState.addEventListener('change', state => {
            if (state === 'active') registerAndSend();
        });

        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            if (data && data.id) {
                router.push({ pathname: '/quotations/[id]', params: { id: data.id as string } });
            }
        });

        return () => {
            cancelled = true;
            clearInterval(retryInterval);
            appStateSub.remove();
            notificationListener.current?.remove();
            responseListener.current?.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { expoPushToken, notification };
};
