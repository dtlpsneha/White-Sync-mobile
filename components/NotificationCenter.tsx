import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import Animated from 'react-native-reanimated';
import { Colors, Radius, Shadow, toneFor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { InkTile } from '@/components/ui/Midnight';
import { enterRow } from '@/constants/motion';
import { isTeamAlert } from '@/utils/notificationTarget';
import type { PersistentNotification } from '@/context/NotificationsContext';

interface NotificationCenterProps {
    notifications: PersistentNotification[];
    onMarkRead: (id: string) => void;
    /** Kept for callers; clearing now lives in the screen header (with a confirmation). */
    onClearAll?: () => void;
    onNotificationTap?: (notification: PersistentNotification) => void;
}

/** What kind of alert this is: drives the icon, its colour and the small label. */
export function notificationKind(n: Pick<PersistentNotification, 'data'>) {
    if (isTeamAlert(n.data)) return { label: 'Team Chat', icon: 'chatbubbles' as const, tint: '#2F7D5B' };
    const id = (n.data as { id?: unknown } | undefined)?.id;
    if (typeof id === 'string' && id) return { label: 'Quotation', icon: 'document-text' as const, tint: '#D99A14' };
    return { label: 'Update', icon: 'notifications' as const, tint: '#E4572E' };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(ts: number): string {
    const d = new Date(ts);
    const today = new Date();
    const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((start(today) - start(d)) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return 'Earlier';
}

function timeLabel(ts: number): string {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    const d = new Date(ts);
    return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

type Row = { kind: 'day'; key: string; label: string } | { kind: 'item'; key: string; item: PersistentNotification; index: number };

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    notifications,
    onMarkRead,
    onNotificationTap,
}) => {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const { ms } = useResponsive();
    const styles = useMemo(() => getStyles(theme, ms), [theme, ms]);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');

    const unread = notifications.filter(n => !n.read);
    const shown = filter === 'unread' ? unread : notifications;

    // Day labels (Today / Yesterday / Earlier) between the rows, like Team Chat.
    const rows = useMemo(() => {
        const out: Row[] = [];
        let last = '';
        shown.forEach((item, index) => {
            const label = dayLabel(item.timestamp);
            if (label !== last) {
                out.push({ kind: 'day', key: `day-${label}`, label });
                last = label;
            }
            out.push({ kind: 'item', key: item.id, item, index });
        });
        return out;
    }, [shown]);

    const chips = (
        <View style={styles.toolbar}>
            {(['all', 'unread'] as const).map(f => {
                const on = filter === f;
                const count = f === 'all' ? notifications.length : unread.length;
                return (
                    <TouchableOpacity key={f} onPress={() => setFilter(f)} activeOpacity={0.85} style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {f === 'all' ? 'All' : 'Unread'} <Text style={styles.chipCount}>{count}</Text>
                        </Text>
                    </TouchableOpacity>
                );
            })}
            <View style={{ flex: 1 }} />
            {unread.length > 0 ? (
                <TouchableOpacity onPress={() => unread.forEach(n => onMarkRead(n.id))} hitSlop={8}>
                    <Text style={styles.markAll}>Mark all read</Text>
                </TouchableOpacity>
            ) : null}
        </View>
    );

    if (shown.length === 0) {
        return (
            <View style={styles.container}>
                {notifications.length > 0 ? chips : null}
                <View style={styles.empty}>
                    <InkTile icon="notifications-off-outline" size={64} />
                    <Text style={styles.emptyTitle}>{notifications.length ? 'No unread notifications' : "You're all caught up"}</Text>
                    <Text style={styles.emptyText}>New quotation and Team Chat alerts will show here.</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {chips}
            <FlatList
                data={rows}
                keyExtractor={r => r.key}
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: r }) => {
                    if (r.kind === 'day') {
                        return <Text style={styles.day}>{r.label}</Text>;
                    }
                    const n = r.item;
                    const kind = notificationKind(n);
                    const tint = toneFor(theme, kind.tint);
                    return (
                        <Animated.View entering={enterRow(r.index)}>
                            <TouchableOpacity
                                onPress={() => {
                                    onMarkRead(n.id);
                                    onNotificationTap?.(n);
                                }}
                                activeOpacity={0.8}
                                style={[styles.row, Shadow.card(theme)]}
                            >
                                <View style={[styles.edge, { backgroundColor: n.read ? colors.border : colors.primary }]} />
                                <InkTile icon={kind.icon} size={40} color={tint} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <View style={styles.titleRow}>
                                        <Text style={[styles.title, n.read && styles.titleRead]} numberOfLines={2}>{n.title}</Text>
                                        {!n.read ? <View style={styles.dot} /> : null}
                                    </View>
                                    {n.body ? <Text style={styles.body} numberOfLines={2}>{n.body}</Text> : null}
                                    <Text style={styles.meta}>
                                        <Text style={{ color: tint, fontWeight: '800' }}>{kind.label}</Text>  ·  {timeLabel(n.timestamp)}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>
                    );
                }}
            />
        </View>
    );
};

function getStyles(theme: 'light' | 'dark', ms: (n: number) => number) {
    const c = Colors[theme];
    return StyleSheet.create({
        container: { flex: 1, backgroundColor: c.background },
        toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
        chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: Radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
        chipOn: { backgroundColor: c.ink, borderColor: c.ink },
        chipText: { color: c.text, fontWeight: '700', fontSize: 12.5 },
        chipTextOn: { color: '#FFF' },
        chipCount: { fontWeight: '800', opacity: 0.6 },
        markAll: { color: c.primaryVariant, fontWeight: '800', fontSize: 12.5 },
        list: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 40, gap: 10 },
        day: {
            alignSelf: 'center',
            fontSize: 11,
            fontWeight: '700',
            color: c.textSecondary,
            backgroundColor: c.surfaceVariant,
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: Radius.pill,
            overflow: 'hidden',
            marginTop: 6,
        },
        row: {
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            backgroundColor: c.surface,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderColor: c.border,
            paddingVertical: 14,
            paddingLeft: 16,
            paddingRight: 14,
            overflow: 'hidden',
        },
        edge: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
        titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
        title: { flex: 1, fontSize: ms(14.5), fontWeight: '800', color: c.text },
        titleRead: { fontWeight: '700', color: c.textSecondary },
        dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, marginTop: 5 },
        body: { fontSize: ms(13), color: c.textSecondary, marginTop: 3, lineHeight: ms(18) },
        meta: { fontSize: 11.5, color: c.textSecondary, marginTop: 6 },
        empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32, paddingBottom: 60 },
        emptyTitle: { fontSize: ms(16), fontWeight: '800', color: c.text, marginTop: 6 },
        emptyText: { fontSize: ms(13), color: c.textSecondary, textAlign: 'center' },
    });
}
