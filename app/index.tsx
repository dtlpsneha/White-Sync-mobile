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
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { s, vs, ms } from '../utils/responsive';

export default function LoginScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const styles = getStyles(theme);

    useEffect(() => {
        checkSession();
    }, []);

    const checkSession = async () => {
        try {
            const session = await SecureStore.getItemAsync('session_cookies');
            if (session) {
                console.log('[LoginScreen] Active session detected, routing to home...');
                router.replace('/home');
            }
        } catch (error) {
            console.error('[LoginScreen] Session check error:', error);
        }
    };
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleLogin = async () => {
        try {
            console.log('Attempting login for:', email);
            const response = await fetch('http://13.234.62.39:8080/api/method/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    usr: email,
                    pwd: password,
                }),
            });

            const data = await response.json();
            console.log('Login Response:', data);

            if (response.ok && data.message === 'Logged In') {
                // Extract session cookie
                const setCookieHeader = response.headers.get('set-cookie');
                if (setCookieHeader) {
                    await SecureStore.setItemAsync('session_cookies', setCookieHeader);
                    console.log('Session cookies stored securedly.');
                }

                // Store user info if needed
                if (data.full_name) {
                    await SecureStore.setItemAsync('user_name', data.full_name);
                }

                // Fetch User Profile & Permissions
                try {
                    console.log('Fetching user profile...');
                    const profileRes = await fetch('http://13.234.62.39:8080/api/method/get_user_profile', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Cookie': setCookieHeader || ''
                        }
                    });

                    const profileData = await profileRes.json();
                    console.log('User Profile Response:', profileData);

                    if (profileRes.ok && profileData.message && profileData.message.success) {
                        const { is_manager, show_all_quotes, roles, user_id } = profileData.message;

                        // Store critical permission flags as string booleans
                        await SecureStore.setItemAsync('is_manager', is_manager ? 'true' : 'false');
                        await SecureStore.setItemAsync('show_all_quotes', show_all_quotes ? 'true' : 'false');
                        await SecureStore.setItemAsync('user_id', user_id || email);

                        // Store roles (legacy support)
                        if (roles && roles.length > 0) {
                            await SecureStore.setItemAsync('user_roles', JSON.stringify(roles));
                        }

                        console.log(`Permissions saved: Manager=${is_manager}, ShowAll=${show_all_quotes}`);
                    } else {
                        console.warn('Failed to fetch user profile or success flag is missing:', profileData);
                        // Default to restricted access if profile fetch fails but login succeeded
                        await SecureStore.setItemAsync('is_manager', 'false');
                        await SecureStore.setItemAsync('show_all_quotes', 'false');
                    }
                } catch (profileError) {
                    console.error('Error fetching user profile:', profileError);
                    // Default to restricted access on error
                    await SecureStore.setItemAsync('is_manager', 'false');
                    await SecureStore.setItemAsync('show_all_quotes', 'false');
                }

                alert(`Welcome, ${data.full_name || 'User'}!`);
                router.replace('/home');
            } else {
                alert('Login Failed: ' + (data.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Login Error:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('Failed to fetch')) {
                alert('Connection Failed: The server is unreachable.\n\nPlease check your internet connection or server status.');
            } else {
                alert('An error occurred: ' + errorMessage);
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

                    <View style={styles.headerContainer}>

                        <Text style={styles.appName}>White Sync</Text>
                        <View style={styles.welcomeBox}>
                            <Text style={styles.welcomeText}>Welcome Back!</Text>
                            <Text style={styles.subText}>Sign in to access your dashboard</Text>
                        </View>
                    </View>

                    <View style={styles.formContainer}>
                        <View style={styles.inputWrapper}>
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
                        </View>

                        <View style={styles.inputWrapper}>
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
                        </View>

                        <TouchableOpacity style={styles.forgotPassword}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.loginButton} onPress={handleLogin} activeOpacity={0.8}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Text style={styles.loginButtonText}>Sign In</Text>
                                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
                            </View>
                        </TouchableOpacity>

                        <View style={styles.signupContainer}>
                            <Text style={styles.signupText}>New member? </Text>
                            <TouchableOpacity>
                                <Text style={styles.signupLink}>Contact Admin</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

function getStyles(theme: 'light' | 'dark') {
    const isDark = theme === 'dark';
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: '#F8F9FE', // Very light lavender/grey
        },
        inner: {
            flex: 1,
            justifyContent: 'center',
            padding: 24,
        },
        headerContainer: {
            marginBottom: 48,
            alignItems: 'center',
        },

        appName: {
            fontSize: ms(32),
            fontWeight: '900',
            color: '#01579B', // Midnight Blue
            letterSpacing: -0.5,
            marginBottom: vs(8),
        },
        welcomeBox: {
            alignItems: 'center',
        },
        welcomeText: {
            fontSize: ms(22),
            fontWeight: '700',
            color: '#263238',
            marginBottom: vs(4),
        },
        subText: {
            fontSize: ms(15),
            color: '#90A4AE',
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
            color: '#455A64',
            marginBottom: 8,
            marginLeft: 4,
        },
        inputContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#FFF',
            borderRadius: ms(18),
            paddingHorizontal: s(16),
            height: vs(58),
            borderWidth: 1.5,
            borderColor: '#F0F4F8',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: vs(4) },
            shadowOpacity: 0.02,
            shadowRadius: ms(10),
            elevation: 2,
        },
        inputIcon: {
            marginRight: 12,
        },
        input: {
            flex: 1,
            fontSize: 16,
            color: '#263238',
            fontWeight: '500',
        },
        forgotPassword: {
            alignSelf: 'flex-end',
            marginBottom: 32,
        },
        forgotPasswordText: {
            fontSize: 14,
            color: '#0277BD',
            fontWeight: '700',
        },
        loginButton: {
            backgroundColor: '#01579B', // Midnight Blue
            borderRadius: ms(18),
            height: vs(58),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: vs(32),
            shadowColor: '#01579B',
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
        signupContainer: {
            flexDirection: 'row',
            justifyContent: 'center',
            marginTop: 10
        },
        signupText: {
            fontSize: 14,
            color: '#90A4AE',
        },
        signupLink: {
            fontSize: 14,
            color: '#00BFA5', // Teal
            fontWeight: '800',
        },
    });
}
