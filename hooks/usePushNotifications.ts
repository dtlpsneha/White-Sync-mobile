import { useEffect } from 'react';
// import * as Notifications from 'expo-notifications';
// import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { notificationService } from '../services/NotificationService';

export const usePushNotifications = () => {
    /*
    const [expoPushToken, setExpoPushToken] = useState<string | undefined>(undefined);
    const [notification, setNotification] = useState<Notifications.Notification | undefined>(undefined);
    const notificationListener = useRef<Notifications.Subscription>(undefined);
    const responseListener = useRef<Notifications.Subscription>(undefined);
    */

    const router = useRouter();

    useEffect(() => {
        // registerForPushNotificationsAsync().then(token => setExpoPushToken(token));
        notificationService.setupChannels();

        /*
        notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
            setNotification(notification);
        });

        responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('Notification Response Received:', response);
            const data = response.notification.request.content.data;
            if (data && data.id) {
                console.log('Navigating to quotation:', data.id);
                router.push({ pathname: '/quotations/[id]', params: { id: data.id } });
            }
        });
        */

        return () => {
            /*
            if (notificationListener.current) {
                Notifications.removeNotificationSubscription(notificationListener.current);
            }
            if (responseListener.current) {
                Notifications.removeNotificationSubscription(responseListener.current);
            }
            */
        };
    }, []);

    return { expoPushToken: undefined, notification: undefined };
};

/*
async function registerForPushNotificationsAsync() {
    // ... logic commented out
}
*/
