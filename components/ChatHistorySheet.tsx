/**
 * ChatHistorySheet.tsx — past AI conversations, as a bottom sheet.
 *
 * Fed entirely from `ChatOut.sessions`, which is already part of every `GET /bff/v1/chat`
 * response, so this does no fetching of its own. The one call it does make is the rename.
 *
 * Ported from `C:\DTLP\Expo Mobile App\components\ChatHistorySheet.tsx`, restyled onto
 * this app's `Colors` tokens and system font weights (the source uses its own
 * Space Grotesk / Manrope scale, which this app doesn't load).
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { renameChat, type ChatSessionSummary } from '@/services/smartopsApi';

/** "just now" / "12 min ago" / "3 hrs ago" / "2 days ago" — the same three-tier scale
 * every other SmartOps surface uses for an age. */
function ageWordsSince(isoTimestamp: string): string {
    const then = new Date(isoTimestamp).getTime();
    if (Number.isNaN(then)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
}

function Row({
    session,
    active,
    onSelect,
    onRenamed,
}: {
    session: ChatSessionSummary;
    active: boolean;
    onSelect: (id: string) => void;
    onRenamed: (id: string, title: string) => void;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(session.title);
    const [saving, setSaving] = useState(false);
    const [renameError, setRenameError] = useState(false);

    async function commit() {
        const title = draft.trim();
        setEditing(false);
        if (!title || title === session.title) return;
        setSaving(true);
        setRenameError(false);
        try {
            await renameChat(session.id, title);
            onRenamed(session.id, title);
        } catch {
            // Put the old title back rather than leaving the row showing a name the
            // server never accepted. The source app swallowed this silently.
            setDraft(session.title);
            setRenameError(true);
        } finally {
            setSaving(false);
        }
    }

    return (
        <View
            style={[
                styles.row,
                {
                    borderBottomColor: colors.border,
                    backgroundColor: active ? `${colors.primary}18` : 'transparent',
                },
            ]}
        >
            <Pressable style={styles.rowMain} disabled={editing} onPress={() => onSelect(session.id)}>
                {editing ? (
                    <TextInput
                        autoFocus
                        value={draft}
                        onChangeText={setDraft}
                        onBlur={commit}
                        onSubmitEditing={commit}
                        style={[styles.editInput, { color: colors.text, borderBottomColor: colors.border }]}
                    />
                ) : (
                    <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={1}>
                        {session.title}
                    </Text>
                )}
                <Text style={[styles.rowMeta, { color: renameError ? colors.danger : colors.textSecondary }]} numberOfLines={1}>
                    {renameError ? "Couldn't rename — tap the pencil to try again" : ageWordsSince(session.last_at)}
                </Text>
            </Pressable>
            <Pressable
                disabled={saving}
                onPress={() => (editing ? commit() : setEditing(true))}
                style={styles.editButton}
                hitSlop={8}
                accessibilityLabel={editing ? 'Save name' : 'Rename conversation'}
            >
                <Ionicons
                    name={editing ? 'checkmark' : 'pencil'}
                    size={15}
                    color={editing ? colors.primary : colors.textSecondary}
                />
            </Pressable>
        </View>
    );
}

export function ChatHistorySheet({
    visible,
    onClose,
    sessions,
    activeSessionId,
    onSelect,
    onRenamed,
}: {
    visible: boolean;
    onClose: () => void;
    sessions: ChatSessionSummary[];
    activeSessionId: string | null;
    onSelect: (id: string) => void;
    onRenamed: (id: string, title: string) => void;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
            <View style={styles.backdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
                <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: colors.surface }]}>
                    <View style={[styles.header, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.headerTitle, { color: colors.text }]}>Chat history</Text>
                        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
                            <Ionicons name="close" size={20} color={colors.textSecondary} />
                        </Pressable>
                    </View>
                    {sessions.length === 0 ? (
                        <Text style={[styles.empty, { color: colors.textSecondary }]}>No past conversations yet.</Text>
                    ) : (
                        <FlatList
                            data={sessions}
                            keyExtractor={(s) => s.id}
                            style={{ maxHeight: 420 }}
                            renderItem={({ item }) => (
                                <Row
                                    session={item}
                                    active={item.id === activeSessionId}
                                    onSelect={(id) => {
                                        onSelect(id);
                                        onClose();
                                    }}
                                    onRenamed={onRenamed}
                                />
                            )}
                        />
                    )}
                </SafeAreaView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '75%',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
    },
    empty: {
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        paddingVertical: 28,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    rowMain: {
        flex: 1,
        gap: 2,
    },
    rowTitle: {
        fontSize: 14,
        fontWeight: '700',
    },
    rowMeta: {
        fontSize: 11.5,
        fontWeight: '500',
    },
    editInput: {
        fontSize: 14,
        fontWeight: '700',
        borderBottomWidth: 1,
        paddingVertical: 2,
    },
    editButton: {
        padding: 6,
    },
});
