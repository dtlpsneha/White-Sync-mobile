import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import type { PersistentNotification } from '@/context/NotificationsContext';

interface NotificationCenterProps {
    notifications: PersistentNotification[];
    onMarkRead: (id: string) => void;
    onClearAll: () => void;
    onNotificationTap?: (notification: PersistentNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    notifications,
    onMarkRead,
    onClearAll,
    onNotificationTap,
}) => {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { ms } = useResponsive();
    const isDark = theme === 'dark';

    const styles = useMemo(() => getStyles(theme, { ms, isDark }), [theme, ms, isDark]);
    const unreadCount = notifications.filter(n => !n.read).length;

    if (!notifications || notifications.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Ionicons name="notifications-off-outline" size={48} color={colors.textSecondary} style={{ marginBottom: 12 }} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No notifications yet</Text>
            </View>
        );
    }

    const formatTime = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;

        const date = new Date(timestamp);
        return date.toLocaleDateString();
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Notifications</Text>
                    {unreadCount > 0 && (
                        <Text style={[styles.unreadBadge, { color: colors.textSecondary }]}>
                            {unreadCount} new
                        </Text>
                    )}
                </View>
                {notifications.length > 0 && (
                    <TouchableOpacity onPress={onClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={[styles.clearAllText, { color: colors.primary }]}>Clear All</Text>
                    </TouchableOpacity>
                )}
            </View>

            <FlatList
                contentContainerStyle={{ padding: ms(16), paddingTop: ms(4) }}
                data={notifications}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        onPress={() => {
                            onMarkRead(item.id);
                            onNotificationTap?.(item);
                        }}
                        activeOpacity={0.7}
                        style={[
                            styles.notificationItem,
                            {
                                backgroundColor: item.read ? colors.surface : colors.primarySoft,
                                borderColor: colors.border,
                                borderLeftColor: item.read ? colors.border : colors.primary,
                            },
                            Shadow.card(theme),
                        ]}
                    >
                        <View style={styles.notificationContent}>
                            <View style={styles.notificationHeader}>
                                <Text style={[styles.notificationTitle, { color: colors.text }]} numberOfLines={2}>
                                    {item.title}
                                </Text>
                                {!item.read && (
                                    <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                                )}
                            </View>
                            <Text style={[styles.notificationBody, { color: colors.textSecondary }]} numberOfLines={2}>
                                {item.body}
                            </Text>
                            <Text style={[styles.notificationTime, { color: colors.textSecondary }]}>
                                {formatTime(item.timestamp)}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                    </TouchableOpacity>
                )}
            />
        </View>
    );
};

function getStyles(theme: 'light' | 'dark', { ms, isDark }: any) {
    const colors = Colors[theme];
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        header: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: ms(16),
            paddingVertical: ms(16),
        },
        headerTitle: {
            fontSize: ms(18),
            fontWeight: '900',
        },
        unreadBadge: {
            fontSize: ms(12),
            fontWeight: '600',
            marginTop: 4,
        },
        clearAllText: {
            fontSize: ms(13),
            fontWeight: '600',
        },
        notificationItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: ms(16),
            paddingVertical: ms(14),
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderLeftWidth: 4,
            marginBottom: ms(10),
        },
        notificationContent: {
            flex: 1,
            marginRight: ms(8),
        },
        notificationHeader: {
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: 6,
        },
        notificationTitle: {
            fontSize: ms(14),
            fontWeight: '800',
            flex: 1,
        },
        unreadDot: {
            width: 8,
            height: 8,
            borderRadius: 4,
            marginLeft: 8,
        },
        notificationBody: {
            fontSize: ms(13),
            marginBottom: 6,
        },
        notificationTime: {
            fontSize: ms(11),
            fontWeight: '500',
        },
        emptyContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.background,
        },
        emptyText: {
            fontSize: ms(14),
            fontWeight: '600',
        },
    });
}
