import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { FloatingNav } from '@/components/FloatingNav';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';

export default function ProfileScreen() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    // User State
    const [userName, setUserName] = useState('User');
    const [userId, setUserId] = useState('');
    const [isManager, setIsManager] = useState(false);
    const [showAllQuotes, setShowAllQuotes] = useState(false);

    useEffect(() => {
        loadUserData();
    }, []);

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

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Header/Avatar Section */}
                <Animated.View entering={FadeInUp.delay(100).duration(800)} style={styles.profileHeader}>
                    <View style={[styles.avatar, { backgroundColor: isDark ? '#121212' : '#EFF6FF', borderColor: isDark ? '#2C2C2E' : '#DBEAFE' }]}>
                        <Text style={[styles.avatarText, { color: isDark ? '#38BDF8' : '#1E40AF' }]}>{firstLetter}</Text>
                    </View>
                    <Text style={[styles.userName, { color: colors.text }]}>{userName}</Text>
                    <Text style={styles.userRole}>{isManager ? 'Sales Manager' : 'Sales Executive'}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: isDark ? '#121212' : '#F1F5F9' }]}>
                        <View style={styles.onlineDot} />
                        <Text style={[styles.statusText, { color: colors.textSecondary }]}>Active Session</Text>
                    </View>
                </Animated.View>

                {/* Account Details Card */}
                <Animated.View entering={FadeInDown.delay(200).duration(800)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionTitle, { color: colors.primary }]}>Account Information</Text>
                    
                    <View style={styles.infoRow}>
                        <View style={styles.infoLabelContainer}>
                            <Ionicons name="mail-outline" size={16} color={colors.textSecondary} />
                            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Email / User ID</Text>
                        </View>
                        <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit>{userId || '---'}</Text>
                    </View>
                    
                    <View style={[styles.infoRow, styles.borderTop, { borderColor: colors.border }]}>
                        <View style={styles.infoLabelContainer}>
                            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
                            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Access Level</Text>
                        </View>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{isManager ? 'Manager' : 'Executive'}</Text>
                    </View>

                    <View style={[styles.infoRow, styles.borderTop, { borderColor: colors.border }]}>
                        <View style={styles.infoLabelContainer}>
                            <Ionicons name="eye-outline" size={16} color={colors.textSecondary} />
                            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Scope</Text>
                        </View>
                        <Text style={[styles.infoValue, { color: colors.text }]}>{showAllQuotes ? 'All Quotes' : 'Own Quotes Only'}</Text>
                    </View>
                </Animated.View>

                {/* Preferences & Actions */}
                <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.settingsList}>
                    <Text style={[styles.sectionTitle, { color: colors.primary, marginLeft: 8, marginBottom: 4 }]}>App Preferences</Text>

                    {/* Dark Mode */}
                    <View style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(56, 189, 248, 0.1)' : '#EFF6FF' }]}>
                            <Ionicons name="moon-outline" size={20} color={isDark ? '#38BDF8' : '#1E40AF'} />
                        </View>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
                        <Switch
                            value={isDark}
                            onValueChange={toggleTheme}
                            trackColor={{ false: '#E2E8F0', true: colors.primary }}
                            thumbColor={Platform.OS === 'ios' ? undefined : (isDark ? '#FFFFFF' : '#F8FAFC')}
                        />
                    </View>

                    {/* Reset / Sync Cache */}
                    <TouchableOpacity 
                        style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                        onPress={handleClearCache}
                    >
                        <View style={[styles.iconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                            <Ionicons name="sync-outline" size={20} color="#10B981" />
                        </View>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Sync & Clear Cache</Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>

                    {/* Logout */}
                    <TouchableOpacity 
                        style={[styles.settingItem, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 }]}
                        onPress={handleLogout}
                    >
                        <View style={[styles.iconBox, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                        </View>
                        <Text style={[styles.settingLabel, { color: '#EF4444' }]}>Sign Out</Text>
                        <Ionicons name="chevron-forward" size={18} color="#EF4444" opacity={0.5} />
                    </TouchableOpacity>
                </Animated.View>

                {/* Version Info Footer */}
                <Animated.View entering={FadeInDown.delay(400).duration(800)} style={styles.footer}>
                    <Text style={[styles.footerText, { color: colors.textSecondary }]}>White Sync App</Text>
                    <Text style={[styles.versionText, { color: colors.textSecondary }]}>Version 1.0.0 (Build 24)</Text>
                </Animated.View>
            </ScrollView>

            <FloatingNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 130,
    },
    profileHeader: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 24,
    },
    avatar: {
        width: 90,
        height: 90,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1.5,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 10 },
            android: { elevation: 3 },
        })
    },
    avatarText: {
        fontSize: 36,
        fontWeight: '900',
    },
    userName: {
        fontSize: 22,
        fontWeight: '900',
        marginBottom: 4,
    },
    userRole: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
        marginBottom: 10,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    onlineDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
        marginRight: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '700',
    },
    card: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        marginBottom: 20,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
            android: { elevation: 2 },
        })
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 12,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    borderTop: {
        borderTopWidth: 1,
    },
    infoLabelContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    infoLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    infoValue: {
        fontSize: 14,
        fontWeight: '700',
        maxWidth: '55%',
    },
    settingsList: {
        gap: 10,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 20,
        borderWidth: 1,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
            android: { elevation: 2 },
        })
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    settingLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '700',
    },
    footer: {
        alignItems: 'center',
        marginTop: 32,
        gap: 4,
    },
    footerText: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
        opacity: 0.6,
    },
    versionText: {
        fontSize: 11,
        fontWeight: '500',
        opacity: 0.5,
    }
});
