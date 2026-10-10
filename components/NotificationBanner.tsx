import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationsContext';

export const NotificationBanner = () => {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { notifications } = useNotifications();

    const unreadNotifications = notifications.filter(n => !n.read);
    const latestUnread = unreadNotifications[0];

    if (!latestUnread) return null;

    return (
        <View
            style={[
                styles.banner,
                {
                    backgroundColor: colors.primary,
                },
                Shadow.card(theme),
            ]}
        >
            <TouchableOpacity
                style={styles.content}
                onPress={() => router.push('/notifications')}
                activeOpacity={0.8}
            >
                <View style={styles.iconWrapper}>
                    <Ionicons name="notifications" size={18} color="#FFF" />
                </View>
                <View style={styles.textWrapper}>
                    <Text style={styles.title} numberOfLines={1}>
                        {latestUnread.title}
                    </Text>
                    <Text style={styles.body} numberOfLines={1}>
                        {latestUnread.body}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#FFF" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    banner: {
        paddingTop: 8,
        paddingBottom: 8,
        paddingHorizontal: 12,
        borderBottomLeftRadius: Radius.md,
        borderBottomRightRadius: Radius.md,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    iconWrapper: {
        width: 32,
        height: 32,
        borderRadius: Radius.sm,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    textWrapper: {
        flex: 1,
    },
    title: {
        fontSize: 13,
        fontWeight: '800',
        color: '#FFF',
        marginBottom: 2,
    },
    body: {
        fontSize: 11,
        fontWeight: '500',
        color: 'rgba(255,255,255,0.9)',
    },
});
