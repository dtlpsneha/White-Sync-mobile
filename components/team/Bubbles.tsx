/**
 * Chat bubbles for Team: a post in the group (a job), a reply in a job's thread, a note
 * from SmartOps, and the day divider between them. Mine on the right, others on the left
 * with their name in their own colour -- the WhatsApp layout the office already reads.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius } from '@/constants/theme';
import { age, Attachment, Job, KIND_ICONS, Reply, SMARTOPS_ICON } from '@/services/teamApi';
import { Avatar } from './Avatar';
import { displayName, docTint, kindTint, personColor, SMARTOPS_GREEN, timeOnly } from './chatUi';
import { readLine, TeamImage } from './TeamImage';
import { VoiceNote } from './VoiceNote';

type ThemeColors = typeof Colors.light;

const MINE_BG = { light: '#F7E3D6', dark: '#4A2C20' };
const SMARTOPS_BG = { light: '#E3F0EA', dark: '#173A2E' };
const SMARTOPS_EDGE = { light: '#BFD9CC', dark: '#2F5D50' };

function useBubbleWidth() {
    const { width } = useWindowDimensions();
    return Math.min(width * 0.78, width >= 600 ? 480 : 340);
}

function Shell({ mine, showAuthor, authorName, theme, colors, children, onPress, onLongPress, highlight, smartops }: {
    mine: boolean; showAuthor: boolean; authorName?: string | null; theme: 'light' | 'dark';
    colors: ThemeColors; children: React.ReactNode; onPress?: () => void; onLongPress?: () => void;
    highlight?: string; smartops?: boolean;
}) {
    const maxWidth = useBubbleWidth();
    const body = (
        <View style={[styles.bubble, {
            maxWidth,
            backgroundColor: mine ? MINE_BG[theme] : smartops ? SMARTOPS_BG[theme] : colors.surface,
            borderColor: highlight ?? (mine ? 'transparent' : smartops ? SMARTOPS_EDGE[theme] : 'transparent'),
            borderWidth: highlight ? 1.5 : smartops ? 1 : 0,
        }, mine ? styles.mine : styles.theirs, showAuthor && (mine ? styles.mineFirst : styles.theirsFirst)]}>
            {!mine && showAuthor && (
                <Text style={[styles.author, { color: smartops ? SMARTOPS_GREEN : personColor(authorName) }]} numberOfLines={1}>{displayName(authorName)}</Text>
            )}
            {children}
        </View>
    );
    return (
        <View style={[styles.line, mine ? styles.lineMine : styles.lineTheirs, showAuthor && styles.lineFirst]}>
            {!mine && (showAuthor ? <Avatar name={authorName} size={32} smartops={smartops} /> : <View style={{ width: 32 }} />)}
            {onPress || onLongPress
                ? <TouchableOpacity activeOpacity={0.85} onPress={onPress} onLongPress={onLongPress} delayLongPress={350}>{body}</TouchableOpacity>
                : body}
        </View>
    );
}

function Meta({ time, colors, status }: { time: string; colors: ThemeColors; status?: 'open' | 'done' | 'cancelled' }) {
    return (
        <View style={styles.meta}>
            <Text style={[styles.time, { color: colors.textSecondary }]}>{timeOnly(time)}</Text>
            {status === 'open' && <Ionicons name="time-outline" size={14} color={colors.warning} />}
            {status === 'done' && <Ionicons name="checkmark-done" size={16} color={colors.success} />}
            {status === 'cancelled' && <Ionicons name="close-circle-outline" size={14} color={colors.textSecondary} />}
        </View>
    );
}

/** What is left of a deleted message. */
function Deleted({ colors }: { colors: ThemeColors }) {
    return (
        <View style={styles.deleted}>
            <Ionicons name="ban-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.deletedText, { color: colors.textSecondary }]}>Message deleted</Text>
        </View>
    );
}

/** The job's type, who it is for, and where it stands -- the line a WhatsApp post never had. */
export function JobTag({ job, colors, meId, onKind, onAssignee }: {
    job: Job; colors: ThemeColors; meId?: string; onKind?: () => void; onAssignee?: () => void;
}) {
    const tint = kindTint(job.kind, job.by_smartops);
    const forMe = !!meId && job.assignee?.id === meId;
    const late = job.status === 'open' && job.age_minutes >= 24 * 60;
    const Kind = onKind ? TouchableOpacity : View;
    const Who = onAssignee ? TouchableOpacity : View;
    return (
        <View style={styles.tagRow}>
            <Kind onPress={onKind} style={[styles.tag, { backgroundColor: `${tint}1F`, borderColor: `${tint}55` }]}>
                <Ionicons name={(job.by_smartops ? SMARTOPS_ICON : KIND_ICONS[job.kind]) as any} size={13} color={tint} />
                <Text style={[styles.tagText, { color: tint }]}>{job.kind_label}{job.kind_suggested ? ' ?' : ''}</Text>
                {onKind && <Ionicons name="chevron-down" size={12} color={tint} />}
            </Kind>
            <Who onPress={onAssignee} style={[styles.tag, {
                backgroundColor: forMe ? `${colors.primary}1F` : colors.surfaceSecondary,
                borderColor: forMe ? `${colors.primary}55` : 'transparent',
            }]}>
                <Ionicons name="arrow-forward" size={12} color={forMe ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tagText, { color: forMe ? colors.primary : colors.textSecondary }]} numberOfLines={1}>
                    {forMe ? 'You' : job.assignee ? displayName(job.assignee.name) : 'Choose who'}
                </Text>
                {onAssignee && <Ionicons name="chevron-down" size={12} color={forMe ? colors.primary : colors.textSecondary} />}
            </Who>
            {job.status === 'open' ? (
                <Text style={[styles.state, { color: late ? colors.danger : colors.warning }]}>⏱ {age(job.age_minutes)}</Text>
            ) : job.status === 'done' ? (
                <Text style={[styles.state, { color: colors.success }]}>
                    ✓ Done{job.done_by ? ` · ${displayName(job.done_by.name)}` : ''}
                </Text>
            ) : (
                <Text style={[styles.state, { color: colors.textSecondary }]}>Cancelled</Text>
            )}
        </View>
    );
}

/** A post in the group chat. Tapping it opens the job's thread; holding it offers Delete. */
export function JobBubble({ job, mine, showAuthor, meId, theme, colors, onPress, onLongPress }: {
    job: Job; mine: boolean; showAuthor: boolean; meId?: string; theme: 'light' | 'dark';
    colors: ThemeColors; onPress: () => void; onLongPress?: () => void;
}) {
    const width = useBubbleWidth() - 27;
    const forMe = !!meId && job.assignee?.id === meId && job.status === 'open';
    const customer = job.customer_name || job.customer_hint;
    if (job.deleted) {
        return (
            <Shell mine={mine} showAuthor={showAuthor} authorName={job.author.name} theme={theme} colors={colors}
                onPress={job.replies ? onPress : undefined}>
                <Deleted colors={colors} />
                <View style={styles.footer}>
                    {job.replies
                        ? <Text style={[styles.repliesText, { color: colors.primary }]}>{job.replies === 1 ? '1 reply' : `${job.replies} replies`}</Text>
                        : <View />}
                    <Meta time={job.created_at} colors={colors} />
                </View>
            </Shell>
        );
    }
    return (
        <Shell mine={mine} showAuthor={showAuthor} authorName={job.author.name} theme={theme} colors={colors}
            onPress={onPress} onLongPress={onLongPress} highlight={forMe ? colors.primary : undefined}
            smartops={job.by_smartops}>
            {!!job.attachment && (
                <View style={{ gap: 4 }}>
                    <TeamImage a={job.attachment} colors={colors} width={width} />
                    <FiledAs a={job.attachment} colors={colors} />
                    {!!readLine(job.attachment) && (
                        <Text style={[styles.read, { color: job.attachment.read_failed ? colors.warning : colors.textSecondary }]}>
                            {readLine(job.attachment)}{job.attachment.read_failed ? ' — open the job to try again' : ''}
                        </Text>
                    )}
                </View>
            )}
            {!!job.voice && <VoiceNote voice={job.voice} colors={colors} tint={colors.primary} />}
            {!!job.body && (
                <Text style={[styles.body, { color: colors.text, opacity: job.status === 'cancelled' ? 0.55 : 1 }]}>{job.body}</Text>
            )}
            <JobTag job={job} colors={colors} meId={meId} />
            {(!!customer || !!job.erpnext_name) && (
                <Text style={[styles.facts, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[customer, job.principal, job.erpnext_name].filter(Boolean).join(' · ')}
                </Text>
            )}
            <View style={styles.footer}>
                <View style={styles.replies}>
                    <Ionicons name="chatbubbles-outline" size={14} color={colors.primary} />
                    <Text style={[styles.repliesText, { color: colors.primary }]}>
                        {job.replies === 0 ? 'Reply' : job.replies === 1 ? '1 reply' : `${job.replies} replies`}
                    </Text>
                </View>
                <Meta time={job.created_at} colors={colors} status={job.status} />
            </View>
        </Shell>
    );
}

/** One message in a job's thread. A reply with no author is SmartOps itself. */
export function ReplyBubble({ reply, mine, showAuthor, theme, colors, onRetryRead, retrying, onLongPress }: {
    reply: Reply; mine: boolean; showAuthor: boolean; theme: 'light' | 'dark'; colors: ThemeColors;
    /** Offered under a photo/PDF whose read failed. */
    onRetryRead?: (documentId: string) => void; retrying?: boolean;
    /** Holding my own message offers Delete. */
    onLongPress?: () => void;
}) {
    const width = useBubbleWidth() - 27;
    if (!reply.author) return <SystemNote text={reply.body} colors={colors} />;
    if (reply.deleted) {
        return (
            <Shell mine={mine} showAuthor={showAuthor} authorName={reply.author.name} theme={theme} colors={colors}>
                <Deleted colors={colors} />
                <View style={styles.footer}><View /><Meta time={reply.created_at} colors={colors} /></View>
            </Shell>
        );
    }
    return (
        <Shell mine={mine} showAuthor={showAuthor} authorName={reply.author.name} theme={theme} colors={colors}
            onLongPress={onLongPress}>
            {!!reply.attachment && <TeamImage a={reply.attachment} colors={colors} width={width} />}
            {!!reply.attachment && <FiledAs a={reply.attachment} colors={colors} />}
            {!!reply.attachment && <ReadState a={reply.attachment} colors={colors} onRetry={onRetryRead} retrying={retrying} />}
            {!!reply.voice && <VoiceNote voice={reply.voice} colors={colors} tint={colors.primary} />}
            {!!reply.body && <Text style={[styles.body, { color: colors.text }]}>{reply.body}</Text>}
            <View style={styles.footer}>
                {reply.closed_job
                    ? <Text style={[styles.closed, { color: colors.success }]}>✓ closed the job</Text>
                    : <View />}
                <Meta time={reply.created_at} colors={colors} />
            </View>
        </Shell>
    );
}

/** What the person who posted the file said it is: "Customer PO · Demo Mills · PO-77". */
export function filedLine(a: Attachment): string | null {
    if (!a.doc_type) return null;
    const d = a.doc_details || {};
    const party = d.customer || d.supplier;
    const ref = d.po_no || d.invoice_no || d.quotation_no || d.utr || d.lr_no || d.dc_no;
    const invoices = d.invoice_numbers ? `Inv ${d.invoice_numbers}` : '';
    return [a.doc_type_label || a.doc_type, party, ref, invoices, d.description].filter(Boolean).join(' · ');
}

function FiledAs({ a, colors }: { a: Attachment; colors: ThemeColors }) {
    const line = filedLine(a);
    if (!line) return null;
    const tint = docTint(a.doc_type);
    return (
        <View style={[styles.filed, { backgroundColor: `${tint}1F` }]}>
            <Ionicons name="pricetag" size={12} color={tint} />
            <Text style={[styles.filedText, { color: tint }]} numberOfLines={2}>{line}</Text>
        </View>
    );
}

/** What SmartOps made of a photo/PDF, and — when the read failed — a way to try again. */
function ReadState({ a, colors, onRetry, retrying }: {
    a: Attachment; colors: ThemeColors; onRetry?: (documentId: string) => void; retrying?: boolean;
}) {
    const line = readLine(a);
    if (!line) return null;
    if (!a.read_failed || !onRetry) {
        return <Text style={[styles.read, { color: a.read_failed ? colors.warning : colors.textSecondary }]}>{line}</Text>;
    }
    return (
        <TouchableOpacity disabled={retrying} onPress={() => onRetry(a.document_id)} activeOpacity={0.8}
            style={[styles.retry, { borderColor: `${colors.warning}66`, backgroundColor: `${colors.warning}14` }]}>
            {retrying
                ? <ActivityIndicator size="small" color={colors.warning} />
                : <Ionicons name="refresh" size={15} color={colors.warning} />}
            <Text style={[styles.retryText, { color: colors.warning }]}>
                {retrying ? 'Reading it again…' : "Couldn't read it — try again"}
            </Text>
        </TouchableOpacity>
    );
}

export function SystemNote({ text, colors }: { text: string; colors: ThemeColors }) {
    return (
        <View style={[styles.system, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="sparkles" size={13} color={colors.primary} />
            <Text style={[styles.systemText, { color: colors.textSecondary }]}>{text}</Text>
        </View>
    );
}

export function DayDivider({ label, colors }: { label: string; colors: ThemeColors }) {
    return (
        <View style={styles.dayWrap}>
            <Text style={[styles.day, { backgroundColor: colors.surfaceVariant, color: colors.textSecondary }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    line: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, marginTop: 3 },
    lineFirst: { marginTop: 10 },
    lineMine: { justifyContent: 'flex-end' },
    lineTheirs: { justifyContent: 'flex-start' },
    bubble: {
        borderRadius: 18, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 7,
        shadowColor: '#1F2421', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    mine: { borderBottomRightRadius: 6 },
    theirs: { borderBottomLeftRadius: 6 },
    mineFirst: {},
    theirsFirst: {},
    author: { fontSize: 12, fontWeight: '800', marginBottom: -3 },
    body: { fontSize: 14.5, lineHeight: 20 },
    deleted: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2, paddingVertical: 2 },
    deletedText: { fontSize: 14.5, fontStyle: 'italic' },
    read: { fontSize: 11.5, fontWeight: '600', paddingHorizontal: 2 },
    filed: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
    filedText: { fontSize: 12, fontWeight: '800', flexShrink: 1 },
    facts: { fontSize: 12, fontWeight: '600', paddingHorizontal: 2 },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
    tag: {
        flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.pill, borderWidth: 1,
        paddingHorizontal: 9, paddingVertical: 4, maxWidth: 190,
    },
    tagText: { fontSize: 12, fontWeight: '800' },
    state: { fontSize: 12, fontWeight: '800' },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 2 },
    replies: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    repliesText: { fontSize: 12.5, fontWeight: '800' },
    closed: { fontSize: 12, fontWeight: '800' },
    retry: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1,
        borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6,
    },
    retryText: { fontSize: 12.5, fontWeight: '800' },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
    time: { fontSize: 11, fontWeight: '600' },
    system: {
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', maxWidth: '88%',
        borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 7, marginVertical: 8,
    },
    systemText: { fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
    dayWrap: { alignItems: 'center', marginVertical: 10 },
    day: {
        fontSize: 11, fontWeight: '700', paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radius.pill,
        overflow: 'hidden',
    },
});
