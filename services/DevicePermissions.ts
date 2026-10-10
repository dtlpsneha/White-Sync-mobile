import { Alert, AppState, Platform } from 'react-native';
import { FloatingNotifications } from '../modules/floating-notifications';

const askUser = (title: string, message: string) =>
    new Promise<boolean>(resolve => {
        Alert.alert(title, message, [
            { text: 'Later', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Allow', onPress: () => resolve(true) },
        ], { cancelable: false });
    });

// Resolves once the user comes back from the system settings screen.
const waitForReturn = () =>
    new Promise<void>(resolve => {
        const sub = AppState.addEventListener('change', state => {
            if (state === 'active') {
                sub.remove();
                setTimeout(resolve, 300);
            }
        });
    });

/**
 * Android never lets an app grant these silently, so this walks the user
 * through them once after login: "display over other apps" (floating alert
 * card) and unrestricted battery (so pushes arrive while the app is closed).
 * Notification permission itself is requested by the push registration.
 * Already-granted permissions are skipped, so it is a no-op on later logins.
 */
export async function ensureDevicePermissions(): Promise<void> {
    if (Platform.OS !== 'android' || !FloatingNotifications.isAvailable()) return;
    try {
        if (!FloatingNotifications.isOverlayPermissionGranted()) {
            const ok = await askUser(
                'Show alerts over other apps',
                'White Sync shows a quick pop-up card when a quotation needs your approval. On the next screen, turn on "Allow display over other apps" for White Sync.'
            );
            if (ok) {
                FloatingNotifications.openOverlayPermissionSettings();
                await waitForReturn();
            }
        }
        if (!FloatingNotifications.isBatteryOptimizationIgnored()) {
            const ok = await askUser(
                'Keep notifications working',
                'To receive quotation alerts when the app is closed, open Battery on the next screen and choose "Unrestricted".'
            );
            if (ok) {
                FloatingNotifications.requestIgnoreBatteryOptimizations();
                await waitForReturn();
            }
        }
    } catch (e) {
        console.warn('[DevicePermissions] failed:', e);
    }
}
