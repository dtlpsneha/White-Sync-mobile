import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { PickOption } from './PickerSheet';

/** A bottom sheet that searches as you type -- ERPNext items or customers. */
export function SearchSheet({ visible, title, initial, search, onPick, onClose }: {
    visible: boolean; title: string; initial?: string;
    search: (q: string) => Promise<PickOption[]>;
    onPick: (o: PickOption) => void; onClose: () => void;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const [q, setQ] = useState(initial ?? '');
    const [results, setResults] = useState<PickOption[]>([]);
    const [loading, setLoading] = useState(false);
    const latest = useRef(0);

    useEffect(() => { if (visible) setQ(initial ?? ''); }, [visible, initial]);
    useEffect(() => {
        if (!visible) return;
        const ticket = ++latest.current;
        const t = setTimeout(async () => {
            setLoading(true);
            const found = await search(q);
            if (ticket === latest.current) { setResults(found); setLoading(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [q, visible, search]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
                <View style={styles.head}>
                    <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
                </View>
                <View style={[styles.box, { backgroundColor: colors.surfaceSecondary }]}>
                    <Ionicons name="search" size={18} color={colors.textSecondary} />
                    <TextInput style={[styles.input, { color: colors.text }]} value={q} onChangeText={setQ} autoFocus
                        placeholder="Type to search" placeholderTextColor={colors.placeholder} />
                    {loading && <ActivityIndicator size="small" color={colors.primary} />}
                </View>
                <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                    {results.map(o => (
                        <TouchableOpacity key={o.value} onPress={() => { onPick(o); onClose(); }}
                            style={[styles.row, { borderColor: colors.border }]}>
                            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{o.label}</Text>
                            {!!o.hint && <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>{o.hint}</Text>}
                        </TouchableOpacity>
                    ))}
                    {!loading && results.length === 0 && (
                        <Text style={{ color: colors.textSecondary, textAlign: 'center', padding: 20 }}>Nothing found</Text>
                    )}
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
    head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '900' },
    box: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 12, height: 48, marginBottom: 8 },
    input: { flex: 1, fontSize: 16 },
    row: { paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, gap: 2 },
});
