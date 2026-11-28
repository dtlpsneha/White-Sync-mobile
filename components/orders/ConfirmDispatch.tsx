/**
 * "Mark as Dispatched?" -- a bottom sheet that shows which invoice is about to go, so a tap
 * by mistake does not show the goods as gone.
 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { dmy, inr } from '@/components/orders/format';
import { Sheet } from '@/components/team/Sheet';
import { Colors, Radius, StatusColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { OrderRow } from '@/services/teamApi';

export function ConfirmDispatch({ visible, row, busy, onCancel, onConfirm }: {
    visible: boolean; row: OrderRow; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    const tint = StatusColors.reopen;
    // While it is saving, the sheet stays: closing it would hide whether it worked.
    const close = () => { if (!busy) onCancel(); };

    return (
        <Sheet visible={visible} onClose={close} title="Mark as Dispatched?" subtitle="Check the invoice before you confirm">
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <View style={[styles.icon, { backgroundColor: `${tint}24` }]}>
                    <Ionicons name="cube" size={22} color={tint} />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.customer, { color: colors.text }]}>{row.customer_name || row.customer}</Text>
                    <Text style={[styles.meta, { color: colors.textSecondary }]}>
                        {[`Invoice ${row.number}`, dmy(row.date)].filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={[styles.amount, { color: colors.text }]}>{inr(row.amount)}</Text>
                </View>
            </View>

            <View style={styles.hint}>
                <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                    Team Chat is told. It moves to Delivered once the LR copy is added.
                </Text>
            </View>

            <View style={styles.actions}>
                <TouchableOpacity disabled={busy} onPress={close} activeOpacity={0.85}
                    style={[styles.button, styles.cancel, { borderColor: colors.border, opacity: busy ? 0.5 : 1 }]}>
                    <Text style={[styles.buttonText, { color: colors.text }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={onConfirm} activeOpacity={0.85}
                    style={[styles.button, styles.confirm, { backgroundColor: tint }]}>
                    {busy ? <ActivityIndicator color="#FFF" /> : <>
                        <Ionicons name="checkmark" size={18} color="#FFF" />
                        <Text style={[styles.buttonText, { color: '#FFF' }]}>Yes, dispatched</Text>
                    </>}
                </TouchableOpacity>
            </View>
        </Sheet>
    );
}

const styles = StyleSheet.create({
    card: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: Radius.md, padding: 14 },
    icon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
    customer: { fontSize: 15.5, fontWeight: '800', lineHeight: 21 },
    meta: { fontSize: 12.5, fontWeight: '600' },
    amount: { fontSize: 17, fontWeight: '900', marginTop: 4 },
    hint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
    hintText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16 },
    cancel: { flex: 1, borderWidth: 1 },
    confirm: { flex: 1.5 },
    buttonText: { fontSize: 15, fontWeight: '800' },
});
