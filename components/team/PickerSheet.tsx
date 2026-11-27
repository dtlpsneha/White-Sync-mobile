import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface PickOption { value: string; label: string; hint?: string }

/** A bottom sheet with one list to pick from -- job type, person, brand, customer. */
export function PickerSheet({ visible, title, options, selected, onPick, onClose }: {
    visible: boolean; title: string; options: PickOption[]; selected?: string | null;
    onPick: (value: string) => void; onClose: () => void;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose} />
            <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
                <View style={styles.head}>
                    <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                    <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={colors.textSecondary} /></TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 420 }}>
                    {options.map(o => {
                        const on = o.value === selected;
                        return (
                            <TouchableOpacity
                                key={o.value}
                                onPress={() => { onPick(o.value); onClose(); }}
                                style={[styles.row, { borderColor: colors.border, backgroundColor: on ? colors.surfaceSecondary : 'transparent' }]}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: on ? '800' : '600' }}>{o.label}</Text>
                                    {!!o.hint && <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{o.hint}</Text>}
                                </View>
                                {on && <Ionicons name="checkmark" size={22} color={colors.primary} />}
                            </TouchableOpacity>
                        );
                    })}
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
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderRadius: 10 },
});
