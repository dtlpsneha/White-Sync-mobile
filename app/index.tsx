import React, { useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    TouchableWithoutFeedback,
    Keyboard,
    Image,
    Alert,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { clearSessionCaches } from '@/utils/sessionCache';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius } from '@/constants/theme';
import Animated from 'react-native-reanimated';
import { enterSection } from '@/constants/motion';
import { useResponsive } from '../hooks/useResponsive';
import { apiGet, apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';
import { registerPushTokenForCurrentUser } from '@/hooks/usePushNotifications';
import { ensureDevicePermissions } from '../services/DevicePermissions';

export default function LoginScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();
    const styles = getStyles(theme, { s, vs, ms });

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const session = await SecureStore.getItemAsync('session_cookies');
            if (session) {
                console.log('[LoginScreen] Verifying active session...');
                // Try to fetch profile to verify session is still valid on the new server
                const res = await apiPost(apiUrl('/api/method/get_user_profile'), {}, session);

                if (res.ok) {
                    const data: any = res.data;
                    if (data && data.message && data.message.success) {
                        console.log('[LoginScreen] Session valid, routing to home');
                        router.replace('/home');
                        return;
                    }
                }

                // If not ok or success=false, clear and stay on login
                console.log('[LoginScreen] Session invalid or expired, clearing...');
                await SecureStore.deleteItemAsync('session_cookies');
            }
        } catch (error) {
            console.error('[LoginScreen] Session check error:', error);
            // In case of network error during check, we stay on login screen
        }
    };
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        try {
            const trimmedEmail = email.trim();
            const trimmedPassword = password.trim();

            console.log('[Login] Attempting login for:', trimmedEmail);

            const loginData = new URLSearchParams();
            loginData.append('usr', trimmedEmail);
            loginData.append('pwd', trimmedPassword);

            // Directly using apiPost which now handles URLSearchParams
            const res = await apiPost(apiUrl('/api/method/login'), loginData);
            const data: any = res.data;
            console.log('[Login] Response:', data);

            if (res.ok && data.message === 'Logged In') {
                const setCookieHeader = res.headers['set-cookie'];
                // Normalised `sid=...` value to send back as a Cookie header.
                let sessionCookie = '';

                if (setCookieHeader) {
                    const sidMatch = setCookieHeader.match(/(?:^|;)\s*sid=([^;]+)/);
                    if (sidMatch) {
                        sessionCookie = `sid=${sidMatch[1].trim()}`;
                        await SecureStore.setItemAsync('session_cookies', sessionCookie);
                        // A new sign-in never sees what was kept for the previous person.
                        clearSessionCaches();
                        console.log('[Login] sid cookie stored successfully');
                    } else {
                        console.warn('[Login] sid cookie not found in header, storing truncated header');
                        sessionCookie = setCookieHeader.substring(0, 1000);
                        await SecureStore.setItemAsync('session_cookies', sessionCookie);
                        // A new sign-in never sees what was kept for the previous person.
                        clearSessionCaches();
                    }
                }

                if (data.full_name) {
                    await SecureStore.setItemAsync('user_name', data.full_name);
                }

                // Fetch User Profile
                try {
                    // Send the parsed `sid=...` value, not the raw Set-Cookie
                    // header — that still carries Path/HttpOnly/Expires
                    // attributes and is not a valid Cookie request header.
                    const profileRes = await apiPost(apiUrl('/api/method/get_user_profile'), {}, sessionCookie);
                    const profileData: any = profileRes.data;
                    if (profileRes.ok && profileData && profileData.message && profileData.message.success) {
                        const { is_manager, show_all_quotes, user_id } = profileData.message;
                        await SecureStore.setItemAsync('is_manager', is_manager ? 'true' : 'false');
                        await SecureStore.setItemAsync('show_all_quotes', show_all_quotes ? 'true' : 'false');
                        await SecureStore.setItemAsync('user_id', user_id || trimmedEmail);
                    }
                } catch (pe) {
                    console.error('[Login] Profile fetch error:', pe);
                }

                // Bind this device's push token to the user who just logged in, so a
                // user switch doesn't leave the server with a stale token.
                await registerPushTokenForCurrentUser();
                await ensureDevicePermissions();

                Alert.alert('Success', `Welcome, ${data.full_name || 'User'}!`);
                router.replace('/home');
            } else {
                let errorMsg = 'Invalid Credentials';
                if (data.message) {
                    errorMsg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message);
                } else if (data.exc_type) {
                    errorMsg = `${data.exc_type}: Verify credentials on new server.`;
                }
                Alert.alert('Login Failed', errorMsg);
            }
        } catch (error) {
            console.error('[Login] Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Failed to fetch')) {
                Alert.alert('Connection Failed', 'The server is unreachable. Check your internet.');
            } else {
                Alert.alert('Error', errorMessage);
            }
        }
    };

    return (
        <View style={styles.screen}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar style="light" />
            {/* Charcoal page with two soft glows (Midnight x Ember). */}
            <View pointerEvents="none" style={[styles.glow, styles.glowA]} />
            <View pointerEvents="none" style={[styles.glow, styles.glowB]} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.container}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={styles.inner}>
                        <Animated.View entering={enterSection(0)} style={styles.headerContainer}>
                            <View style={styles.logoTile}>
                                <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
                            </View>
                            <Text style={styles.eyebrow}>WHITE SYNC</Text>
                            <Animated.View entering={enterSection(1)}>
                                <Text style={styles.welcomeText}>Welcome back!</Text>
                                <Text style={styles.subText}>Sign in to access your dashboard</Text>
                            </Animated.View>
                            <View style={styles.pills}>
                                {['Orders', 'Visits', 'Quotations', 'Team Chat'].map(t => (
                                    <View key={t} style={styles.pill}>
                                        <Text style={styles.pillText}>{t}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>

                        <Animated.View entering={enterSection(2)} style={styles.formContainer}>
                            <View style={styles.inputWrapper}>
                                <Text style={styles.inputLabel}>Email Address</Text>
                                <View style={styles.inputContainer}>
                                    <Ionicons name="mail-outline" size={20} color={colors.placeholder} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="yourname@email.com"
                                        placeholderTextColor={colors.placeholder}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={email}
                                        onChangeText={setEmail}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputWrapper}>
                                <Text style={styles.inputLabel}>Password</Text>
                                <View style={styles.inputContainer}>
                                    <Ionicons name="lock-closed-outline" size={20} color={colors.placeholder} style={styles.inputIcon} />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="••••••••"
                                        placeholderTextColor={colors.placeholder}
                                        secureTextEntry={!showPassword}
                                        value={password}
                                        onChangeText={setPassword}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Ionicons
                                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                            size={20}
                                            color={colors.placeholder}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.forgotPassword}>
                                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                            </View>

                            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.8}>
                                <Text style={styles.loginButtonText}>Sign in</Text>
                                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                            </TouchableOpacity>

                            <View style={styles.signupContainer}>
                                <Text style={styles.signupText}>New member? </Text>
                                <TouchableOpacity>
                                    <Text style={styles.signupLink}>Contact Admin</Text>
                                </TouchableOpacity>
                            </View>
                        </Animated.View>
                    </View>
                </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
        </View>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        screen: { flex: 1, backgroundColor: '#1F2421', overflow: 'hidden' },
        container: { flex: 1 },
        inner: { flex: 1, justifyContent: 'flex-end' },
        glow: { position: 'absolute', borderRadius: 999 },
        glowA: { width: ms(300), height: ms(300), right: -ms(120), top: -ms(90), backgroundColor: 'rgba(228,87,46,0.20)' },
        glowB: { width: ms(200), height: ms(200), left: -ms(80), top: vs(230), backgroundColor: 'rgba(242,177,52,0.10)' },
        headerContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: s(28), paddingTop: vs(40), paddingBottom: vs(24) },
        logoTile: {
            width: ms(64),
            height: ms(64),
            borderRadius: ms(20),
            backgroundColor: '#FFFFFF', // plain white behind the logo, no orange
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000000',
            shadowOpacity: 0.3,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 8 },
            elevation: 8,
        },
        logo: { width: ms(50), height: ms(50), borderRadius: ms(12) },
        eyebrow: { fontSize: ms(13), fontWeight: '800', letterSpacing: 1.6, color: colors.amber, marginTop: vs(24) },
        welcomeText: { fontSize: ms(32), fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.6, marginTop: vs(8) },
        subText: { fontSize: ms(15), color: colors.onInkMuted, fontWeight: '500', marginTop: vs(6) },
        pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: vs(20) },
        pill: { backgroundColor: colors.ink2, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
        pillText: { color: colors.onInk, fontSize: 11.5, fontWeight: '700' },
        formContainer: {
            width: '100%',
            backgroundColor: colors.background,
            borderTopLeftRadius: ms(32),
            borderTopRightRadius: ms(32),
            paddingHorizontal: s(24),
            paddingTop: vs(28),
            paddingBottom: vs(36),
        },
        inputWrapper: { marginBottom: 16 },
        inputLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: Radius.md,
            paddingHorizontal: s(14),
            height: 54,
            borderWidth: 1,
            borderColor: colors.border,
        },
        inputIcon: { marginRight: 10 },
        input: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '600' },
        forgotPassword: { alignSelf: 'flex-end', marginBottom: 16 },
        forgotPasswordText: { fontSize: 13.5, color: colors.primaryVariant, fontWeight: '800' },
        loginButton: {
            backgroundColor: colors.primary,
            borderRadius: 16,
            height: 56,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.3,
            shadowRadius: 14,
            elevation: 6,
        },
        loginButtonText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
        signupContainer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
        signupText: { fontSize: 13.5, color: colors.textSecondary },
        signupLink: { fontSize: 13.5, color: colors.primaryVariant, fontWeight: '800' },
    });
}
