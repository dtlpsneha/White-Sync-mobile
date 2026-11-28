/**
 * Team Chat — the office group, as the team knows it from WhatsApp, where every post is
 * also a job with a person and a status.
 *
 *   Chat     the group: every post, newest at the bottom, with the message box
 *   For me   open and given to me, oldest first (do the top one next)
 *   Open     everything still open, oldest first
 *   Sent     what I posted that is still open
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, AppState, FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Text,
    TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

import { DayDivider, JobBubble } from '@/components/team/Bubbles';
import { dayLabel, displayName, sameDay } from '@/components/team/chatUi';
import { Composer, ComposerChip } from '@/components/team/Composer';
import { JobRow } from '@/components/team/JobRow';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';
import { notificationService } from '@/services/NotificationService';
import { onSessionEnd } from '@/utils/sessionCache';
import { age, erpSession, Filing, Job, JobView, People, PickedFile, PickedVoice, team } from '@/services/teamApi';
import * as Notifications from 'expo-notifications';
import { isTeamAlert } from '@/utils/notificationTarget';

type Tab = 'chat' | 'mine' | 'open' | 'sent';
const TABS: { tab: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { tab: 'chat', label: 'Chat', icon: 'chatbubbles' },
    { tab: 'mine', label: 'For me', icon: 'person' },
    { tab: 'open', label: 'Open', icon: 'time' },
    { tab: 'sent', label: 'Sent', icon: 'paper-plane' },
];
const POLL_MS = 6000; // the chat checks for new posts this often while it is open
const SEEN_KEY = 'team_seen_mine';
/** Posts by the same person this close together sit under one name, as in WhatsApp. */
const GROUP_GAP_MS = 10 * 60 * 1000;

type ChatItem = { type: 'job'; job: Job; showAuthor: boolean } | { type: 'day'; key: string; label: string };

export default function TeamScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const { ms } = useResponsive();

    // My Orders' "Add LR": open the attach sheet with this invoice picked.
    const { lr, lrNumber } = useLocalSearchParams<{ lr?: string; lrNumber?: string }>();
    const startWith = useMemo<Filing | null>(
        () => (lr ? { doc_type: 'dispatch_lr', details: { invoices: String(lr), invoice_numbers: String(lrNumber || '') } } : null),
        [lr, lrNumber]);
    const [tab, setTab] = useState<Tab>('chat');
    const [chat, setChat] = useState<Job[]>([]);          // newest first
    const [older, setOlder] = useState<string | null>(null);
    const [list, setList] = useState<Job[]>([]);
    const [mine, setMine] = useState<Job[] | null>(null);
    const [people, setPeople] = useState<People | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const tabRef = useRef<Tab>('chat'); // the tab a poll that is already running should fill
    const chatRef = useRef<FlatList<ChatItem>>(null);
    const me = people?.me.id;

    // Bumped on login and logout: answers still on their way from the old session are dropped.
    const session = useRef(0);
    const [sessionTick, setSessionTick] = useState(0);

    const loadChat = useCallback(async () => {
        const gen = session.current;
        const r = await team.jobs('feed');
        if (gen !== session.current) return null;
        if (!r.ok) return r.error;
        const fresh = r.data.jobs;
        setChat(prev => mergeNewestFirst(fresh, prev));
        setOlder(o => o ?? (fresh.length ? r.data.next_before ?? fresh[fresh.length - 1].created_at : null));
        return null;
    }, []);

    const loadList = useCallback(async (which: Exclude<Tab, 'chat'>) => {
        const gen = session.current;
        const r = await team.jobs(which as JobView);
        if (gen !== session.current) return null;
        if (!r.ok) return r.error;
        if (tabRef.current === which) setList(r.data.jobs);
        return null;
    }, []);

    const loadMine = useCallback(async () => {
        const gen = session.current;
        const r = await team.jobs('mine');
        if (gen === session.current && r.ok) {
            setMine(r.data.jobs);
            await announceNew(r.data.jobs);
        }
    }, []);

    const refresh = useCallback(async () => {
        const which = tabRef.current;
        const [err] = await Promise.all([which === 'chat' ? loadChat() : loadList(which), loadMine()]);
        setError(err);
        setLoading(false);
        setRefreshing(false);
    }, [loadChat, loadList, loadMine]);

    // Who I am comes from the people list: loaded again for each session, never kept from the last one.
    useEffect(() => {
        const gen = session.current;
        team.people().then(r => { if (r.ok && gen === session.current) setPeople(r.data); });
    }, [sessionTick]);

    useEffect(() => onSessionEnd(() => {
        session.current += 1;
        setChat([]); setOlder(null); setList([]); setMine(null); setPeople(null); setError(null);
        setLoading(true);
        setSessionTick(t => t + 1);
    }), []);

    useFocusEffect(useCallback(() => {
        refresh();
        const timer = setInterval(refresh, POLL_MS);
        // A Team alert, or coming back to the app, refreshes at once instead of
        // waiting for the next check.
        const alerts = Notifications.addNotificationReceivedListener(n => {
            if (isTeamAlert(n.request.content.data)) refresh();
        });
        const app = AppState.addEventListener('change', s => { if (s === 'active') refresh(); });
        return () => { clearInterval(timer); alerts.remove(); app.remove(); };
    }, [refresh]));

    const switchTo = (t: Tab) => {
        if (t === tab) return;
        setTab(t);
        tabRef.current = t;
        if (t !== 'chat') { setList([]); setLoading(true); }
        refresh();
    };

    const loadOlderPosts = async () => {
        if (!older || loadingOlder) return;
        setLoadingOlder(true);
        const r = await team.jobs('feed', older);
        setLoadingOlder(false);
        if (!r.ok) return;
        const page = r.data.jobs;
        setChat(prev => mergeNewestFirst(prev, page));
        setOlder(page.length ? r.data.next_before ?? page[page.length - 1].created_at : null);
    };

    const post = async (text: string, file: PickedFile | null, voice?: PickedVoice | null, filing?: Filing | null) => {
        const r = await team.post(text, file, voice, filing);
        if (!r.ok) {
            Alert.alert('Not posted', r.error);
            return false;
        }
        setChat(prev => mergeNewestFirst([r.data.job], prev));
        chatRef.current?.scrollToOffset({ offset: 0, animated: true });
        return true;
    };

    const open = (id: string) => router.push({ pathname: '/team/[id]', params: { id } });

    /** Hold my own post: delete it for everyone (it stays as "Message deleted"). */
    const askDelete = (job: Job) => Alert.alert('Delete message?',
        'It is deleted for everyone and the job is cancelled. Replies stay.', [
        { text: 'Cancel', style: 'cancel' },
        {
            text: 'Delete', style: 'destructive', onPress: async () => {
                const r = await team.deletePost(job.id);
                if (!r.ok) { Alert.alert('Not deleted', r.error); return; }
                setChat(prev => mergeNewestFirst([r.data.job], prev));
                loadMine();
            },
        },
    ]);

    const items = useMemo(() => chatItems(chat), [chat]);

    const chips: ComposerChip[] = useMemo(() => (people?.people ?? [])
        .filter(p => p.id !== me)
        .map(p => {
            const first = displayName(p.name).split(' ')[0];
            return { label: `@${first}`, insert: `${first}, ` };
        }), [people, me]);

    const waiting = mine?.length ?? 0;
    const oldest = mine && mine.length ? Math.max(...mine.map(j => j.age_minutes)) : 0;

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Team Chat"
                subtitle={people ? `${people.people.length} people · ${waiting ? `${waiting} waiting for you` : 'nothing waiting for you'}` : 'Office team'}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
                rightIcon="folder-open-outline"
                onRightPress={() => router.push('/team/documents')}
            >
                <View style={[styles.tabs, { backgroundColor: colors.ink2 }]}>
                    {TABS.map(t => {
                        const active = t.tab === tab;
                        const count = t.tab === 'mine' && waiting ? waiting : null;
                        return (
                            <TouchableOpacity key={t.tab} onPress={() => switchTo(t.tab)} activeOpacity={0.8}
                                style={[styles.tab, active && { backgroundColor: '#FFF' }]}>
                                <Text style={[styles.tabText, { color: active ? '#1F2421' : colors.onInk, fontSize: ms(12.5) }]}>{t.label}</Text>
                                {count !== null && (
                                    <View style={[styles.count, { backgroundColor: colors.primary }]}>
                                        <Text style={[styles.countText, { color: '#FFF' }]}>{count}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScreenHeader>

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={() => { setLoading(true); refresh(); }}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : tab === 'chat' ? (
                <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                    {waiting > 0 && (
                        <TouchableOpacity onPress={() => switchTo('mine')} activeOpacity={0.85}
                            style={[styles.banner, { backgroundColor: colors.primarySoft, borderColor: `${colors.primary}40` }]}>
                            <Ionicons name="flag" size={16} color={colors.primary} />
                            <Text style={[styles.bannerText, { color: colors.primaryVariant }]} numberOfLines={1}>
                                {waiting === 1 ? '1 job is waiting for you' : `${waiting} jobs are waiting for you`} · oldest {age(oldest)}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                        </TouchableOpacity>
                    )}
                    {loading ? (
                        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
                    ) : items.length === 0 ? (
                        <EmptyChat colors={colors} />
                    ) : (
                        <FlatList
                            ref={chatRef}
                            inverted
                            data={items}
                            keyExtractor={i => (i.type === 'job' ? i.job.id : i.key)}
                            renderItem={({ item }) => item.type === 'day'
                                ? <DayDivider label={item.label} colors={colors} />
                                : <JobBubble job={item.job} mine={item.job.author.id === me} showAuthor={item.showAuthor}
                                    meId={me} theme={theme} colors={colors} onPress={() => open(item.job.id)}
                                    onLongPress={item.job.author.id === me && !item.job.deleted ? () => askDelete(item.job) : undefined} />}
                            contentContainerStyle={{ paddingVertical: 10 }}
                            onEndReached={loadOlderPosts}
                            onEndReachedThreshold={0.4}
                            ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
                            keyboardShouldPersistTaps="handled"
                        />
                    )}
                    <Composer
                        onSend={post}
                        startWith={startWith}
                        onStarted={() => router.setParams({ lr: undefined, lrNumber: undefined } as any)}
                        placeholder="Name, then what's needed…"
                        chips={chips}
                        chipsTitle="To:"
                    />
                </KeyboardAvoidingView>
            ) : (
                <FlatList
                    data={list}
                    keyExtractor={j => j.id}
                    renderItem={({ item }) => <JobRow job={item} meId={me} colors={colors} onPress={() => open(item.id)} />}
                    contentContainerStyle={{ paddingVertical: 10, flexGrow: 1 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refresh(); }} />}
                    ListEmptyComponent={loading
                        ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
                        : <EmptyList tab={tab} colors={colors} onChat={() => switchTo('chat')} />}
                />
            )}
        </View>
    );
}

function EmptyChat({ colors }: { colors: typeof Colors.light }) {
    return (
        <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="chatbubbles" size={34} color={colors.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>Post the first job</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {'Start with the person\'s name and say what is needed — "Ravi, kindly send the pro-forma to …". Add a photo of the PO with the camera. SmartOps works out the job and who it is for.'}
            </Text>
        </View>
    );
}

function EmptyList({ tab, colors, onChat }: { tab: Tab; colors: typeof Colors.light; onChat: () => void }) {
    const text = tab === 'mine' ? 'Nothing is waiting for you.' : tab === 'sent' ? 'Nothing you posted is still open.' : 'No open jobs.';
    return (
        <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.success}22` }]}>
                <Ionicons name="checkmark-done" size={34} color={colors.success} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{text}</Text>
            <TouchableOpacity onPress={onChat} style={[styles.emptyBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontWeight: '800' }}>Go to the chat</Text>
            </TouchableOpacity>
        </View>
    );
}

/** Newest first, no duplicates; a job in `a` wins over the same job in `b` (it is fresher). */
/**
 * `a` is the newest page from the server, `b` what is on screen (it may hold older pages).
 * Posts in the newest page's time window that the server no longer sends were deleted, so
 * they go; older posts (outside that window) stay. `complete` = the server sent everything.
 */
function mergeNewestFirst(a: Job[], b: Job[], complete = false): Job[] {
    const fresh = new Set(a.map(j => j.id));
    const oldest = a.length ? a[a.length - 1].created_at : null;
    const byId = new Map<string, Job>();
    for (const j of b) {
        const inWindow = complete || (oldest !== null && j.created_at >= oldest) || a.length === 0;
        if (inWindow && !fresh.has(j.id)) continue; // deleted on the server
        byId.set(j.id, j);
    }
    for (const j of a) byId.set(j.id, j);
    return [...byId.values()].sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
}

/** The inverted list's rows: posts newest first, a day label after each day's oldest post. */
function chatItems(jobs: Job[]): ChatItem[] {
    const items: ChatItem[] = [];
    jobs.forEach((job, i) => {
        const prev = jobs[i + 1]; // the post just before it in time
        const grouped = !!prev && prev.author.id === job.author.id && sameDay(prev.created_at, job.created_at)
            && new Date(job.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
        items.push({ type: 'job', job, showAuthor: !grouped });
        if (!prev || !sameDay(prev.created_at, job.created_at)) {
            items.push({ type: 'day', key: `day-${job.created_at.slice(0, 10)}-${job.id}`, label: dayLabel(job.created_at) });
        }
    });
    return items;
}

/**
 * A local alert for each job newly given to me since the list was last read — covers the
 * app being open or in the background. What has been seen is kept per ERPNext session, so a
 * different person logging in on this phone is not alerted to someone else's backlog.
 */
async function announceNew(mineJobs: Job[]): Promise<void> {
    try {
        const [raw, sid] = await Promise.all([SecureStore.getItemAsync(SEEN_KEY), erpSession()]);
        const ids = mineJobs.map(j => j.id);
        const kept = parseSeen(raw);
        if (!kept || kept.sid !== sid) { // first look for this login: remember, do not announce the backlog
            await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify({ sid, ids }));
            return;
        }
        const seen = new Set<string>(kept.ids);
        for (const job of mineJobs.filter(j => !seen.has(j.id))) {
            await notificationService.postLocalNotification(
                `${job.kind_label} — from ${displayName(job.author.name)}`,
                job.body || job.customer_hint || 'A new job for you', { teamJobId: job.id });
        }
        await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify({ sid, ids: ids.slice(0, 200) }));
    } catch {
        // an alert that could not be shown is not a reason to break the list
    }
}

function parseSeen(raw: string | null): { sid: string | null; ids: string[] } | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw);
        return v && Array.isArray(v.ids) ? v : null;
    } catch {
        return null;
    }
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabs: { flexDirection: 'row', borderRadius: 14, padding: 4, marginTop: 4, gap: 4 },
    tab: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
        paddingVertical: 8, borderRadius: 10,
    },
    tabText: { fontWeight: '700' },
    count: { minWidth: 18, height: 17, borderRadius: 9, paddingHorizontal: 5, justifyContent: 'center', alignItems: 'center' },
    countText: { fontSize: 10, fontWeight: '800' },
    banner: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 10,
        paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1,
    },
    bannerText: { flex: 1, fontSize: 13.5, fontWeight: '800' },
    notice: { margin: 16, padding: 16, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12, paddingVertical: 40 },
    emptyIcon: { width: 76, height: 76, borderRadius: 38, justifyContent: 'center', alignItems: 'center' },
    emptyTitle: { fontSize: 18, fontWeight: '900', textAlign: 'center' },
    emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', fontWeight: '500' },
    emptyBtn: { borderWidth: 1.5, borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 9, marginTop: 4 },
});
