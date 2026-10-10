import { Platform } from 'react-native';

export type KnownApp = { packageName: string; appName: string; blocked: boolean };

interface FloatingNotificationsNativeModule {
    isNotificationAccessGranted(): boolean;
    openNotificationAccessSettings(): void;
    isOverlayPermissionGranted(): boolean;
    openOverlayPermissionSettings(): void;
    isBatteryOptimizationIgnored(): boolean;
    requestIgnoreBatteryOptimizations(): void;
    isListenerServiceConnected(): boolean;
    showOverlay(title: string, text: string, quotationId?: string | null): void;
    isFloatingNotificationsEnabled(): boolean;
    setFloatingNotificationsEnabled(enabled: boolean): void;
    getBlockedPackages(): string[];
    setBlockedPackages(packages: string[]): void;
    getKnownApps(): KnownApp[];
}

// Android-only native module; absent in Expo Go and on iOS/web, where every
// method below safely no-ops instead of throwing.
let native: FloatingNotificationsNativeModule | null | undefined;

function getNative(): FloatingNotificationsNativeModule | null {
    if (native !== undefined) return native;
    if (Platform.OS !== 'android') {
        native = null;
        return native;
    }
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { requireNativeModule } = require('expo-modules-core');
        native = requireNativeModule('FloatingNotifications');
    } catch (e) {
        console.warn('[FloatingNotifications] Native module unavailable (Expo Go or no dev build yet).');
        native = null;
    }
    return native;
}

export const FloatingNotifications = {
    isNotificationAccessGranted(): boolean {
        return getNative()?.isNotificationAccessGranted() ?? false;
    },
    openNotificationAccessSettings(): void {
        getNative()?.openNotificationAccessSettings();
    },
    isOverlayPermissionGranted(): boolean {
        return getNative()?.isOverlayPermissionGranted() ?? false;
    },
    openOverlayPermissionSettings(): void {
        getNative()?.openOverlayPermissionSettings();
    },
    isBatteryOptimizationIgnored(): boolean {
        return getNative()?.isBatteryOptimizationIgnored() ?? true;
    },
    requestIgnoreBatteryOptimizations(): void {
        getNative()?.requestIgnoreBatteryOptimizations();
    },
    isListenerServiceConnected(): boolean {
        return getNative()?.isListenerServiceConnected() ?? false;
    },
    showOverlay(title: string, text: string, quotationId?: string | null): void {
        getNative()?.showOverlay(title, text, quotationId ?? null);
    },
    isFloatingNotificationsEnabled(): boolean {
        return getNative()?.isFloatingNotificationsEnabled() ?? false;
    },
    setFloatingNotificationsEnabled(enabled: boolean): void {
        getNative()?.setFloatingNotificationsEnabled(enabled);
    },
    getBlockedPackages(): string[] {
        return getNative()?.getBlockedPackages() ?? [];
    },
    setBlockedPackages(packages: string[]): void {
        getNative()?.setBlockedPackages(packages);
    },
    getKnownApps(): KnownApp[] {
        return getNative()?.getKnownApps() ?? [];
    },
    isAvailable(): boolean {
        return getNative() !== null;
    },
};
