import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { FloatingNav } from '@/components/FloatingNav';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';

export default function ProfileScreen() {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const [isDarkMode, setIsDarkMode] = useState(theme === 'dark');

    // Update internal state when system theme changes
    useEffect(() => {
        setIsDarkMode(theme === 'dark');
    }, [theme]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header/Avatar Section */}
                <Animated.View entering={FadeInUp.delay(100).duration(800)} style={styles.profileHeader}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>S</Text>
                    </View>
                    <Text style={[styles.userName, { color: colors.text }]}>Sasi kumar</Text>
                    <Text style={styles.userRole}>Sales Manager</Text>
                    <View style={styles.statusBadge}>
                        <View style={styles.onlineDot} />
                        <Text style={styles.statusText}>Active</Text>
                    </View>
                </Animated.View>

                {/* Settings List */}
                <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.settingsList}>
                    <TouchableOpacity style={[styles.settingItem, { backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF' }]}>
                        <View style={styles.iconBox}>
                            <Ionicons name="settings-outline" size={20} color="#64748B" />
                        </View>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Settings</Text>
                        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.settingItem, { backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF' }]}>
                        <View style={styles.iconBox}>
                            <Ionicons name="people-outline" size={20} color="#64748B" />
                        </View>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Team Members</Text>
                        <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
                    </TouchableOpacity>

                    <View style={[styles.settingItem, { backgroundColor: theme === 'dark' ? '#1E293B' : '#FFFFFF' }]}>
                        <View style={styles.iconBox}>
                            <Ionicons name="moon-outline" size={20} color="#64748B" />
                        </View>
                        <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
                        <Switch
                            value={isDarkMode}
                            onValueChange={setIsDarkMode}
                            trackColor={{ false: '#E2E8F0', true: '#1E40AF' }}
                            thumbColor={isDarkMode ? '#FFFFFF' : '#F8FAFC'}
                        />
                    </View>
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
        padding: 24,
        paddingBottom: 120,
    },
    profileHeader: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 40,
    },
    avatar: {
        width: 100,
        height: 100,
        backgroundColor: '#EFF6FF',
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 2,
        borderColor: '#DBEAFE',
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 5,
    },
    avatarText: {
        color: '#1E40AF',
        fontSize: 40,
        fontWeight: '900',
    },
    userName: {
        fontSize: 24,
        fontWeight: '900',
        marginBottom: 4,
    },
    userRole: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '600',
        marginBottom: 12,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
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
        color: '#64748B',
    },
    settingsList: {
        gap: 12,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: '#F8FAFC',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    settingLabel: {
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
    }
});
