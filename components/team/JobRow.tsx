/**
 * One job in the To-do lists (For me / Open / Sent), laid out like a row in WhatsApp's chat
 * list: who, what, the last line, and on the right how long it has waited.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius } from '@/constants/theme';
import { age, Job, KIND_COLORS, KIND_ICONS, SMARTOPS_ICON, SMARTOPS_TINT } from '@/services/teamApi';
import { Avatar } from './Avatar';
import { displayName } from './chatUi';

export function JobRow({ job, meId, colors, onPress }: {
    job: Job; meId?: string; colors: typeof Colors.light; onPress: () => void;
}) {
    const tint = job.by_smartops ? SMARTOPS_TINT : KIND_COLORS[job.kind];
    const late = job.status === 'open' && job.age_minutes >= 24 * 60;
    const fromMe = job.author.id === meId;
    const toMe = job.assignee?.id === meId;
    const who = `${fromMe ? 'You' : displayName(job.author.name)} → ${toMe ? 'you' : job.assignee ? displayName(job.assignee.name) : 'nobody yet'}`;
    const line = job.body || job.customer_name || job.customer_hint || (job.attachment ? '📷 Photo' : '');

    return (
        <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.row}>
            <View>
                <Avatar name={fromMe ? job.assignee?.name : job.author.name} size={48}
                    smartops={!fromMe && !!job.by_smartops} />
                <View style={[styles.kindDot, { backgroundColor: tint, borderColor: colors.background }]}>
                    <Ionicons name={(job.by_smartops ? SMARTOPS_ICON : KIND_ICONS[job.kind]) as any} size={11} color="#FFF" />
                </View>
            </View>
            <View style={[styles.main, { borderBottomColor: colors.border }]}>
                <View style={styles.top}>
                    <Text style={[styles.who, { color: colors.text }]} numberOfLines={1}>{who}</Text>
                    <Text style={[styles.age, { color: late ? colors.danger : colors.textSecondary }]}>{age(job.age_minutes)}</Text>
                </View>
                <View style={styles.bottom}>
                    <View style={{ flex: 1 }}>
                        <Text style={[styles.kind, { color: tint }]} numberOfLines={1}>
                            {job.kind_label}{job.kind_suggested ? ' ?' : ''}
                            {job.principal ? `  ·  ${job.principal}` : ''}
                        </Text>
                        {!!line && <Text style={[styles.line, { color: colors.textSecondary }]} numberOfLines={1}>{line}</Text>}
                    </View>
                    {job.replies > 0 && (
                        <View style={[styles.badge, { backgroundColor: toMe ? colors.primary : colors.surfaceVariant }]}>
                            <Text style={[styles.badgeText, { color: toMe ? '#FFF' : colors.textSecondary }]}>{job.replies}</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14 },
    kindDot: {
        position: 'absolute', right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11, borderWidth: 2,
        justifyContent: 'center', alignItems: 'center',
    },
    main: { flex: 1, paddingVertical: 12, paddingRight: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 3 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    who: { flex: 1, fontSize: 16, fontWeight: '800' },
    age: { fontSize: 12, fontWeight: '700' },
    bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    kind: { fontSize: 13, fontWeight: '800' },
    line: { fontSize: 14, marginTop: 1 },
    badge: { minWidth: 22, height: 22, borderRadius: Radius.pill, paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
    badgeText: { fontSize: 12, fontWeight: '800' },
});
