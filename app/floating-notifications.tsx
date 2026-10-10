import React, { useCallback, useEffect, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { FloatingNotifications, KnownApp } from '@/modules/floating-notifications';

export default function FloatingNotificationsScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const colors = Colors[theme];

    const [notificationAccessGranted, setNotificationAccessGranted] = useState(false);
    const [overlayGranted, setOverlayGranted] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [knownApps, setKnownApps] = useState<KnownApp[]>([]);

    const refreshStatus = useCallback(() => {
        setNotificationAccessGranted(FloatingNotifications.isNotificationAccessGranted());
        setOverlayGranted(FloatingNotifications.isOverlayPermissionGranted());
        setEnabled(FloatingNotifications.isFloatingNotificationsEnabled());
        setKnownApps(FloatingNotifications.getKnownApps());
    }, []);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    // Permissions are granted from outside the app (system Settings), so the
    // only reliable moment to re-check them is when the app comes back to
    // the foreground.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') refreshStatus();
        });
        return () => sub.remove();
    }, [refreshStatus]);

    useFocusEffect(
        useCallback(() => {
            refreshStatus();
        }, [refreshStatus])
    );

    const permissionsReady = notificationAccessGranted && overlayGranted;

    const handleToggleEnabled = (value: boolean) => {
        if (value && !permissionsReady) return;
        FloatingNotifications.setFloatingNotificationsEnabled(value);
        setEnabled(value);
    };

    const handleToggleApp = (app: KnownApp) => {
        const blocked = FloatingNotifications.getBlockedPackages();
        const next = app.blocked
            ? blocked.filter((p) => p !== app.packageName)
            : [...blocked, app.packageName];
        FloatingNotifications.setBlockedPackages(next);
        setKnownApps((apps) =>
            apps.map((a) => (a.packageName === app.packageName ? { ...a, blocked: !a.blocked } : a))
        );
    };

    if (!FloatingNotifications.isAvailable()) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Stack.Screen options={{ headerShown: false }} />
                <ScreenHeader title="Floating Notifications" onBack={() => router.back()} />
                <View style={styles.unavailableBox}>
                    <Text style={[styles.unavailableText, { color: colors.textSecondary }]}>
                        This feature requires a development or production build — it isn&apos;t available in Expo Go.
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader title="Floating Notifications" onBack={() => router.back()} />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Text style={[styles.sectionTitle, { color: colors.primary }]}>Permissions</Text>

                <PermissionRow
                    icon="notifications-outline"
                    label="Notification Access"
                    description="Lets White Sync read notifications posted by other apps."
                    granted={notificationAccessGranted}
                    onPress={() => FloatingNotifications.openNotificationAccessSettings()}
                    colors={colors}
                    theme={theme}
                />

                <PermissionRow
                    icon="layers-outline"
                    label="Display Over Other Apps"
                    description="Lets White Sync show the floating popup on top of other apps."
                    granted={overlayGranted}
                    onPress={() => FloatingNotifications.openOverlayPermissionSettings()}
                    colors={colors}
                    theme={theme}
                />

                <View style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 16 }, Shadow.card(theme)]}>
                    <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                        <Ionicons name="flash-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Enable Floating Notifications</Text>
                        {!permissionsReady && (
                            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                                Grant both permissions above to enable this.
                            </Text>
                        )}
                    </View>
                    <Switch
                        value={enabled && permissionsReady}
                        disabled={!permissionsReady}
                        onValueChange={handleToggleEnabled}
                        trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                    />
                </View>

                <Text style={[styles.sectionTitle, { color: colors.primary, marginTop: 24 }]}>
                    Apps ({knownApps.length})
                </Text>
                {knownApps.length === 0 ? (
                    <Text style={[styles.hintText, { color: colors.textSecondary, marginLeft: 8 }]}>
                        Apps will show up here once they post a notification White Sync has seen.
                    </Text>
                ) : (
                    knownApps.map((app) => (
                        <View
                            key={app.packageName}
                            style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.card(theme)]}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.settingLabel, { color: colors.text }]}>{app.appName}</Text>
                                <Text style={[styles.hintText, { color: colors.textSecondary }]}>{app.packageName}</Text>
                            </View>
                            <Switch
                                value={!app.blocked}
                                onValueChange={() => handleToggleApp(app)}
                                trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                            />
                        </View>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

function PermissionRow({
    icon,
    label,
    description,
    granted,
    onPress,
    colors,
    theme,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    description: string;
    granted: boolean;
    onPress: () => void;
    colors: typeof Colors['light'];
    theme: 'light' | 'dark';
}) {
    return (
        <View style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.card(theme)]}>
            <View style={[styles.iconBox, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={icon} size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
                <Text style={[styles.hintText, { color: colors.textSecondary }]}>{description}</Text>
            </View>
            {granted ? (
                <View style={styles.grantedBadge}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </View>
            ) : (
                <TouchableOpacity style={[styles.grantButton, { backgroundColor: colors.primary }]} onPress={onPress}>
                    <Text style={styles.grantButtonText}>Grant</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 30, gap: 10 },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: Radius.lg,
        borderWidth: 1,
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: Radius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingLabel: { fontSize: 15, fontWeight: '700' },
    hintText: { fontSize: 12, marginTop: 2 },
    grantButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md },
    grantButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
    grantedBadge: { paddingHorizontal: 4 },
    unavailableBox: { padding: 24 },
    unavailableText: { fontSize: 14, textAlign: 'center' },
});
