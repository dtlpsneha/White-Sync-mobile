import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationsContext';
import { notificationTarget } from '@/utils/notificationTarget';
import { InkTile } from '@/components/ui/Midnight';
import { notificationKind } from '@/components/NotificationCenter';

/** The in-app card for the newest unread notification: open it, or leave it for later. */
export const NotificationModal = () => {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const { notifications, markAsRead } = useNotifications();

    const unreadNotifications = notifications.filter(n => !n.read);
    const latestUnread = unreadNotifications[0];
    const target = latestUnread ? notificationTarget(latestUnread.data) : null;
    const kind = latestUnread ? notificationKind(latestUnread) : null;
    const more = unreadNotifications.length - 1;

    // Either button marks it read, so the card always goes away (before, "View" on an
    // alert with nowhere to open did nothing and the card stayed on screen).
    const handleOpen = () => {
        if (!latestUnread) return;
        markAsRead(latestUnread.id);
        if (target) router.push(target);
    };

    const handleDismiss = () => {
        if (latestUnread) markAsRead(latestUnread.id);
    };

    return (
        <Modal visible={!!latestUnread} transparent animationType="fade" statusBarTranslucent onRequestClose={handleDismiss}>
            <View style={styles.overlay} pointerEvents="box-none">
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.raised(theme)]} pointerEvents="auto">
                    <View style={styles.head}>
                        <InkTile icon={kind?.icon ?? 'notifications'} size={48} color={kind ? toneFor(theme, kind.tint) : undefined} />
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.eyebrow, { color: colors.primaryVariant }]}>NEW · {kind?.label.toUpperCase()}</Text>
                            {more > 0 ? <Text style={[styles.more, { color: colors.textSecondary }]}>+{more} more unread</Text> : null}
                        </View>
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>{latestUnread?.title}</Text>
                    {latestUnread?.body ? (
                        <Text style={[styles.body, { color: colors.textSecondary }]} numberOfLines={5}>{latestUnread.body}</Text>
                    ) : null}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, styles.later, { borderColor: colors.border, backgroundColor: colors.surface }]}
                            onPress={handleDismiss}
                        >
                            <Text style={[styles.buttonText, { color: colors.text }]}>{target ? 'Not now' : 'OK'}</Text>
                        </TouchableOpacity>
                        {target ? (
                            <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleOpen}>
                                <Text style={[styles.buttonText, { color: '#FFF' }]}>Open</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(11, 13, 12, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 28,
        borderWidth: 1,
        padding: 20,
        gap: 10,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
    eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    more: { fontSize: 12, marginTop: 2 },
    title: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
    body: { fontSize: 14, lineHeight: 20 },
    buttonRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    button: { flex: 1, height: 50, borderRadius: Radius.md, justifyContent: 'center', alignItems: 'center' },
    later: { borderWidth: 1.5 },
    buttonText: { fontWeight: '800', fontSize: 15 },
});
