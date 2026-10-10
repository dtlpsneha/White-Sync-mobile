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
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Radius, Shadow } from '@/constants/theme';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
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
                        console.log('[Login] sid cookie stored successfully');
                    } else {
                        console.warn('[Login] sid cookie not found in header, storing truncated header');
                        sessionCookie = setCookieHeader.substring(0, 1000);
                        await SecureStore.setItemAsync('session_cookies', sessionCookie);
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
        <LinearGradient colors={Gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.inner}>
                    <Stack.Screen options={{ headerShown: false }} />
                    <StatusBar style="light" />

                    <Animated.View entering={FadeInUp.duration(1000).springify()} style={styles.headerContainer}>
                        <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
                        <Text style={styles.appName}>White Sync</Text>
                        <Animated.View entering={FadeIn.delay(300).duration(800)} style={styles.welcomeBox}>
                            <Text style={styles.welcomeText}>Welcome Back!</Text>
                            <Text style={styles.subText}>Sign in to access your dashboard</Text>
                        </Animated.View>
                    </Animated.View>

                    <Animated.View entering={FadeInDown.delay(500).duration(1000).springify()} style={styles.formContainer}>
                        <Animated.View entering={FadeInDown.delay(600).springify()} style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Email Address</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
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
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(700).springify()} style={styles.inputWrapper}>
                            <Text style={styles.inputLabel}>Password</Text>
                            <View style={styles.inputContainer}>
                                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
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
                                        color={colors.textSecondary}
                                    />
                                </TouchableOpacity>
                            </View>
                        </Animated.View>

                        <Animated.View entering={FadeIn.delay(800)} style={styles.forgotPassword}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(900).springify()} style={styles.loginButtonWrapper}>
                            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.8}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Text style={styles.loginButtonText}>Sign In</Text>
                                    <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        <Animated.View entering={FadeIn.delay(1000)} style={styles.signupContainer}>
                            <Text style={styles.signupText}>New member? </Text>
                            <TouchableOpacity>
                                <Text style={styles.signupLink}>Contact Admin</Text>
                            </TouchableOpacity>
                        </Animated.View>
                    </Animated.View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
        </LinearGradient>
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
        },
        inner: {
            flex: 1,
            justifyContent: 'center',
            padding: 24,
        },
        headerContainer: {
            marginBottom: 28,
            alignItems: 'center',
        },
        logo: {
            width: ms(80),
            height: ms(80),
            marginBottom: vs(16),
            borderRadius: ms(20),
            backgroundColor: '#FFFFFF',
        },

        appName: {
            fontSize: ms(32),
            fontWeight: '900',
            color: '#FFFFFF',
            letterSpacing: -0.5,
            marginBottom: vs(8),
        },
        welcomeBox: {
            alignItems: 'center',
        },
        welcomeText: {
            fontSize: ms(22),
            fontWeight: '700',
            color: '#FFFFFF',
            marginBottom: vs(4),
        },
        subText: {
            fontSize: ms(15),
            color: 'rgba(255,255,255,0.8)',
            fontWeight: '500',
        },
        formContainer: {
            width: '100%',
            backgroundColor: colors.surface,
            borderRadius: Radius.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 22,
            ...Shadow.raised(theme),
        },
        inputWrapper: {
            marginBottom: 20,
        },
        inputLabel: {
            fontSize: 14,
            fontWeight: '700',
            color: colors.textSecondary,
            marginBottom: 8,
            marginLeft: 4,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surfaceSecondary,
            borderRadius: Radius.md,
            paddingHorizontal: s(16),
            height: vs(56),
            borderWidth: 1,
            borderColor: colors.border,
        },
        inputIcon: {
            marginRight: 12,
        },
        input: {
            flex: 1,
            fontSize: 16,
            color: colors.text,
            fontWeight: '500',
        },
        forgotPassword: {
            alignSelf: 'flex-end',
            marginBottom: 24,
        },
        forgotPasswordText: {
            fontSize: 14,
            color: colors.primary,
            fontWeight: '700',
        },
        loginButton: {
            backgroundColor: colors.primary,
            borderRadius: Radius.md,
            height: vs(56),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: vs(24),
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: vs(8) },
            shadowOpacity: 0.3,
            shadowRadius: ms(15),
            elevation: 8,
        },
        loginButtonText: {
            fontSize: 18,
            fontWeight: '900',
            color: '#FFFFFF',
            textTransform: 'uppercase',
            letterSpacing: 1,
        },
        loginButtonWrapper: {
            width: '100%',
        },
        signupContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 10
        },
        signupText: {
            fontSize: 14,
            color: colors.textSecondary,
        },
        signupLink: {
            fontSize: 14,
            color: colors.primary,
            fontWeight: '800',
        },
    });
}

