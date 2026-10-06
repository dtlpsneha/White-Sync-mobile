import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

interface Props {
    notification: Notifications.Notification | undefined;
    onDismiss: () => void;
}

interface PopupData {
    title: string | null | undefined;
    body: string | null | undefined;
    quotationId: string | undefined;
}

export const NotificationPopup = ({ notification, onDismiss }: Props) => {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const isDark = theme === 'dark';
    const colors = Colors[theme];

    const translateY = useSharedValue(-160);
    const opacity = useSharedValue(0);

    // Self-contained: visibility is driven by popupData, NOT by the notification prop.
    // This means clearing the parent's notification state never collapses the popup —
    // only an explicit dismiss tap does.
    const [popupData, setPopupData] = useState<PopupData | null>(null);
    const lastShownId = useRef<string | null>(null);

    const hidePopup = () => {
        setPopupData(null);
    };

    const dismiss = () => {
        translateY.value = withTiming(-160, { duration: 280 });
        opacity.value = withTiming(0, { duration: 280 }, (done) => {
            if (done) {
                runOnJS(hidePopup)();
                runOnJS(onDismiss)();
            }
        });
    };

    useEffect(() => {
        if (!notification) return; // clearing the prop must NOT hide the popup

        const notifId = notification.request.identifier;
        if (lastShownId.current === notifId) return; // already processing this one

        const data = notification.request.content.data as any;
        const approver: string | undefined = data?.approver;

        const check = async () => {
            if (approver) {
                const userId = await SecureStore.getItemAsync('user_id');
                if (!userId || userId.toLowerCase() !== approver.toLowerCase()) {
                    onDismiss();
                    return;
                }
            }
            lastShownId.current = notifId;
            setPopupData({
                title: notification.request.content.title,
                body: notification.request.content.body,
                quotationId: data?.id as string | undefined,
            });
            translateY.value = withSpring(0, { damping: 18, stiffness: 160 });
            opacity.value = withTiming(1, { duration: 200 });
        };

        check();
    }, [notification]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: opacity.value,
    }));

    if (!popupData) return null;

    const { title, body, quotationId } = popupData;

    const handleView = () => {
        dismiss();
        if (quotationId) {
            router.push({ pathname: '/quotations/[id]', params: { id: quotationId } });
        }
    };

    const top = Math.max(insets.top, 16) + (Platform.OS === 'android' ? 8 : 0);

    return (
        <Animated.View style={[styles.wrapper, { top }, animatedStyle]} pointerEvents="box-none">
            <View
                style={[
                    styles.card,
                    {
                        backgroundColor: isDark ? '#1E2329' : '#FFFFFF',
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
                        shadowColor: isDark ? '#000' : '#1A1A2E',
                    },
                ]}
            >
                {/* Left accent bar */}
                <View style={styles.accent} />

                {/* Icon */}
                <View style={[styles.iconWrap, { backgroundColor: '#3B82F620' }]}>
                    <Ionicons name="document-text" size={20} color="#3B82F6" />
                </View>

                {/* Text */}
                <Pressable style={styles.textBlock} onPress={quotationId ? handleView : undefined}>
                    <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>
                        {title ?? 'Quotation Update'}
                    </Text>
                    <Text style={[styles.bodyText, { color: colors.textSecondary }]} numberOfLines={2}>
                        {body ?? ''}
                    </Text>
                </Pressable>

                {/* Actions */}
                <View style={styles.actions}>
                    {quotationId && (
                        <TouchableOpacity style={styles.viewBtn} onPress={handleView} activeOpacity={0.8}>
                            <Text style={styles.viewBtnText}>View</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
                        <Ionicons name="close" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    wrapper: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 9999,
    },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: 1,
        overflow: 'hidden',
        paddingVertical: 12,
        paddingRight: 12,
        gap: 10,
        ...Platform.select({
            ios: {
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 16,
            },
            android: { elevation: 12 },
        }),
    },
    accent: {
        width: 4,
        alignSelf: 'stretch',
        backgroundColor: '#3B82F6',
        borderRadius: 2,
        marginLeft: 0,
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    textBlock: {
        flex: 1,
        gap: 2,
    },
    titleText: {
        fontSize: 13.5,
        fontWeight: '800',
    },
    bodyText: {
        fontSize: 12,
        fontWeight: '500',
        lineHeight: 16,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewBtn: {
        backgroundColor: '#3B82F6',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    viewBtnText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '800',
    },
    closeBtn: {
        padding: 2,
    },
});
