import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { DailySalesReportBody } from '@/components/dashboard/DailySalesReportBody';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { SideNav } from '@/components/SideNav';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { useResponsive } from '../hooks/useResponsive';

export default function HomeScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const { toggleTheme } = useTheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    const { s, vs, ms, width } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms, width });

    const [userName, setUserName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const [isManager, setIsManager] = useState(false);
    const [hasSession, setHasSession] = useState(false);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        const sessionActive = await checkSession();
        setHasSession(sessionActive);
        if (sessionActive) {
            await loadUserData();
        }
        setLoading(false);
    };

    const checkSession = async () => {
        const session = await SecureStore.getItemAsync('session_cookies');
        if (!session) {
            router.replace('/');
            return false;
        }
        return true;
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadUserData();
        setRefreshing(false);
    };

    const loadUserData = async () => {
        try {
            const name = await SecureStore.getItemAsync('user_name');
            setUserName(name || 'User');
            const isManagerStr = await SecureStore.getItemAsync('is_manager');
            setIsManager(isManagerStr === 'true');
        } catch (error) { }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout', style: 'destructive', onPress: async () => {
                    // Must clear the same keys as the Profile screen's logout.
                    // This path previously left is_manager / show_all_quotes /
                    // user_id behind, so the next account to sign in on this
                    // device inherited the previous user's permissions if its
                    // profile fetch failed.
                    await Promise.all([
                        SecureStore.deleteItemAsync('session_cookies'),
                        SecureStore.deleteItemAsync('user_name'),
                        SecureStore.deleteItemAsync('is_manager'),
                        SecureStore.deleteItemAsync('show_all_quotes'),
                        SecureStore.deleteItemAsync('user_id'),
                        SecureStore.deleteItemAsync('last_seen_pending_ids'),
                    ]);
                    router.replace('/');
                }
            }
        ]);
    };

    if (loading && !refreshing) {
        return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.text} /></View>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.scrollContent} contentContainerStyle={{ paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}>
                <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
                {permissionDenied ? (
                    <View style={styles.deniedContainer}>
                        <View style={styles.deniedContent}>
                            <Ionicons name="lock-closed-outline" size={48} color="#F4511E" />
                            <Text style={styles.deniedTitle}>Access Restricted</Text>
                            <Text style={styles.deniedSubtitle}>Session expired. Please log in again.</Text>
                            <TouchableOpacity style={styles.deniedButton} onPress={handleLogout}><Text style={styles.deniedButtonText}>Return to Login</Text></TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <>
                        <LinearGradient
                            colors={isDark ? ['#0B3D91', '#01579B'] : ['#0288D1', '#01579B']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.headerCard}
                        >
                            <View style={styles.headerTopRow}>
                                <SideNav onDark />
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Image source={require('../assets/images/logo.png')} style={{ width: ms(26), height: ms(26), borderRadius: ms(6), marginRight: s(8) }} resizeMode="contain" />
                                    <Text style={{ fontSize: ms(17), fontWeight: '900', color: '#FFFFFF' }}>White Sync</Text>
                                </View>
                                <TouchableOpacity onPress={handleLogout} style={styles.profileButton}><View style={styles.avatar}><Text style={styles.avatarText}>{userName ? userName[0].toUpperCase() : 'U'}</Text></View></TouchableOpacity>
                            </View>
                            <Text style={styles.welcomeText}>WELCOME BACK</Text>
                            <Text style={styles.userNameText}>{userName || 'User'}</Text>
                        </LinearGradient>

                        <SectionHeader
                            title="Daily Sales Report"
                            subtitle="Sales & collection summary"
                            icon="bar-chart-outline"
                        />
                        <DailySalesReportBody />
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { flex: 1 },
        loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
        headerCard: {
            marginHorizontal: s(16),
            marginTop: Platform.OS === 'android' ? vs(46) : vs(16),
            marginBottom: vs(18),
            borderRadius: ms(24),
            padding: ms(18),
            elevation: 6,
            shadowColor: '#01579B',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
        },
        headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: vs(14) },
        welcomeText: { fontSize: ms(12), color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 1.5, marginBottom: vs(2), textTransform: 'uppercase' },
        deniedContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: vs(150), paddingHorizontal: s(24) },
        deniedContent: { backgroundColor: colors.surface, borderRadius: ms(32), padding: ms(32), alignItems: 'center', elevation: 5 },
        deniedTitle: { fontSize: ms(22), fontWeight: '900', color: colors.text, marginBottom: vs(12) },
        deniedSubtitle: { fontSize: ms(14), color: colors.textSecondary, textAlign: 'center', marginBottom: vs(32) },
        deniedButton: { backgroundColor: colors.primary, paddingVertical: vs(14), paddingHorizontal: s(32), borderRadius: ms(16) },
        deniedButtonText: { color: '#FFF', fontSize: ms(15), fontWeight: '900' },
        userNameText: { fontSize: ms(24), fontWeight: 'bold', color: '#FFFFFF' },
        profileButton: { elevation: 4 },
        avatar: { width: ms(48), height: ms(48), borderRadius: ms(16), backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', justifyContent: 'center', alignItems: 'center' },
        avatarText: { fontSize: ms(20), fontWeight: '900', color: '#FFF' },
        topActions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: s(24), gap: s(8) },
        iconButton: { width: ms(40), height: ms(40), borderRadius: ms(20), backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    });
}

