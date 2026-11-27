import React from 'react';
import {
    KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** A bottom sheet for a short form or list: the ERPNext step, payment matches. */
export function Sheet({ visible, title, subtitle, onClose, children }: {
    visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}>
                    <View style={[styles.grabber, { backgroundColor: colors.border }]} />
                    <View style={styles.head}>
                        <View style={{ flex: 1 }}>
                            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                            {!!subtitle && <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>}
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
                        {children}
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(10,15,25,0.45)' },
    sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, paddingHorizontal: 20, paddingTop: 10 },
    grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },
    head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 12 },
    title: { fontSize: 19, fontWeight: '900' },
    subtitle: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
