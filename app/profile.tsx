import React, { useCallback, useState, useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { Colors, Radius } from '@/constants/theme';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { BandChips, SectionCard } from '@/components/ui/Midnight';
import Animated from 'react-native-reanimated';
import { enterSection } from '@/constants/motion';

/** The real version from app.json, e.g. "1.0.1 (build 3)". */
function appVersion(): string {
    const cfg: any = Constants.expoConfig ?? {};
    const build = Platform.OS === 'android' ? cfg.android?.versionCode : cfg.ios?.buildNumber;
    return `${cfg.version ?? '—'}${build ? ` (build ${build})` : ''}`;
}

export default function ProfileScreen() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const colors = Colors[theme];
    const isDark = theme === 'dark';
    const insets = useSafeAreaInsets();

    // User State
    const [userName, setUserName] = useState('User');
    const [userId, setUserId] = useState('');
    const [isManager, setIsManager] = useState(false);
    const [showAllQuotes, setShowAllQuotes] = useState(false);

    useEffect(() => {
        loadUserData();
    }, []);

    // Reached via router.replace (see SideNav), so nothing sits beneath it
    // on the navigation stack — without this, Android's hardware/gesture
    // back button exits the app instead of going to Home like the
    // on-screen back arrow does.
    useFocusEffect(
        useCallback(() => {
            const onBackPress = () => {
                router.replace('/home');
                return true;
            };
            const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
            return () => subscription.remove();
        }, [router])
    );

    const loadUserData = async () => {
        try {
            const name = await SecureStore.getItemAsync('user_name');
            if (name) setUserName(name);

            const id = await SecureStore.getItemAsync('user_id');
            if (id) setUserId(id);

            const manager = await SecureStore.getItemAsync('is_manager');
            setIsManager(manager === 'true');

            const showQuotes = await SecureStore.getItemAsync('show_all_quotes');
            setShowAllQuotes(showQuotes === 'true');
        } catch (error) {
            console.error('[Profile] Error loading user data:', error);
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await SecureStore.deleteItemAsync('session_cookies');
                    await SecureStore.deleteItemAsync('user_name');
                    await SecureStore.deleteItemAsync('is_manager');
                    await SecureStore.deleteItemAsync('show_all_quotes');
                    await SecureStore.deleteItemAsync('user_id');
                    await SecureStore.deleteItemAsync('last_seen_pending_ids');
                    router.replace('/');
                }
            }
        ]);
    };

    const handleClearCache = async () => {
        Alert.alert(
            'Sync & Reset',
            'This will clear local cache and re-initialize pending quotes. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        await SecureStore.deleteItemAsync('last_seen_pending_ids');
                        Alert.alert('Success', 'Cache cleared successfully. Pending quotes will be synced.');
                    }
                }
            ]
        );
    };

    const firstLetter = userName ? userName.charAt(0).toUpperCase() : 'U';
    const role = isManager ? 'Sales Manager' : 'Sales Executive';
    const scope = showAllQuotes ? 'All quotes' : 'Own quotes only';

    const infoRows: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }[] = [
        { icon: 'mail-outline', label: 'Email / User ID', value: userId || '—' },
        { icon: 'shield-checkmark-outline', label: 'Access level', value: isManager ? 'Manager' : 'Executive' },
        { icon: 'eye-outline', label: 'Scope', value: scope },
    ];

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader title="Profile" subtitle="Your account and app settings" align="left" onBack={() => router.replace('/home')}>
                {/* Who is signed in, on the charcoal band. */}
                <View style={styles.identity}>
                    <View style={styles.avatar}>
                        <Text style={[styles.avatarText, { color: colors.ink }]}>{firstLetter}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.userName} numberOfLines={1} maxFontSizeMultiplier={1.25}>{userName}</Text>
                        <Text style={[styles.userRole, { color: colors.onInkMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.25}>{role}</Text>
                        <View style={styles.sessionPill}>
                            <View style={[styles.onlineDot, { backgroundColor: colors.mint }]} />
                            <Text style={[styles.sessionText, { color: colors.onInk }]}>Active session</Text>
                        </View>
                    </View>
                </View>
                <BandChips items={[isManager ? 'Manager' : 'Executive', scope]} />
            </ScreenHeader>

            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
                showsVerticalScrollIndicator={false}
            >
                <Animated.View entering={enterSection(0)}>
                    <SectionCard icon="person" title="Account" subtitle="Signed in to ERPNext">
                        <View>
                            {infoRows.map((row, i) => (
                                <View key={row.label} style={[styles.infoRow, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                                    <View style={styles.infoLabelContainer}>
                                        <Ionicons name={row.icon} size={16} color={colors.textSecondary} />
                                        <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                                    </View>
                                    <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                                        {row.value}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </SectionCard>
                </Animated.View>

                <Animated.View entering={enterSection(1)}>
                    <SectionCard icon="settings" title="App preferences">
                        <View>
                            <View style={styles.settingItem}>
                                <View style={[styles.iconBox, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name={isDark ? 'moon' : 'moon-outline'} size={18} color={colors.text} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingLabel, { color: colors.text }]}>Dark mode</Text>
                                    <Text style={[styles.settingSub, { color: colors.textSecondary }]}>{isDark ? 'On' : 'Off'}</Text>
                                </View>
                                <Switch
                                    value={isDark}
                                    onValueChange={toggleTheme}
                                    trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                                    thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.settingItem, { borderTopWidth: 1, borderTopColor: colors.border }]}
                                onPress={handleClearCache}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.iconBox, { backgroundColor: colors.success + '1A' }]}>
                                    <Ionicons name="sync-outline" size={18} color={colors.success} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.settingLabel, { color: colors.text }]}>Sync & clear cache</Text>
                                    <Text style={[styles.settingSub, { color: colors.textSecondary }]}>Re-checks pending quotes</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                    </SectionCard>
                </Animated.View>

                <Animated.View entering={enterSection(2)}>
                    <TouchableOpacity
                        style={[styles.logout, { borderColor: colors.danger, backgroundColor: colors.surface }]}
                        onPress={handleLogout}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                        <Text style={[styles.logoutText, { color: colors.danger }]}>Sign Out</Text>
                    </TouchableOpacity>
                </Animated.View>

                <Animated.View entering={enterSection(3)} style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>White Sync</Text>
                    <Text style={[styles.versionText, { color: colors.textSecondary }]}>Version {appVersion()}</Text>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 16, gap: 14 },

    identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    avatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 26, fontWeight: '900' },
    userName: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
    userRole: { fontSize: 13, fontWeight: '600', marginTop: 2 },
    sessionPill: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        marginTop: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: Radius.pill,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    onlineDot: { width: 7, height: 7, borderRadius: 4 },
    sessionText: { fontSize: 11.5, fontWeight: '700' },

    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 12 },
    infoLabelContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    infoLabel: { fontSize: 13.5, fontWeight: '600' },
    infoValue: { fontSize: 13.5, fontWeight: '800', flexShrink: 1, textAlign: 'right' },

    settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
    iconBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    settingLabel: { fontSize: 14.5, fontWeight: '700' },
    settingSub: { fontSize: 12, marginTop: 1 },

    logout: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 54,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    logoutText: { fontSize: 16, fontWeight: '800' },

    footer: { alignItems: 'center', marginTop: 12, gap: 4 },
    footerText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.6 },
    versionText: { fontSize: 11, fontWeight: '500', opacity: 0.6 },
});
