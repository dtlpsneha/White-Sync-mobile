/**
 * Documents -- every file posted in Team Chat, by what it is.
 *
 * Filter by document type (Customer PO, LR copy, ...), or "Not filed" for the files nobody has
 * said anything about yet; search by any word -- customer, number, file name, who posted it.
 * Tap a file to open its conversation; "File" / "Edit" says (or corrects) what it is.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { displayName, docTint } from '@/components/team/chatUi';
import { FileTypeSheet } from '@/components/team/FileTypeSheet';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { age, DocType, Filing, team, TeamFile } from '@/services/teamApi';

const UNFILED = 'unfiled';
const dmy = (iso?: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('-') : '');
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const minutesSince = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

export default function DocumentsScreen() {
    const router = useRouter();
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const [types, setTypes] = useState<DocType[]>([]);
    const [filter, setFilter] = useState<string | null>(null);   // null = all
    const [query, setQuery] = useState('');
    const [files, setFiles] = useState<TeamFile[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [next, setNext] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<TeamFile | null>(null);
    const [saving, setSaving] = useState(false);
    const asked = useRef(0);   // only the newest search's answer is shown

    const load = useCallback(async (type: string | null, q: string) => {
        const mine = ++asked.current;
        const r = await team.files({ type, q });
        if (mine !== asked.current) return;
        setLoading(false);
        setRefreshing(false);
        if (!r.ok) { setError(r.error); return; }
        setError(null);
        setFiles(r.data.files);
        setCounts(r.data.counts);
        setNext(r.data.next_before ?? null);
    }, []);

    useEffect(() => { team.documentTypes().then(setTypes); }, []);

    // Typing waits a moment before searching; a filter tap searches at once.
    useEffect(() => {
        const h = setTimeout(() => load(filter, query), query ? 350 : 0);
        return () => clearTimeout(h);
    }, [filter, query, load]);

    // Coming back from a conversation: what was filed there shows here.
    useFocusEffect(useCallback(() => { load(filter, query); }, [filter, query, load]));

    const loadMore = async () => {
        if (!next || loadingMore) return;
        setLoadingMore(true);
        const r = await team.files({ type: filter, q: query, before: next });
        setLoadingMore(false);
        if (!r.ok) return;
        setFiles(prev => [...prev, ...r.data.files.filter(f => !prev.some(p => p.job_id === f.job_id && p.reply_id === f.reply_id))]);
        setNext(r.data.next_before ?? null);
    };

    const save = async (f: TeamFile, filing: Filing) => {
        setSaving(true);
        const r = await team.fileAttachment(f.job_id, f.reply_id, filing);
        setSaving(false);
        if (!r.ok) { Alert.alert('Not saved', r.error); return; }
        setEditing(null);
        load(filter, query);
    };

    const chips: { key: string | null; label: string; icon: string }[] = [
        { key: null, label: 'All', icon: 'albums-outline' },
        ...types.map(t => ({ key: t.key, label: t.label, icon: t.icon })),
        { key: UNFILED, label: 'Not filed', icon: 'help-circle-outline' },
    ];
    const iconFor = (f: TeamFile) => types.find(t => t.key === f.doc_type)?.icon ?? 'help-circle-outline';

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Documents"
                subtitle={counts.all !== undefined ? `${counts.all} files in Team Chat` : 'Files in Team Chat'}
                align="left"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/team'))}
            >
                <View style={[styles.search, { backgroundColor: colors.ink2 }]}>
                    <Ionicons name="search" size={18} color={colors.onInkMuted} />
                    <TextInput style={[styles.searchInput, { color: '#FFF' }]} value={query} onChangeText={setQuery}
                        placeholder="Customer, number, file name…" placeholderTextColor={colors.onInkMuted}
                        returnKeyType="search" autoCorrect={false} />
                    {!!query && (
                        <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                            <Ionicons name="close-circle" size={18} color={colors.onInkMuted} />
                        </TouchableOpacity>
                    )}
                </View>
            </ScreenHeader>

            <View style={styles.top}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {chips.map(c => {
                        const on = c.key === filter;
                        const n = counts[c.key ?? 'all'] ?? 0;
                        return (
                            <TouchableOpacity key={c.key ?? 'all'} onPress={() => { setLoading(true); setFilter(c.key); }}
                                activeOpacity={0.8}
                                style={[styles.chip, {
                                    backgroundColor: on ? colors.ink : colors.surface,
                                    borderColor: on ? colors.ink : colors.border,
                                }]}>
                                <Text style={[styles.chipText, { color: on ? '#FFF' : colors.text }]}>{c.label}</Text>
                                <Text style={[styles.chipCount, { color: on ? '#FFF' : colors.text }]}>{n}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {error ? (
                <View style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                    <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
                    <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
                    <TouchableOpacity onPress={() => { setLoading(true); load(filter, query); }}>
                        <Text style={{ color: colors.primary, fontWeight: '800' }}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : loading && !files.length ? (
                <ActivityIndicator style={{ marginTop: 40 }} size="large" color={colors.primary} />
            ) : (
                <FlatList
                    data={files}
                    keyExtractor={f => `${f.job_id}-${f.reply_id ?? 'post'}`}
                    contentContainerStyle={styles.list}
                    refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary}
                        onRefresh={() => { setRefreshing(true); load(filter, query); }} />}
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.4}
                    ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color={colors.primary} /> : undefined}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Ionicons name="folder-open-outline" size={44} color={colors.textSecondary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                {query ? `Nothing matches “${query}”.` : filter === UNFILED ? 'Every file is filed.' : 'No files here yet.'}
                            </Text>
                        </View>
                    }
                    renderItem={({ item: f }) => {
                        const filed = !!f.doc_type;
                        const facts = [f.party || (!filed ? f.read_party : null), f.ref || (!filed ? f.read_ref : null)].filter(Boolean).join(' · ');
                        const when = [dmy(f.doc_date), f.amount != null ? inr(f.amount) : ''].filter(Boolean).join(' · ');
                        const tint = docTint(f.doc_type);
                        return (
                            <TouchableOpacity activeOpacity={0.85}
                                onPress={() => router.push({ pathname: '/team/[id]', params: { id: f.job_id } })}
                                style={[styles.row, { backgroundColor: colors.surface, borderLeftColor: tint }]}>
                                <View style={[styles.icon, { backgroundColor: `${tint}22` }]}>
                                    <Ionicons name={iconFor(f) as any} size={20} color={tint} />
                                </View>
                                <View style={{ flex: 1, gap: 2 }}>
                                    <Text style={[styles.type, { color: tint }]}>
                                        {filed ? f.doc_type_label : 'Not filed'}
                                    </Text>
                                    {!!facts && <Text style={[styles.facts, { color: colors.text }]} numberOfLines={1}>{facts}</Text>}
                                    {!!when && <Text style={[styles.meta, { color: colors.textSecondary }]}>{when}</Text>}
                                    {!!f.doc_details?.description && (
                                        <Text style={[styles.meta, { color: colors.text }]} numberOfLines={2}>{f.doc_details.description}</Text>
                                    )}
                                    <Text style={[styles.meta, styles.small, { color: colors.textSecondary }]} numberOfLines={1}>
                                        {[f.filename, f.posted_by ? displayName(f.posted_by.name) : null, `${age(minutesSince(f.posted_at))} ago`].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                {types.length > 0 && (
                                    <TouchableOpacity onPress={() => setEditing(f)} hitSlop={8}
                                        style={[styles.fileBtn, {
                                            borderColor: filed ? colors.border : colors.primary,
                                            backgroundColor: filed ? 'transparent' : colors.primary,
                                        }]}>
                                        <Text style={[styles.fileBtnText, { color: filed ? colors.textSecondary : '#FFF' }]}>
                                            {filed ? 'Edit' : 'File'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                />
            )}

            {editing && (
                <FileTypeSheet types={types} fileName={editing.filename}
                    initial={editing.doc_type ? { doc_type: editing.doc_type, details: editing.doc_details || {} } : null}
                    saving={saving} onClose={() => setEditing(null)} onSave={f => save(editing, f)} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    top: { paddingHorizontal: 16, paddingTop: 14 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 14, height: 46, marginTop: 2 },
    searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
    chips: { gap: 8, paddingBottom: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 12, fontWeight: '700' },
    chipCount: { fontSize: 12, fontWeight: '800', opacity: 0.6 },
    list: { paddingHorizontal: 16, paddingTop: 12, gap: 12, paddingBottom: 40 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderLeftWidth: 4,
        paddingVertical: 12, paddingHorizontal: 14,
        shadowColor: '#1F2421', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
    },
    icon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    type: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.66 },
    facts: { fontSize: 14, fontWeight: '700' },
    meta: { fontSize: 12, fontWeight: '500' },
    small: { fontSize: 11 },
    fileBtn: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    fileBtnText: { fontSize: 11, fontWeight: '700' },
    empty: { alignItems: 'center', gap: 10, marginTop: 60 },
    emptyText: { fontSize: 14, fontWeight: '600' },
    notice: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, padding: 14, borderWidth: 1, borderRadius: Radius.md },
    noticeText: { flex: 1, fontSize: 14, fontWeight: '600' },
});
