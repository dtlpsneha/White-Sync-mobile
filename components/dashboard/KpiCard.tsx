import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useResponsive } from '@/hooks/useResponsive';

export type KpiRow = { icon: keyof typeof Ionicons.glyphMap; label: string; value: string };

export function KpiCard({
    title,
    icon,
    color,
    value,
    rows,
    onPress,
    delay = 0,
}: {
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    value: string;
    rows?: KpiRow[];
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
                    borderRadius: ms(20),
                    backgroundColor: color,
                },
            ]}
        >
            <TouchableOpacity style={[styles.content, { padding: ms(14) }]} onPress={onPress} activeOpacity={0.85}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={[styles.title, { fontSize: ms(11) }]} numberOfLines={1}>{title.toUpperCase()}</Text>
                    <View style={[styles.iconWrap, { width: ms(28), height: ms(28), borderRadius: ms(9) }]}>
                        <Ionicons name={icon} size={ms(14)} color="#FFF" />
                    </View>
                </View>

                {/* Rows: detailed view */}
                {rows && rows.length > 0 ? (
                    <View style={styles.rowsWrap}>
                        {rows.map((row, i) => (
                            <View key={i} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', marginTop: vs(6), paddingTop: vs(6) }]}>
                                <Ionicons name={row.icon} size={ms(13)} color="rgba(255,255,255,0.8)" style={{ marginRight: s(6) }} />
                                <Text style={[styles.rowLabel, { fontSize: ms(10) }]} numberOfLines={1}>{row.label}</Text>
                                <Text style={[styles.rowValue, { fontSize: ms(11) }]} numberOfLines={1} adjustsFontSizeToFit>{row.value}</Text>
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.body}>
                        <Text style={[styles.bigNumber, { fontSize: ms(44) }]} numberOfLines={1} adjustsFontSizeToFit>
                            {value}
                        </Text>
                        <Text style={[styles.sublabel, { fontSize: ms(10) }]}>Quotes</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        overflow: 'hidden',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
    },
    content: { flex: 1, justifyContent: 'space-between' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
    title: { fontWeight: '900', color: 'rgba(255,255,255,0.95)', letterSpacing: 0.6, flex: 1, marginRight: 8 },
    iconWrap: { backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    rowsWrap: { gap: 0 },
    row: { flexDirection: 'row', alignItems: 'center' },
    rowLabel: { color: 'rgba(255,255,255,0.75)', fontWeight: '600', flex: 1 },
    rowValue: { color: '#FFF', fontWeight: '900', textAlign: 'right', flexShrink: 0, maxWidth: '55%' },
    body: { flex: 1, justifyContent: 'flex-end', alignItems: 'flex-start' },
    bigNumber: { fontWeight: '900', color: '#FFF', marginBottom: 4 },
    sublabel: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: 0.3 },
});
