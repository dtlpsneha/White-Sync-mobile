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

export default function LoginScreen() {
    const router = useRouter();

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

                // Fetch and store User Roles
                try {
                    const userResponse = await fetch(`http://13.234.62.39:8080/api/resource/User/${email}`, { headers: { 'Cookie': setCookieHeader || '' } });
                    const userData = await userResponse.json();

                    let roles = [];
                    if (userResponse.ok && userData.data && userData.data.roles && userData.data.roles.length > 0) {
                        roles = userData.data.roles.map((r: any) => r.role);
                        console.log('User Roles fetched from server:', roles);
                    } else {
                        console.warn('Failed to fetch user roles or no roles found', userData);
                        // FALLBACK for specific user
                        if (email.toLowerCase() === 'dtlpmanikandan@gmail.com') {
                            console.log('Applying fallback roles for dtlpmanikandan@gmail.com');
                            roles = ['Sales Manager', 'Sales User', 'System Manager'];
                        }
                    }

                    if (roles.length > 0) {
                        await SecureStore.setItemAsync('user_roles', JSON.stringify(roles));
                        console.log('User Roles stored:', roles);
                    } else {
                        console.log('No roles to store.');
                    }

                } catch (roleError) {
                    console.error('Error fetching user roles:', roleError);
                    // FALLBACK on error
                    if (email.toLowerCase() === 'dtlpmanikandan@gmail.com') {
                        console.log('Applying fallback roles for dtlpmanikandan@gmail.com (Error Path)');
                        const roles = ['Sales Manager', 'Sales User', 'System Manager'];
                        await SecureStore.setItemAsync('user_roles', JSON.stringify(roles));
                    }
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
                        <Text style={styles.welcomeText}>Welcome Back!</Text>
                        <Text style={styles.subText}>Please sign in to continue.</Text>
                    </View>

                    <View style={styles.formContainer}>
                        <View style={styles.inputContainer}>
                            <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Email Address"
                                placeholderTextColor="#999"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={email}
                                onChangeText={setEmail}
                            />
                        </View>

                        <View style={styles.inputContainer}>
                            <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                            <TextInput
                                style={styles.input}
                                placeholder="Password"
                                placeholderTextColor="#999"
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                            />
                            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="#666"
                                />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.forgotPassword}>
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                            <Text style={styles.loginButtonText}>Submit</Text>
                        </TouchableOpacity>

                        <View style={styles.signupContainer}>
                            <Text style={styles.signupText}>Don't have an account? </Text>
                            <TouchableOpacity>
                                <Text style={styles.signupLink}>Sign Up</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F7',
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
        fontSize: 28,
        fontWeight: 'bold',
        color: '#007AFF', // Example primary color
        marginBottom: 12,
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: '600',
        color: '#1C1C1E',
        marginBottom: 8,
    },
    subText: {
        fontSize: 16,
        color: '#8E8E93',
    },
    formContainer: {
        width: '100%',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        fontSize: 16,
        color: '#1C1C1E',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotPasswordText: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '500',
    },
    loginButton: {
        backgroundColor: '#007AFF',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: '#007AFF',
        shadowOffset: {
            width: 0,
            height: 4,
        },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    loginButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    signupContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20
    },
    signupText: {
        fontSize: 14,
        color: '#8E8E93',
    },
    signupLink: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: 'bold',
    },
});
