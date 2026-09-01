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
import { Colors } from '@/constants/theme';
import Animated, { FadeInUp, FadeInDown, FadeIn } from 'react-native-reanimated';
import { useResponsive } from '../hooks/useResponsive';
import { apiGet, apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';

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
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={styles.inner}>
                    <Stack.Screen options={{ headerShown: false }} />
                    <StatusBar style="dark" />

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
                                <Ionicons name="mail-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="yourname@email.com"
                                    placeholderTextColor="#B0BEC5"
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
                                <Ionicons name="lock-closed-outline" size={20} color="#90A4AE" style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    placeholderTextColor="#B0BEC5"
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
                                />
                                <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                    <Ionicons
                                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                        size={20}
                                        color="#90A4AE"
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
    );
}

function getStyles(theme: 'light' | 'dark', { s, vs, ms }: any) {
    const isDark = theme === 'dark';
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        inner: {
            flex: 1,
            justifyContent: 'center',
            padding: 24,
        },
        headerContainer: {
            marginBottom: 32,
            alignItems: 'center',
        },
        logo: {
            width: ms(80),
            height: ms(80),
            marginBottom: vs(16),
            borderRadius: ms(20),
        },

        appName: {
            fontSize: ms(32),
            fontWeight: '900',
            color: colors.primary,
            letterSpacing: -0.5,
            marginBottom: vs(8),
        },
        welcomeBox: {
            alignItems: 'center',
        },
        welcomeText: {
            fontSize: ms(22),
            fontWeight: '700',
            color: colors.text,
            marginBottom: vs(4),
        },
        subText: {
            fontSize: ms(15),
            color: colors.textSecondary,
            fontWeight: '500',
        },
        formContainer: {
            width: '100%',
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
            backgroundColor: isDark ? colors.surface : '#FFF',
            borderRadius: ms(18),
            paddingHorizontal: s(16),
            height: vs(58),
            borderWidth: 1.5,
            borderColor: isDark ? colors.surfaceSecondary : '#F0F4F8',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: vs(4) },
            shadowOpacity: isDark ? 0.3 : 0.02,
            shadowRadius: ms(10),
            elevation: 2,
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
            marginBottom: 32,
        },
        forgotPasswordText: {
            fontSize: 14,
            color: colors.primary,
            fontWeight: '700',
        },
        loginButton: {
            backgroundColor: colors.primary,
            borderRadius: ms(18),
            height: vs(58),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: vs(32),
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
            color: colors.success,
            fontWeight: '800',
        },
    });
}

