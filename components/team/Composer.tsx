/**
 * The message box at the bottom of a Team chat, WhatsApp-style: attach, type, camera, send.
 *
 * Chips above the box are shortcuts. An `insert` chip starts the message ("Ravi, ") --
 * SmartOps reads who a post is for from the name it starts with. A `send` chip sends at
 * once ("Done ✅" closes a job given to you).
 *
 * With nothing typed or attached, the send button is a mic: speak instead of typing. SmartOps
 * writes out what was said -- in English, or Tamil with the EN/த switch -- into the box, to
 * check, correct and send as an ordinary text message. No recording is posted.
 *
 * Attaching a file asks what it is (FileTypeSheet): the document type and that type's few
 * fields. A file is not sent until it has a type -- unless SmartOps is too old to ask.
 */

import React, { useState } from 'react';
import {
    ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import {
    RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
    useAudioRecorderState,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DocType, documentTypeChoices, Filing, PickedFile, PickedVoice, team } from '@/services/teamApi';
import { takePhoto } from './Attach';
import { FileTypeSheet } from './FileTypeSheet';
import { isImageAttachment } from './chatUi';

export interface ComposerChip {
    label: string;
    /** Put this at the start of the message. */
    insert?: string;
    /** Send this straight away. */
    send?: string;
    color?: string;
}

export function Composer({ onSend, placeholder, chips = [], chipsTitle }: {
    onSend: (text: string, file: PickedFile | null, voice?: PickedVoice | null, filing?: Filing | null) => Promise<boolean>;
    placeholder: string;
    chips?: ComposerChip[];
    chipsTitle?: string;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const [text, setText] = useState('');
    const [file, setFile] = useState<PickedFile | null>(null);
    const [filing, setFiling] = useState<Filing | null>(null);
    const [types, setTypes] = useState<DocType[]>([]);
    const [supported, setSupported] = useState(true);
    const [asking, setAsking] = useState(false);
    const [sending, setSending] = useState(false);

    /** The attach sheet: what it is first, then the file (camera, gallery or PDF). */
    const openAttach = async (picked?: PickedFile) => {
        if (picked) setFile(picked);
        if (!types.length) {
            const got = await documentTypeChoices();
            setTypes(got.types);
            setSupported(got.supported);
        }
        setAsking(true);
    };
    const dropFile = () => { setFile(null); setFiling(null); };
    const typeLabel = filing ? types.find(t => t.key === filing.doc_type)?.label ?? filing.doc_type : null;

    const canSend = !sending && (!!text.trim() || !!file);
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recState = useAudioRecorderState(recorder, 250);
    const recording = recState.isRecording;
    const seconds = Math.floor((recState.durationMillis || 0) / 1000);
    const [lang, setLang] = useState<'en' | 'ta'>('en');
    const [writing, setWriting] = useState(false);

    const startRecording = async () => {
        try {
            const { granted } = await requestRecordingPermissionsAsync();
            if (!granted) {
                Alert.alert('Microphone', 'Allow the microphone to record voice notes.');
                return;
            }
            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            recorder.record();
        } catch (e) {
            Alert.alert('Voice note', `Could not start recording: ${String(e)}`);
        }
    };

    /** Stop; write out what was said into the box (`keep`) or bin it. Under a second is a slip. */
    const stopRecording = async (keep: boolean) => {
        const length = (recState.durationMillis || 0) / 1000;
        try {
            await recorder.stop();
        } finally {
            setAudioModeAsync({ allowsRecording: false }).catch(() => { });
        }
        if (!keep || !recorder.uri || length < 1) return;
        setWriting(true);
        const r = await team.transcribe({ uri: recorder.uri, seconds: length });
        setWriting(false);
        if (!r.ok) { Alert.alert('Voice', r.error); return; }
        const words = lang === 'ta' ? (r.data.tamil || r.data.text) : (r.data.text || r.data.tamil);
        setText(t => (t.trim() ? `${t.trim()} ${words}` : words));
    };

    /** Send what is typed, or (from a chip) a fixed line -- which leaves the typed text alone. */
    const send = async (chipText?: string) => {
        const body = chipText ?? text.trim();
        const withFile = chipText ? null : file;
        if (sending || (!body && !withFile)) return;
        setSending(true);
        // A file goes with its type -- unless SmartOps is too old to keep it.
        const ok = await onSend(body, withFile, null, withFile && supported ? filing : null);
        setSending(false);
        if (ok && !chipText) { setText(''); dropFile(); }
    };

    const camera = async () => {
        try {
            const f = await takePhoto();
            if (f) await openAttach(f);
        } catch {
            // the picker explains itself
        }
    };

    const visibleChips = chips.filter(c => c.send || !text.trim());

    return (
        <View style={[styles.wrap, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
            {visibleChips.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.chips}>
                    {!!chipsTitle && <Text style={[styles.chipsTitle, { color: colors.textSecondary }]}>{chipsTitle}</Text>}
                    {visibleChips.map(c => (
                        <TouchableOpacity
                            key={c.label}
                            disabled={sending}
                            onPress={() => (c.send ? send(c.send) : setText(`${c.insert ?? ''}${text}`))}
                            style={[styles.chip, {
                                backgroundColor: c.color ? `${c.color}1F` : colors.surface,
                                borderColor: c.color ? `${c.color}66` : colors.border,
                            }]}
                        >
                            <Text style={[styles.chipText, { color: c.color ?? colors.text }]}>{c.label}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}

            {file && (
                <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {isImageAttachment(file.mimeType, file.name)
                        ? <Image source={{ uri: file.uri }} style={styles.thumb} />
                        : <View style={[styles.thumb, styles.pdf]}><Ionicons name="document-text" size={24} color="#FFF" /></View>}
                    <View style={{ flex: 1, gap: 4 }}>
                        <Text style={[styles.previewName, { color: colors.text }]} numberOfLines={1}>{file.name || 'Photo'}</Text>
                        {types.length > 0 && (
                            <TouchableOpacity onPress={() => { openAttach(); }} hitSlop={6}
                                style={[styles.typeChip, { borderColor: filing ? colors.primary : colors.warning }]}>
                                <Ionicons name={filing ? 'pricetag' : 'help-circle-outline'} size={12}
                                    color={filing ? colors.primary : colors.warning} />
                                <Text style={[styles.typeChipText, { color: filing ? colors.primary : colors.warning }]} numberOfLines={1}>
                                    {typeLabel ? `${typeLabel}${filing?.details.customer || filing?.details.supplier ? ` · ${filing.details.customer || filing.details.supplier}` : ''}` : 'Pick the document type'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity onPress={dropFile} hitSlop={10}>
                        <Ionicons name="close-circle" size={24} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            {recording ? (
                <View style={styles.row}>
                    <View style={[styles.box, styles.recBox, { backgroundColor: colors.surface, borderColor: '#EF4444' }]}>
                        <TouchableOpacity onPress={() => stopRecording(false)} hitSlop={8} style={styles.boxIcon}>
                            <Ionicons name="trash-outline" size={22} color="#EF4444" />
                        </TouchableOpacity>
                        <View style={styles.recDot} />
                        <Text style={[styles.recText, { color: colors.text }]}>
                            Listening {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                        </Text>
                    </View>
                    <TouchableOpacity onPress={() => stopRecording(true)} accessibilityLabel="Write it out"
                        style={[styles.send, { backgroundColor: colors.primary }]}>
                        <Ionicons name="checkmark" size={24} color="#FFF" />
                    </TouchableOpacity>
                </View>
            ) : (
            <View style={styles.row}>
                <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TouchableOpacity onPress={() => { openAttach(); }} hitSlop={8} style={styles.boxIcon}>
                        <Ionicons name="attach" size={24} color={colors.textSecondary} style={{ transform: [{ rotate: '45deg' }] }} />
                    </TouchableOpacity>
                    <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder={placeholder}
                        placeholderTextColor={colors.placeholder}
                        value={text}
                        onChangeText={setText}
                        multiline
                    />
                    {!text.trim() && (
                        <TouchableOpacity onPress={camera} hitSlop={8} style={styles.boxIcon}>
                            <Ionicons name="camera" size={23} color={colors.textSecondary} />
                        </TouchableOpacity>
                    )}
                </View>
                {canSend || sending ? (
                    <TouchableOpacity
                        disabled={!canSend}
                        onPress={() => send()}
                        style={[styles.send, { backgroundColor: colors.primary }]}
                    >
                        {sending
                            ? <ActivityIndicator color="#FFF" size="small" />
                            : <Ionicons name="send" size={20} color="#FFF" style={{ marginLeft: 3 }} />}
                    </TouchableOpacity>
                ) : writing ? (
                    <View style={[styles.send, { backgroundColor: colors.surfaceVariant }]}>
                        <ActivityIndicator color={colors.primary} size="small" />
                    </View>
                ) : (
                    <>
                        <TouchableOpacity onPress={() => setLang(l => (l === 'en' ? 'ta' : 'en'))}
                            accessibilityLabel="Language to write in"
                            style={[styles.lang, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                            <Text style={[styles.langText, { color: colors.primary }]}>{lang === 'en' ? 'EN' : 'த'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={startRecording} accessibilityLabel="Speak instead of typing"
                            style={[styles.send, { backgroundColor: colors.primary }]}>
                            <Ionicons name="mic" size={22} color="#FFF" />
                        </TouchableOpacity>
                    </>
                )}
            </View>
            )}
            {asking && (
                <FileTypeSheet withFile types={types} initial={filing} file={file} onFile={setFile}
                    preview={!supported}
                    onClose={() => { setAsking(false); if (!filing) setFile(null); }}
                    onSave={f => { setFiling(f); setAsking(false); }} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
    typeChipText: { fontSize: 12, fontWeight: '800' },
    wrap: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
    chips: { gap: 8, paddingHorizontal: 2, alignItems: 'center' },
    chipsTitle: { fontSize: 12, fontWeight: '700', marginRight: 2 },
    chip: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
    chipText: { fontSize: 13, fontWeight: '700' },
    preview: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: Radius.md, padding: 8 },
    thumb: { width: 44, height: 44, borderRadius: 8 },
    pdf: { backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
    previewName: { fontSize: 13, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    box: {
        flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderRadius: 24, borderWidth: 1,
        paddingHorizontal: 6, minHeight: 48,
    },
    boxIcon: { width: 36, height: 46, justifyContent: 'center', alignItems: 'center' },
    input: { flex: 1, fontSize: 16, paddingVertical: 12, paddingHorizontal: 4, maxHeight: 120 },
    send: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    recBox: { alignItems: 'center', borderWidth: 1.5 },
    recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginHorizontal: 6 },
    recText: { flex: 1, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
    lang: { height: 48, minWidth: 40, borderRadius: 24, borderWidth: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
    langText: { fontSize: 15, fontWeight: '900' },
});
