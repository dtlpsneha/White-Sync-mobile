/**
 * Where an order stands, as five steps:
 *   Sales Order → Confirmed → Invoice → Ready → Dispatched
 * Used by My Orders' invoice screen and by the Sales Order screen when opened from My Orders.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, StatusColors } from '@/constants/theme';
import type { OrderStatus } from '@/services/teamApi';

const STEPS: { key: OrderStatus; label: string }[] = [
    { key: 'so_pending', label: 'Sales Order' },
    { key: 'invoice_pending', label: 'Confirmed' },
    { key: 'invoice_generated', label: 'Invoice' },
    { key: 'delivery_pending', label: 'Ready' },
    { key: 'dispatched', label: 'Dispatched' },
];

export const isOrderStatus = (v: unknown): v is OrderStatus => STEPS.some(s => s.key === v);

export function OrderSteps({ status, colors }: { status: OrderStatus; colors: typeof Colors.light }) {
    const at = STEPS.findIndex(s => s.key === status);
    return (
        <View style={styles.steps}>
            {STEPS.map((s, i) => {
                const done = i <= at;
                return (
                    <View key={s.key} style={styles.step}>
                        <View style={[styles.dot, { backgroundColor: done ? StatusColors.approved : colors.surfaceVariant }]}>
                            {done && <Ionicons name="checkmark" size={14} color="#FFF" />}
                        </View>
                        <Text style={[styles.stepText, { color: i === at ? colors.text : colors.textSecondary }]}>{s.label}</Text>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    steps: { flexDirection: 'row', justifyContent: 'space-between' },
    step: { alignItems: 'center', gap: 6, flex: 1 },
    dot: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
    stepText: { fontSize: 10.5, fontWeight: '700', textAlign: 'center' },
});
