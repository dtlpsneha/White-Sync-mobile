/**
 * One job as a chat thread: the post at the top, the replies under it, the message box at
 * the bottom — plus a bar pinned under the header with what the job is, whom it is for,
 * and its ERPNext step.
 *
 * The ERPNext step depends on the type (see SmartOps app/web/team_erpnext.py):
 *   pro-forma / quotation  make a DRAFT Quotation (closes itself when approved in ERPNext)
 *   place order            type the principal's order number (closes the job)
 *   dispatch               transporter + LR number (closes the job)
 *   payment                find the Tally receipt and confirm it (closes the job)
 *
 * One-tap replies say the words SmartOps already reads as "done" ("Order placed",
 * "Dispatched", …), so the person the job is for can close it without typing.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View, type ScrollViewInstance,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { DayDivider, JobTag, ReplyBubble } from '@/components/team/Bubbles';
import { dayLabel, displayName, sameDay } from '@/components/team/chatUi';
import { Composer, ComposerChip } from '@/components/team/Composer';
import { PickerSheet } from '@/components/team/PickerSheet';
import { Sheet } from '@/components/team/Sheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
    age, Job, JobDetail, JobKind, KIND_COLORS, Payments, People, PickedFile, PickedVoice, Reply, team,
} from '@/services/teamApi';

const POLL_MS = 10000;
const GROUP_GAP_MS = 10 * 60 * 1000;

/** What the person a job is for says when it is done — words SmartOps closes the job on. */
const DONE_WORDS: Record<JobKind, string> = {
    proforma: 'Pro-forma sent ✅',
    quotation: 'Quotation sent ✅',
    place_order: 'Order placed ✅',
    dispatch: 'Dispatched ✅',
    payment: 'Payment received ✅',
    general: 'Done ✅',
};

type Result = { ok: true; data: JobDetail } | { ok: false; error: string };

export default function JobScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [detail, setDetail] = useState<JobDetail | null>(null);
    const [people, setPeople] = useState<People | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [picker, setPicker] = useState<'kind' | 'assignee' | null>(null);
    const [step, setStep] = useState(false);
    const [rereading, setRereading] = useState<string | null>(null);
    const scrollRef = useRef<ScrollViewInstance>(null);

    const load = useCallback(async () => {
        const r = await team.job(id);
        if (r.ok) { setDetail(r.data); setError(null); } else setError(r.error);
    }, [id]);

    useEffect(() => { team.people().then(r => { if (r.ok) setPeople(r.data); }); }, []);
    useFocusEffect(useCallback(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]));

    /** Run one change; show what SmartOps said if it refused. */
    const act = useCallback(async (fn: () => Promise<Result>) => {
        setBusy(true);
        const r = await fn();
        setBusy(false);
        if (r.ok) setDetail(r.data); else Alert.alert('Team', r.error);
        return r.ok;
    }, []);

    const me = people?.me.id;
    const job = detail?.job;

    const chips: ComposerChip[] = useMemo(() => {
        if (!job || job.status !== 'open') return [];
        if (me && job.assignee?.id === me) {
            return [
                { label: DONE_WORDS[job.kind], send: DONE_WORDS[job.kind], color: colors.success },
                { label: '👍 On it', send: 'On it 👍' },
                { label: '❓ Need details', send: 'Need more details, please' },
            ];
        }
        if (me && job.author.id === me) {
            return [
                { label: 'Any update?', send: 'Any update?' },
                { label: '🙏 Thanks', send: 'Thanks 🙏' },
            ];
        }
        return [];
    }, [job, me, colors.success]);

    if (!detail || !job) {
        return (
            <View style={[styles.center, { backgroundColor: colors.background }]}>
                {error ? <Text style={[styles.err, { color: colors.danger }]}>{error}</Text>
                    : <ActivityIndicator color={colors.primary} />}
            </View>
        );
    }

    const open = job.status === 'open';
    const mayAct = me === job.author.id || me === job.assignee?.id;

    const reply = async (text: string, file: PickedFile | null, voice?: PickedVoice | null) => {
        const ok = await act(() => team.reply(job.id, text, file, voice));
        if (ok) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        return ok;
    };

    const readAgain = async (documentId: string) => {
        setRereading(documentId);
        await act(() => team.reread(job.id, documentId));
        setRereading(null);
    };

    const menu = () => Alert.alert('Job', `${job.kind_label} · ${displayName(job.author.name)} → ${job.assignee ? displayName(job.assignee.name) : 'nobody yet'}`, [
        open ? { text: 'Mark done', onPress: () => act(() => team.done(job.id)) }
            : { text: 'Reopen', onPress: () => act(() => team.reopen(job.id)) },
        { text: 'Change type', onPress: () => setPicker('kind') },
        { text: 'Change who it is for', onPress: () => setPicker('assignee') },
        ...(open && me === job.author.id ? [{ text: 'Cancel job', style: 'destructive' as const, onPress: () => act(() => team.cancel(job.id)) }] : []),
        { text: 'Close', style: 'cancel' as const },
    ]);

    // The post itself opens the thread, as the first message.
    const post: Reply = {
        id: `post-${job.id}`, body: job.body, author: job.author, closed_job: false,
        attachment: job.attachment, created_at: job.created_at, voice: job.voice, deleted: job.deleted,
    };

    /** Hold my own message: delete it. It stays in the thread as "Message deleted". */
    const askDelete = (m: Reply) => {
        const isPost = m.id === post.id;
        Alert.alert('Delete message?',
            isPost ? 'It is deleted for everyone and the job is cancelled. Replies stay.' : 'It is deleted for everyone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: () => act(() => isPost ? team.deletePost(job.id) : team.deleteReply(job.id, m.id)),
            },
        ]);
    };
    const messages = [post, ...detail.thread];

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <ScreenHeader
                title={displayName(job.author.name)}
                subtitle={`${job.kind_label} · ${open ? `waiting ${age(job.age_minutes)}` : job.status === 'done' ? 'done' : 'cancelled'}`}
                onBack={() => router.back()}
                rightIcon="ellipsis-vertical"
                onRightPress={menu}
            />

            {/* What the job is, whom it is for, and its ERPNext step */}
            <View style={[styles.bar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <JobTag job={job} colors={colors} meId={me}
                    onKind={() => setPicker('kind')} onAssignee={() => setPicker('assignee')} />
                {job.kind_suggested && (
                    <Text style={[styles.guess, { color: colors.warning }]}>SmartOps guessed the type ({job.kind_why}) — tap it to change.</Text>
                )}
                <ErpStepButton job={job} colors={colors} open={open} mayAct={mayAct}
                    onOpenSheet={() => setStep(true)}
                    onQuotation={() => router.push({ pathname: '/team/quotation', params: { id: job.id } })}
                    onOpenQuotation={() => router.push({ pathname: '/quotations/[id]', params: { id: job.erpnext_name! } })} />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={{ paddingVertical: 8 }}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
                >
                    {messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const newDay = !prev || !sameDay(prev.created_at, m.created_at);
                        const grouped = !!prev && !newDay && !!prev.author && !!m.author && prev.author.id === m.author.id
                            && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_GAP_MS;
                        return (
                            <React.Fragment key={m.id}>
                                {newDay && <DayDivider label={dayLabel(m.created_at)} colors={colors} />}
                                <ReplyBubble reply={m} mine={!!me && m.author?.id === me} showAuthor={!grouped}
                                    theme={theme} colors={colors} onRetryRead={readAgain}
                                    retrying={!!m.attachment && rereading === m.attachment.document_id}
                                    onLongPress={!!me && m.author?.id === me && !m.deleted ? () => askDelete(m) : undefined} />
                            </React.Fragment>
                        );
                    })}
                    {busy && <ActivityIndicator style={{ margin: 10 }} color={colors.primary} />}
                </ScrollView>

                <Composer
                    onSend={reply}
                    placeholder={open && me === job.assignee?.id ? `Reply — "${DONE_WORDS[job.kind].replace(' ✅', '')}" closes it` : 'Reply'}
                    chips={chips}
                />
            </KeyboardAvoidingView>

            <PickerSheet
                visible={picker === 'kind'} title="What is asked" selected={job.kind}
                options={(people?.kinds ?? []).map(k => ({ value: k.kind, label: k.label }))}
                onPick={v => act(() => team.correct(job.id, { kind: v as JobKind }))}
                onClose={() => setPicker(null)}
            />
            <PickerSheet
                visible={picker === 'assignee'} title="Who it is for" selected={job.assignee?.id}
                options={(people?.people ?? []).map(p => ({ value: p.id, label: displayName(p.name) }))}
                onPick={v => act(() => team.correct(job.id, { assignee_id: v }))}
                onClose={() => setPicker(null)}
            />
            <ErpStepSheet visible={step} job={job} colors={colors} busy={busy} open={open}
                onClose={() => setStep(false)}
                onDone={async fn => { const ok = await act(fn); if (ok) setStep(false); }} />
        </View>
    );
}

/** The one button for the job's ERPNext step, or what is already linked. */
function ErpStepButton({ job, colors, open, mayAct, onOpenSheet, onQuotation, onOpenQuotation }: {
    job: Job; colors: typeof Colors.light; open: boolean; mayAct: boolean;
    onOpenSheet: () => void; onQuotation: () => void; onOpenQuotation: () => void;
}) {
    const tint = KIND_COLORS[job.kind];
    // An older SmartOps sends no `action` at all: show no ERPNext step rather than a wrong one.
    if (!job.action || job.action === 'none') return null;

    let linked: string | null = null;
    if (job.action === 'quotation' && job.erpnext_name && !job.erpnext_missing) {
        linked = `${job.erpnext_name} · ${open ? 'draft — closes when approved' : 'approved'}`;
    } else if (job.action === 'order_ref' && job.reference) {
        linked = `Order no. ${job.reference}`;
    } else if (job.action === 'dispatch' && job.reference) {
        linked = `${job.transporter || 'Transport'} · LR ${job.reference}`;
    } else if (job.action === 'payment' && job.erpnext_name) {
        linked = `Tally receipt ${job.erpnext_name}`;
    }

    if (linked) {
        const canOpen = job.action === 'quotation';
        return (
            <TouchableOpacity disabled={!canOpen} onPress={onOpenQuotation} activeOpacity={0.8}
                style={[styles.linked, { backgroundColor: `${colors.success}14`, borderColor: `${colors.success}55` }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.linkedText, { color: colors.text }]} numberOfLines={1}>{linked}</Text>
                {canOpen && <Ionicons name="open-outline" size={16} color={colors.success} />}
            </TouchableOpacity>
        );
    }
    if (!open || !mayAct) return null;

    const label = job.action === 'quotation' ? `Make draft ${job.kind === 'proforma' ? 'pro-forma' : 'quotation'}`
        : job.action === 'order_ref' ? 'Add the order number'
            : job.action === 'dispatch' ? 'Add transporter & LR'
                : 'Find the payment in Tally';
    const icon = job.action === 'quotation' ? 'document-text' : job.action === 'order_ref' ? 'receipt'
        : job.action === 'dispatch' ? 'car' : 'search';
    return (
        <TouchableOpacity onPress={job.action === 'quotation' ? onQuotation : onOpenSheet} activeOpacity={0.85}
            style={[styles.stepBtn, { backgroundColor: tint }]}>
            <Ionicons name={icon as any} size={17} color="#FFF" />
            <Text style={styles.stepText}>{label}</Text>
            <Text style={styles.stepErp}>ERPNext</Text>
        </TouchableOpacity>
    );
}

/** The short form for order no. / dispatch, or the payment matches. */
function ErpStepSheet({ visible, job, colors, busy, open, onClose, onDone }: {
    visible: boolean; job: Job; colors: typeof Colors.light; busy: boolean; open: boolean;
    onClose: () => void; onDone: (fn: () => Promise<Result>) => Promise<void>;
}) {
    const tint = KIND_COLORS[job.kind];
    const [reference, setReference] = useState('');
    const [transporter, setTransporter] = useState(job.transporter ?? '');
    const [payments, setPayments] = useState<Payments | null>(null);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (!visible || job.action !== 'payment' || payments) return;
        setSearching(true);
        team.payments(job.id).then(r => {
            setSearching(false);
            if (r.ok) setPayments(r.data); else Alert.alert('Payment', r.error);
        });
    }, [visible, job.action, job.id, payments]);

    const inputStyle = [styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }];

    if (job.action === 'payment') {
        return (
            <Sheet visible={visible} onClose={onClose} title="Match the payment"
                subtitle="From the Tally receipts in ERPNext — nothing new is created">
                {searching && <ActivityIndicator color={colors.primary} />}
                {payments && (
                    <>
                        <Text style={[styles.facts, { color: colors.textSecondary }]}>
                            {payments.facts.utr ? `UTR ${payments.facts.utr}` : 'No UTR in the post'} ·{' '}
                            {payments.facts.amount ? `₹${payments.facts.amount.toLocaleString('en-IN')}` : 'no amount'}
                        </Text>
                        {!!payments.note && <Text style={[styles.note, { color: colors.warning }]}>{payments.note}</Text>}
                        {payments.candidates.map(c => (
                            <View key={c.name} style={[styles.receipt, { borderColor: colors.border, backgroundColor: colors.background }]}>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={[styles.receiptAmt, { color: colors.text }]}>₹{c.amount.toLocaleString('en-IN')}</Text>
                                    <Text style={{ color: colors.text, fontWeight: '700' }} numberOfLines={1}>{c.customer}</Text>
                                    <Text style={[styles.small, { color: colors.textSecondary }]}>
                                        Voucher {c.voucher_no} · {c.date}{c.sales_invoice ? ` · ${c.sales_invoice}` : ''}
                                    </Text>
                                    <Text style={[styles.small, { color: colors.textSecondary }]}>{c.why}</Text>
                                </View>
                                {open && (
                                    <TouchableOpacity disabled={busy} onPress={() => onDone(() => team.confirmPayment(job.id, c.name))}
                                        style={[styles.confirm, { backgroundColor: tint, opacity: busy ? 0.6 : 1 }]}>
                                        <Text style={styles.confirmText}>This one</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                        {payments.candidates.length === 0 && !payments.note && (
                            <Text style={[styles.note, { color: colors.textSecondary }]}>No matching receipt yet — Tally may not have it.</Text>
                        )}
                    </>
                )}
            </Sheet>
        );
    }

    const isDispatch = job.action === 'dispatch';
    const ready = !!reference.trim() && !busy;
    return (
        <Sheet visible={visible} onClose={onClose}
            title={isDispatch ? 'Dispatch details' : 'Order placed'}
            subtitle={isDispatch ? 'Saved on the job and the job closes' : `${job.principal || 'Principal'} order number — saved on the job and the job closes`}>
            {isDispatch && (
                <TextInput style={inputStyle} placeholder="Transporter" placeholderTextColor={colors.placeholder}
                    value={transporter} onChangeText={setTransporter} />
            )}
            <TextInput style={inputStyle} autoFocus placeholder={isDispatch ? 'LR number' : 'Order number'}
                placeholderTextColor={colors.placeholder} value={reference} onChangeText={setReference} />
            <TouchableOpacity disabled={!ready}
                onPress={() => onDone(() => isDispatch
                    ? team.dispatch(job.id, reference.trim(), transporter.trim())
                    : team.orderRef(job.id, reference.trim()))}
                style={[styles.save, { backgroundColor: tint, opacity: ready ? 1 : 0.5 }]}>
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save and close the job</Text>}
            </TouchableOpacity>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    err: { fontWeight: '700', padding: 24, textAlign: 'center' },
    bar: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
    guess: { fontSize: 12, fontWeight: '600' },
    stepBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 11,
    },
    stepText: { color: '#FFF', fontWeight: '900', fontSize: 14.5, flex: 1 },
    stepErp: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 11, letterSpacing: 0.6 },
    linked: {
        flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.md, borderWidth: 1,
        paddingHorizontal: 12, paddingVertical: 9,
    },
    linkedText: { flex: 1, fontWeight: '700', fontSize: 13.5 },
    input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
    save: { borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
    saveText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
    facts: { fontSize: 13, fontWeight: '700' },
    note: { fontSize: 13, fontWeight: '600' },
    receipt: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: 12 },
    receiptAmt: { fontSize: 17, fontWeight: '900' },
    small: { fontSize: 12 },
    confirm: { borderRadius: Radius.sm, paddingHorizontal: 12, paddingVertical: 9 },
    confirmText: { color: '#FFF', fontWeight: '900', fontSize: 13 },
});
