/**
 * A photo or PDF someone posted. Photos load with the SmartOps sign-in headers and open
 * full screen when tapped; a PDF shows as a file row.
 */

import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { Attachment, team } from '@/services/teamApi';
import { isImageAttachment } from './chatUi';

type Source = { uri: string; headers: Record<string, string> };

export function TeamImage({ a, colors, width, onDark = false }: {
    a: Attachment; colors: typeof Colors.light; width: number; onDark?: boolean;
}) {
    const [source, setSource] = useState<Source | null>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        let live = true;
        team.fileSource(a).then(s => { if (live) setSource(s); });
        return () => { live = false; };
    }, [a]);

    if (!isImageAttachment(a.mime, a.filename)) {
        return (
            <View style={[styles.file, { backgroundColor: onDark ? 'rgba(255,255,255,0.16)' : colors.background, width }]}>
                <View style={[styles.fileIcon, { backgroundColor: '#E4572E' }]}>
                    <Ionicons name="document-text" size={20} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: onDark ? '#FFF' : colors.text }]} numberOfLines={2}>
                        {a.filename || 'Document.pdf'}
                    </Text>
                    <Text style={[styles.fileKind, { color: onDark ? 'rgba(255,255,255,0.7)' : colors.textSecondary }]}>
                        {(a.mime || '').includes('pdf') || /\.pdf$/i.test(a.filename || '') ? 'PDF' : 'File'}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setOpen(true)} disabled={!source}>
                <View style={[styles.photo, { width, height: width * 0.75, backgroundColor: colors.surfaceSecondary }]}>
                    {source
                        ? <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                        : <Ionicons name="image-outline" size={32} color={colors.textSecondary} />}
                </View>
            </TouchableOpacity>
            <Viewer visible={open} source={source} onClose={() => setOpen(false)} />
        </>
    );
}

function Viewer({ visible, source, onClose }: { visible: boolean; source: Source | null; onClose: () => void }) {
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.viewer} onPress={onClose}>
                {source && <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" />}
                <TouchableOpacity onPress={onClose} style={[styles.close, { top: insets.top + 12 }]} hitSlop={12}>
                    <Ionicons name="close" size={26} color="#FFF" />
                </TouchableOpacity>
            </Pressable>
        </Modal>
    );
}

/** What SmartOps read from the photo, in one quiet line ("Read as: purchase order · PO-112"). */
export function readLine(a: Attachment): string {
    if (a.read_failed) return "Couldn't read it";
    if (a.status === 'received' || !a.status) return 'SmartOps is reading it…';
    const read = [a.kind && a.kind !== 'unknown' ? a.kind.replace(/_/g, ' ') : null, a.ref, a.party].filter(Boolean).join(' · ');
    return read ? `Read as: ${read}` : '';
}

const styles = StyleSheet.create({
    photo: { borderRadius: 14, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
    file: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 8 },
    fileIcon: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
    fileName: { fontSize: 13, fontWeight: '700' },
    fileKind: { fontSize: 11, marginTop: 1 },
    viewer: { flex: 1, backgroundColor: '#000' },
    close: {
        position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center',
    },
});
