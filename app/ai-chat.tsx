/**
 * ai-chat.tsx — the SmartOps AI assistant.
 *
 * Talks to SmartOps, NOT to ERPNext like every other screen in this app — see
 * `services/smartopsApi.ts` for why that's a separate client, and why it runs without a
 * SmartOps sign-in.
 *
 * Opens in one of two modes:
 *   - **Blank** (the Home screen's floating bubble). No customer, no suggested prompts —
 *     just a composer. Suggestions there were noise: they assume a customer is already
 *     attached, which at that point is exactly what isn't true.
 *   - **Customer-scoped** (Customer 360's "Ask AI about this customer"). Arrives with
 *     customer params, opens a NEW session pointed at that customer, and offers prompts
 *     that are actually answerable for them.
 *
 * Either way, typing "/" mid-conversation switches the composer into customer lookup.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatHistorySheet } from '@/components/ChatHistorySheet';
import { CustomerSearchResults, initials, useCustomerSearch } from '@/components/CustomerSearch';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    chatErrorMessage,
    fetchChat,
    sendChatMessage,
    setChatCustomer,
    type ChatMessage,
    type ChatOut,
    type ChatStep,
    type InvoiceSummary,
    type QuoteSummary,
} from '@/services/smartopsApi';

/** Only shown once a customer is attached — each maps onto a `crm.customer.*` read the
 * agent can actually answer for that specific customer. With nobody attached there is
 * no useful equivalent, which is why the blank chat offers none at all. */
const CUSTOMER_PROMPTS = [
    'Show customer details',
    'Show pending invoices',
    'Show recent quotes',
    'Show recent transactions',
    "Who's handling this customer?",
];

/** Quotes/invoices carry ALREADY-DIVIDED rupee floats — a backend quirk, so no rescale. */
function money(rupeeValue: number | null): string {
    if (rupeeValue === null || rupeeValue === undefined) return '-';
    return `₹${rupeeValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** True once a due date has passed. Compared against the START of today, so something
 * due today doesn't flip to overdue partway through the day. */
function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function AiChatScreen() {
    const router = useRouter();
    const { customerId, customerName, customerSource } = useLocalSearchParams<{
        customerId?: string;
        customerName?: string;
        customerSource?: string;
    }>();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [data, setData] = useState<ChatOut | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [composerText, setComposerText] = useState('');
    const [sending, setSending] = useState(false);
    const [composerError, setComposerError] = useState<string | null>(null);
    const [attaching, setAttaching] = useState(false);

    const [historyOpen, setHistoryOpen] = useState(false);

    // "/" mode: everything after the slash is the customer query, searched live.
    const slashMode = composerText.startsWith('/');
    const slashQuery = slashMode ? composerText.slice(1) : '';
    const searchState = useCustomerSearch(slashQuery);

    const activeCustomer = data?.active_customer ?? null;
    // Seeded from the route param so the chip is right on the very first frame, before
    // the session that names the customer has come back. Held as state rather than read
    // from the param directly so "New chat" can clear it — the param never changes.
    const [pendingCustomerName, setPendingCustomerName] = useState<string | null>(
        customerName ?? null,
    );
    const chipName = activeCustomer?.name ?? pendingCustomerName;

    // Guards the mount effect from re-firing: params are stable, but a re-render must not
    // spawn a second session for the same customer.
    const attachedCustomerId = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        if (customerId && attachedCustomerId.current !== customerId) {
            attachedCustomerId.current = customerId;
            // '' — deliberately NOT the current session. "Ask AI about this customer"
            // means a NEW conversation about them, never re-pointing a thread that was
            // about somebody else.
            setChatCustomer(customerId, customerName ?? 'Customer', customerSource ?? 'erpnext', '')
                .then((out) => {
                    if (cancelled) return null;
                    setSessionId(out.session_id);
                    return fetchChat(out.session_id);
                })
                .then((next) => {
                    if (cancelled || !next) return;
                    setData(next);
                    setLoadError(null);
                })
                .catch((err) => {
                    if (!cancelled) setLoadError(chatErrorMessage(err));
                });
            return () => {
                cancelled = true;
            };
        }

        if (!customerId) {
            // Blank mode: resume whatever session the backend considers active.
            fetchChat()
                .then((next) => {
                    if (cancelled) return;
                    setData(next);
                    setSessionId(next.active_session_id);
                    setLoadError(null);
                })
                .catch((err) => {
                    if (!cancelled) setLoadError(chatErrorMessage(err));
                });
        }

        return () => {
            cancelled = true;
        };
    }, [customerId, customerName, customerSource]);

    async function handleSend(overrideText?: string) {
        const text = (overrideText ?? composerText).trim();
        if (!text || text.startsWith('/')) return;
        setSending(true);
        setComposerError(null);
        try {
            // Blocking for up to ~20s — the whole orchestrator loop runs server-side
            // before this resolves, which is why the composer stays disabled throughout.
            const result = await sendChatMessage(text, sessionId ?? '');
            const next = await fetchChat(result.session_id);
            setSessionId(result.session_id);
            setData(next);
            setComposerText('');
        } catch (err) {
            setComposerError(chatErrorMessage(err));
        } finally {
            setSending(false);
        }
    }

    /** Picking from "/" results points the CURRENT session at that customer — the person
     * is mid-conversation and said who they mean, so the thread continues rather than
     * restarting. (Contrast the mount effect, which deliberately starts a new one.) */
    async function handlePickCustomer(id: string, name: string, source: string | null) {
        setAttaching(true);
        setComposerError(null);
        try {
            const out = await setChatCustomer(id, name, source, sessionId ?? '');
            const next = await fetchChat(out.session_id);
            setSessionId(out.session_id);
            setData(next);
            setComposerText('');
            attachedCustomerId.current = id;
        } catch (err) {
            setComposerError(chatErrorMessage(err));
        } finally {
            setAttaching(false);
        }
    }

    /**
     * Starts a fresh conversation. Purely client-side: no session is created until the
     * first message is actually sent (`sendChatMessage` with an empty session id does
     * that server-side), so tapping this repeatedly never litters the history with empty
     * threads. The existing session isn't deleted — it stays in the history sheet.
     */
    function handleNewChat() {
        setSessionId(null);
        setComposerText('');
        setComposerError(null);
        setLoadError(null);
        setPendingCustomerName(null);
        // Lets the same customer be attached again later; without this, returning to a
        // customer already attached in the previous thread would be a no-op.
        attachedCustomerId.current = null;
        // Keep `sessions` (the history list) and the live/model flags — only the thread
        // itself and its customer are cleared.
        setData((prev) =>
            prev ? { ...prev, messages: [], active_session_id: null, active_customer: null } : prev,
        );
    }

    async function handleReopen(id: string) {
        setLoadError(null);
        try {
            const next = await fetchChat(id);
            setSessionId(id);
            setData(next);
            setPendingCustomerName(null);
            attachedCustomerId.current = next.active_customer?.id ?? null;
        } catch (err) {
            setLoadError(chatErrorMessage(err));
        }
    }

    function handleRenamed(id: string, title: string) {
        setData((prev) =>
            prev ? { ...prev, sessions: prev.sessions.map((s) => (s.id === id ? { ...s, title } : s)) } : prev,
        );
    }

    const messages = data?.messages ?? [];
    const live = data?.live ?? true;
    const disabled = !live || sending || attaching;
    // Suggestions only make sense once a customer is attached AND the thread is empty.
    const showPrompts = !!chipName && messages.length === 0;

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />
            <KeyboardAvoidingView
                style={{ flex: 1, backgroundColor: colors.background }}
                // 'height' on Android, not undefined — undefined means "do nothing", which
                // leaves the composer hidden behind the keyboard.
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                    <View style={styles.headerTop}>
                        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
                            <Ionicons name="arrow-back" size={22} color={colors.text} />
                        </Pressable>
                        <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
                            <Ionicons name="sparkles" size={15} color="#FFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, { color: colors.text }]}>SmartOps AI</Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                                Type / to look up a customer
                            </Text>
                        </View>
                        <Pressable
                            onPress={handleNewChat}
                            hitSlop={8}
                            style={styles.headerButton}
                            accessibilityLabel="New chat"
                        >
                            <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                            onPress={() => setHistoryOpen(true)}
                            hitSlop={8}
                            style={styles.headerButton}
                            accessibilityLabel="Chat history"
                        >
                            <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                        </Pressable>
                    </View>

                    {chipName && (
                        <View style={[styles.customerChip, { backgroundColor: `${colors.primary}18` }]}>
                            <View style={[styles.chipAvatar, { backgroundColor: colors.primary }]}>
                                <Text style={styles.chipAvatarText}>{initials(chipName)}</Text>
                            </View>
                            <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
                                {chipName}
                            </Text>
                        </View>
                    )}
                </View>

                {loadError && <Text style={[styles.banner, { color: colors.danger }]}>{loadError}</Text>}
                {data && !data.live && (
                    <Text style={[styles.banner, { color: colors.danger }]}>
                        No database connection — nothing can be asked right now.
                    </Text>
                )}
                {/* The server answers fine with no model key, but every reply comes back as
                    an error string. Saying so up front beats letting someone discover it
                    one failed question at a time. */}
                {data && data.live && !data.model_ok && (
                    <Text style={[styles.banner, { color: colors.warning }]}>
                        AI model not configured on the server — replies will not work until an API key is set.
                    </Text>
                )}

                {messages.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        {showPrompts ? (
                            <>
                                <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
                                    Ask about {chipName}
                                </Text>
                                <View style={styles.promptGrid}>
                                    {CUSTOMER_PROMPTS.map((p) => (
                                        <PromptChip
                                            key={p}
                                            label={p}
                                            disabled={disabled}
                                            onPress={() => void handleSend(p)}
                                        />
                                    ))}
                                </View>
                            </>
                        ) : (
                            <View style={styles.blankState}>
                                <Ionicons name="sparkles-outline" size={30} color={colors.placeholder} />
                                <Text style={[styles.blankText, { color: colors.textSecondary }]}>
                                    Ask me anything, or type <Text style={{ fontWeight: '800' }}>/</Text> to look up a
                                    customer.
                                </Text>
                            </View>
                        )}
                    </View>
                ) : (
                    <FlatList
                        style={styles.messageList}
                        data={messages}
                        keyExtractor={(m: ChatMessage) => m.id}
                        renderItem={({ item }: { item: ChatMessage }) => (
                            <Bubble message={item} speakers={data?.speakers ?? {}} />
                        )}
                        contentContainerStyle={styles.list}
                    />
                )}

                {composerError && <Text style={[styles.banner, { color: colors.danger }]}>{composerError}</Text>}

                {/* Live customer results, ABOVE the composer, updating as each character is
                    typed after the slash — no submit step. */}
                {slashMode && (
                    <View style={styles.slashPanel}>
                        {slashQuery.trim().length < 2 ? (
                            <View
                                style={[
                                    styles.slashHint,
                                    { backgroundColor: colors.surface, borderColor: colors.border },
                                ]}
                            >
                                <Ionicons name="search" size={15} color={colors.placeholder} />
                                <Text style={[styles.slashHintText, { color: colors.textSecondary }]}>
                                    Keep typing a customer name, phone or email…
                                </Text>
                            </View>
                        ) : (
                            <CustomerSearchResults
                                state={searchState}
                                maxHeight={260}
                                onSelect={(item) =>
                                    void handlePickCustomer(item.party_id, item.name, item.source)
                                }
                            />
                        )}
                    </View>
                )}

                <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                    <View
                        style={[
                            styles.composerField,
                            {
                                backgroundColor: colors.background,
                                borderColor: slashMode ? colors.primary : colors.border,
                            },
                        ]}
                    >
                        <TextInput
                            value={composerText}
                            onChangeText={setComposerText}
                            placeholder={sending ? 'Thinking…' : 'Type a message, or / for a customer…'}
                            placeholderTextColor={colors.placeholder}
                            editable={!disabled}
                            multiline
                            style={[styles.composerInput, { color: colors.text }]}
                        />
                    </View>
                    <Pressable
                        onPress={() => void handleSend()}
                        disabled={disabled || !composerText.trim() || slashMode}
                        accessibilityLabel="Send"
                        style={[
                            styles.sendButton,
                            {
                                backgroundColor: colors.primary,
                                opacity: disabled || !composerText.trim() || slashMode ? 0.5 : 1,
                            },
                        ]}
                    >
                        {attaching ? (
                            <ActivityIndicator color="#FFF" size="small" />
                        ) : (
                            <Ionicons name="send" size={18} color="#FFF" />
                        )}
                    </Pressable>
                </View>

                {/* Customer prompts stay reachable once the thread has started, as a
                    scrollable strip rather than the full grid. */}
                {!!chipName && messages.length > 0 && !slashMode && (
                    <View style={[styles.promptRow, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.promptRowContent}
                        >
                            {CUSTOMER_PROMPTS.map((p) => (
                                <PromptChip
                                    key={p}
                                    label={p}
                                    disabled={disabled}
                                    compact
                                    onPress={() => void handleSend(p)}
                                />
                            ))}
                        </ScrollView>
                    </View>
                )}
            </KeyboardAvoidingView>

            <ChatHistorySheet
                visible={historyOpen}
                onClose={() => setHistoryOpen(false)}
                sessions={data?.sessions ?? []}
                activeSessionId={sessionId}
                onSelect={handleReopen}
                onRenamed={handleRenamed}
            />
        </SafeAreaView>
    );
}

function PromptChip({
    label,
    onPress,
    disabled,
    compact,
}: {
    label: string;
    onPress: () => void;
    disabled: boolean;
    compact?: boolean;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.promptChip,
                compact && styles.promptChipCompact,
                { backgroundColor: `${colors.primary}18`, opacity: pressed || disabled ? 0.6 : 1 },
            ]}
        >
            <Text style={[styles.promptChipText, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {label}
            </Text>
        </Pressable>
    );
}

/** A pill naming a tool the agent ran, so nothing it did is invisible in the trace. */
function StepBadge({ label, ok }: { label: string; ok: boolean }) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const tint = ok ? colors.success : colors.danger;
    return (
        <View style={[styles.stepBadge, { backgroundColor: `${tint}22` }]}>
            <Text style={[styles.stepBadgeText, { color: tint }]} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

/** A summary computed from the card's OWN structured data, never the model's prose —
 * which tends to re-enumerate the same rows the card already lists in full (nothing in
 * the shared server-side prompt tells it a card is coming, since that prompt also serves
 * the web app and WhatsApp, neither of which renders one). */
function cardSummary(cardSteps: ChatStep[]): string {
    const parts: string[] = [];
    for (const step of cardSteps) {
        if (step.detail.invoices) {
            const rows = step.detail.invoices;
            const overdue = rows.filter((r) => isOverdue(r.due_date)).length;
            const total = rows.reduce((sum, r) => sum + (r.outstanding ?? 0), 0);
            parts.push(
                `${rows.length} invoice${rows.length === 1 ? '' : 's'}` +
                    (overdue > 0 ? `, ${overdue} overdue` : '') +
                    `, ${money(total)} outstanding`,
            );
        } else if (step.detail.quotes) {
            const rows = step.detail.quotes;
            parts.push(`${rows.length} quote${rows.length === 1 ? '' : 's'} on record`);
        }
    }
    return parts.join(' · ') || 'Here you go:';
}

function Bubble({ message, speakers }: { message: ChatMessage; speakers: Record<string, string> }) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    // `person` is the caller's own message — NOT `user`, which the API never sends.
    const mine = message.role === 'person';
    const speaker = message.agent_id ? speakers[message.agent_id] : null;

    // Steps carrying a recognised structured result get a real card; everything else
    // (searches, writes, anything that didn't resolve a list) keeps its badge, so no step
    // silently disappears from the trace.
    const cardSteps = message.steps.filter((s) => s.ok && (s.detail.invoices || s.detail.quotes));
    const badgeSteps = message.steps.filter((s) => !cardSteps.includes(s));
    // Skip the model's own prose when a card covers the same data, or the list shows up
    // twice — once as text, once as the card underneath it.
    const bubbleText = cardSteps.length > 0 ? cardSummary(cardSteps) : message.body;

    return (
        <View style={{ gap: 6, maxWidth: '92%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
            {!mine && speaker && <Text style={[styles.speaker, { color: colors.textSecondary }]}>{speaker}</Text>}
            <View
                style={[
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    {
                        backgroundColor: mine ? colors.primary : colors.surface,
                        borderColor: mine ? 'transparent' : colors.border,
                        borderWidth: mine ? 0 : 1.5,
                    },
                ]}
            >
                <Text style={[styles.bubbleText, { color: mine ? '#FFF' : colors.text }]}>{bubbleText}</Text>
                {badgeSteps.length > 0 && (
                    <View style={styles.steps}>
                        {badgeSteps.map((s) => (
                            <StepBadge key={s.ordinal} label={s.tool} ok={s.ok} />
                        ))}
                    </View>
                )}
            </View>

            {cardSteps.map((s) => (
                <ToolResultCard key={s.ordinal} step={s} />
            ))}
        </View>
    );
}

/** Renders a `crm.customer.invoices`/`crm.customer.quotes` step's own structured result
 * as a real list — amounts, due dates, overdue highlighting — rather than leaving the
 * model's prose as the only way that data reaches the screen. */
function ToolResultCard({ step }: { step: ChatStep }) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const [expanded, setExpanded] = useState(false);

    const invoices = step.detail.invoices ?? null;
    const quotes = step.detail.quotes ?? null;
    const rows: (InvoiceSummary | QuoteSummary)[] = invoices ?? quotes ?? [];
    const visible = expanded ? rows : rows.slice(0, 4);
    const hidden = rows.length - visible.length;

    if (rows.length === 0) return null;

    return (
        <View style={[styles.resultCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {visible.map((row, i) => (
                <View
                    key={row.ref}
                    style={[
                        styles.resultRow,
                        i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}
                >
                    {invoices ? (
                        <InvoiceRow row={row as InvoiceSummary} colors={colors} />
                    ) : (
                        <QuoteRow row={row as QuoteSummary} colors={colors} />
                    )}
                </View>
            ))}
            {hidden > 0 && (
                <Pressable onPress={() => setExpanded(true)} style={styles.resultFooter}>
                    <Text style={[styles.resultFooterText, { color: colors.primary }]}>+ {hidden} more</Text>
                </Pressable>
            )}
        </View>
    );
}

type ThemeColors = (typeof Colors)['light'];

function InvoiceRow({ row, colors }: { row: InvoiceSummary; colors: ThemeColors }) {
    const overdue = isOverdue(row.due_date);
    return (
        <>
            <View style={{ gap: 1, flex: 1 }}>
                <Text style={[styles.resultRef, { color: colors.text }]}>{row.ref}</Text>
                <Text style={[styles.resultMeta, { color: overdue ? colors.danger : colors.placeholder }]}>
                    {row.due_date ? `Due ${row.due_date}` : row.status}
                    {overdue ? ' · Overdue' : ''}
                </Text>
            </View>
            <Text style={[styles.resultAmount, { color: overdue ? colors.danger : colors.text }]}>
                {money(row.outstanding)}
            </Text>
        </>
    );
}

function QuoteRow({ row, colors }: { row: QuoteSummary; colors: ThemeColors }) {
    return (
        <>
            <View style={{ gap: 1, flex: 1 }}>
                <Text style={[styles.resultRef, { color: colors.text }]}>{row.ref}</Text>
                <Text style={[styles.resultMeta, { color: colors.placeholder }]}>
                    {row.status}
                    {row.date ? ` · ${row.date}` : ''}
                </Text>
            </View>
            <Text style={[styles.resultAmount, { color: colors.text }]}>{money(row.total)}</Text>
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 18,
        paddingTop: 12,
        paddingBottom: 12,
        gap: 9,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    headerIcon: {
        width: 30,
        height: 30,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 16.5,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 11.5,
        fontWeight: '500',
        marginTop: 1,
    },
    headerButton: {
        padding: 4,
    },
    customerChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        alignSelf: 'flex-start',
        paddingVertical: 5,
        paddingRight: 12,
        paddingLeft: 5,
        borderRadius: 999,
        maxWidth: '100%',
    },
    chipAvatar: {
        width: 20,
        height: 20,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chipAvatarText: {
        color: '#FFF',
        fontSize: 9,
        fontWeight: '800',
    },
    chipText: {
        fontSize: 12.5,
        fontWeight: '700',
        flexShrink: 1,
    },
    banner: {
        fontSize: 13,
        fontWeight: '600',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    emptyContainer: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 16,
        gap: 10,
    },
    blankState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingBottom: 60,
        paddingHorizontal: 30,
    },
    blankText: {
        fontSize: 13.5,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 20,
    },
    emptyHint: {
        fontSize: 13,
        fontWeight: '600',
    },
    messageList: {
        flex: 1,
    },
    promptGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 8,
    },
    promptChip: {
        alignSelf: 'flex-start',
        flexShrink: 0,
        flexGrow: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    promptChipCompact: {
        paddingVertical: 8,
    },
    promptChipText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    // Fixed height, not whatever space is left over — an unconstrained ScrollView here
    // would stretch its children to fill however much cross-axis space it's handed.
    promptRow: {
        height: 52,
        justifyContent: 'center',
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    promptRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 8,
    },
    slashPanel: {
        paddingHorizontal: 12,
        paddingBottom: 8,
    },
    slashHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    slashHintText: {
        fontSize: 12.5,
        fontWeight: '500',
    },
    list: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        gap: 10,
    },
    speaker: {
        fontSize: 11,
        fontWeight: '700',
        marginLeft: 4,
    },
    bubble: {
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 11,
        gap: 8,
    },
    bubbleMine: {
        borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
        borderBottomLeftRadius: 4,
    },
    bubbleText: {
        fontSize: 14,
        fontWeight: '500',
        lineHeight: 20,
    },
    steps: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 5,
    },
    stepBadge: {
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
        alignSelf: 'flex-start',
    },
    stepBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    resultCard: {
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: 'hidden',
    },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    resultRef: {
        fontSize: 13,
        fontWeight: '700',
    },
    resultMeta: {
        fontSize: 11,
        fontWeight: '500',
    },
    resultAmount: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    resultFooter: {
        paddingVertical: 10,
        alignItems: 'center',
    },
    resultFooterText: {
        fontSize: 12,
        fontWeight: '700',
    },
    composer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 10,
        padding: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    composerField: {
        flex: 1,
        borderWidth: 1.5,
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 6,
        justifyContent: 'center',
    },
    composerInput: {
        fontSize: 14.5,
        fontWeight: '500',
        maxHeight: 100,
        paddingVertical: 6,
    },
    sendButton: {
        width: 42,
        height: 42,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
