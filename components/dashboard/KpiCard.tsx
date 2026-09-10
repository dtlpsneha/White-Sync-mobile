/**
 * KpiCard.tsx — the big colored tile reserved for cards backed by a real, fetched
 * number (quote-status counts today; Visits follow-up counts once Phase 2 adds them).
 *
 * Deliberately the heavier of the two dashboard card tiers — see QuickActionCard.tsx
 * for the lighter one reserved for pure navigation. Splitting these into two components
 * is what lets a glance tell "this is a live stat" from "this is just a link", which a
 * single shared card style could not do no matter how it was themed.
 *
 * Ported from the quote-status tiles in app/home.tsx rather than redesigned, so the
 * visual language existing users already know carries over unchanged.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useResponsive } from '@/hooks/useResponsive';

export type KpiRow = {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
};

export function KpiCard({
    title,
    icon,
    color,
    rows,
    onPress,
    delay = 0,
}: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    rows: KpiRow[];
    onPress: () => void;
    delay?: number;
}) {
    const { s, vs, ms, width } = useResponsive();

    return (
        <Animated.View
            entering={FadeInDown.delay(delay).springify()}
            style={[
                styles.card,
                {
                    width: (width - s(52)) / 2,
                    borderRadius: ms(24),
                },
                { backgroundColor: color },
            ]}
        >
            <TouchableOpacity style={[styles.content, { padding: ms(20) }]} onPress={onPress}>
                <View style={styles.header}>
                    <Text style={[styles.title, { fontSize: ms(12) }]}>{title}</Text>
                    <View style={[styles.iconWrap, { width: ms(32), height: ms(32), borderRadius: ms(12) }]}>
                        <Ionicons name={icon} size={ms(18)} color="#FFF" />
                    </View>
                </View>
                <View style={[styles.body, { gap: vs(12) }]}>
                    {rows.map((row) => (
                        <View key={row.label} style={[styles.row, { gap: s(4), marginBottom: vs(4) }]}>
                            <View style={[styles.rowLabel, { gap: s(4) }]}>
                                <Ionicons name={row.icon} size={ms(14)} color="rgba(255,255,255,0.8)" />
                                <Text style={[styles.rowLabelText, { fontSize: ms(9) }]} adjustsFontSizeToFit numberOfLines={1}>
                                    {row.label}
                                </Text>
                            </View>
                            <Text style={[styles.rowValue, { fontSize: ms(14) }]} numberOfLines={1} adjustsFontSizeToFit>
                                {row.value}
                            </Text>
                        </View>
                    ))}
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
        aspectRatio: 0.85,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
    },
    content: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontWeight: '900', color: '#FFF', opacity: 0.9, letterSpacing: 0.5 },
    iconWrap: { backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
    body: { flex: 1, justifyContent: 'center' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowLabel: { flexDirection: 'row', alignItems: 'center', flex: 0.8 },
    rowLabelText: { color: 'rgba(255,255,255,0.8)', fontWeight: '700' },
    rowValue: { fontWeight: '900', color: '#FFF', flex: 1.5, textAlign: 'right' },
});
