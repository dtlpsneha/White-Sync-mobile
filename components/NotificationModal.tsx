import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotifications } from '@/context/NotificationsContext';

export const NotificationModal = () => {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { notifications, markAsRead } = useNotifications();

    const unreadNotifications = notifications.filter(n => !n.read);
    const latestUnread = unreadNotifications[0];

    const handleView = () => {
        console.log('[Modal] VIEW pressed, latestUnread:', !!latestUnread);
        if (latestUnread?.data?.id) {
            markAsRead(latestUnread.id);
            router.push({
                pathname: '/quotations/[id]',
                params: { id: latestUnread.data.id }
            });
        }
    };

    const handleDismiss = () => {
        console.log('[Modal] DISMISS pressed');
        if (latestUnread) {
            markAsRead(latestUnread.id);
        }
    };

    return (
        <Modal visible={!!latestUnread} transparent animationType="fade">
            <View style={styles.overlay} pointerEvents="box-none">
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.raised(theme)]} pointerEvents="auto">
                    <View style={[styles.iconBox, { backgroundColor: colors.primary }]}>
                        <Ionicons name="notifications" size={32} color="#FFF" />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>
                        {latestUnread?.title}
                    </Text>

                    <Text style={[styles.body, { color: colors.textSecondary }]}>
                        {latestUnread?.body}
                    </Text>

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.primary }]}
                            onPress={handleView}
                        >
                            <Text style={styles.buttonText}>VIEW</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.surfaceSecondary }]}
                            onPress={handleDismiss}
                        >
                            <Text style={[styles.buttonText, { color: colors.text }]}>DISMISS</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    card: {
        borderRadius: Radius.xl,
        borderWidth: 1,
        padding: 24,
        alignItems: 'center',
    },
    iconBox: {
        width: 60,
        height: 60,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
    },
    body: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: Radius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFF',
        fontWeight: '900',
        fontSize: 13,
    },
});
