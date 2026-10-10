import { useEffect, useRef } from 'react';
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
 * app needing to be open. Notification persistence is handled by
 * NotificationsContext which stores them to disk.
 */
async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    if (!Device.isDevice) {
        console.log('[usePushNotifications] Not a physical device, skipping');
        return undefined;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        console.log('[usePushNotifications] Requesting notification permissions...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        console.log('[usePushNotifications] Notification permission denied');
        return undefined;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
        console.log('[usePushNotifications] No EAS project ID found in app.json');
        return undefined;
    }

    try {
        console.log('[usePushNotifications] Getting Expo push token...');
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log('[usePushNotifications] ✅ Got token:', tokenResponse.data.substring(0, 20) + '...');
        return tokenResponse.data;
    } catch (error) {
        console.error('[usePushNotifications] Failed to get Expo push token:', error);
        return undefined;
    }
}

async function registerTokenWithServer(token: string): Promise<boolean> {
    try {
        const sessionCookies = await SecureStore.getItemAsync('session_cookies');
        if (!sessionCookies) {
            console.log('[usePushNotifications] No session cookies, skipping token registration');
            return false;
        }
        console.log('[usePushNotifications] Registering token:', token.substring(0, 20) + '...');
        const res = await apiPost(apiUrl('/api/method/register_push_token'), { token }, sessionCookies);
        if (res.ok) {
            console.log('[usePushNotifications] ✅ Token registered successfully');
            return true;
        } else {
            console.error('[usePushNotifications] Token registration failed:', res.data);
            return false;
        }
    } catch (error) {
        console.error('[usePushNotifications] Failed to register push token with server:', error);
        return false;
    }
}

/**
 * Registers this device's push token for whichever user is logged in right now.
 * Call it right after a successful login: the hook below only registers at app
 * start / on foreground, so without this a user who logs in (or switches user)
 * keeps a stale token on the server and never receives pushes until the app is
 * restarted.
 */
export async function registerPushTokenForCurrentUser(): Promise<boolean> {
    const token = await registerForPushNotificationsAsync();
    if (!token) return false;
    return registerTokenWithServer(token);
}

export const usePushNotifications = () => {
    const router = useRouter();
    const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

    useEffect(() => {
        notificationService.setupChannels();

        let cancelled = false;
        let registeredWithServer = false;

        const registerAndSend = () => {
            registerForPushNotificationsAsync().then(token => {
                if (cancelled || !token) return;
                registerTokenWithServer(token).then(sent => {
                    if (sent) registeredWithServer = true;
                });
            });
        };

        registerAndSend();

        // Poll briefly after mount until the token is saved server-side,
        // covering the gap where the user logs in during the same cold start.
        // Capped at 2 minutes; the AppState listener catches later foregrounds.
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

        const appStateSub = AppState.addEventListener('change', state => {
            if (state === 'active') registerAndSend();
        });

        // Tapping a notification navigates to the quotation. The same response can
        // arrive from both the listener and the cold-start lookup, so open it once.
        let handledResponseId: string | null = null;
        const openFromResponse = (response: Notifications.NotificationResponse | null) => {
            if (!response) return;
            const key = response.notification.request.identifier;
            if (key === handledResponseId) return;
            const data = response.notification.request.content.data;
            if (data && data.id) {
                handledResponseId = key;
                router.push({ pathname: '/quotations/[id]', params: { id: data.id as string } });
            }
        };
        responseListener.current = Notifications.addNotificationResponseReceivedListener(openFromResponse);

        // App was closed and launched by tapping a push: the listener above misses it.
        Notifications.getLastNotificationResponseAsync()
            .then(response => { setTimeout(() => { if (!cancelled) openFromResponse(response); }, 800); })
            .catch(() => { });

        return () => {
            cancelled = true;
            clearInterval(retryInterval);
            appStateSub.remove();
            responseListener.current?.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
};
