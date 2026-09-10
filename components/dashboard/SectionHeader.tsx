/**
 * SectionHeader.tsx — the label above each Home-screen section (Quotations,
 * Quotation Performance, Quick Actions, …).
 *
 * Exists so grouping a section is a one-line addition instead of another hand-rolled
 * `<View><Text>…` block per section, and so every section title reads at the same size
 * and weight.
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';

export function SectionHeader({
    title,
    subtitle,
    actionLabel,
    onAction,
}: {
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onAction?: () => void;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();

    return (
        <View style={[styles.row, { paddingHorizontal: s(16), marginBottom: vs(10) }]}>
            <View style={{ flex: 1 }}>
                <Text style={[styles.title, { fontSize: ms(15), color: colors.text }]}>{title}</Text>
                {subtitle ? (
                    <Text style={[styles.subtitle, { fontSize: ms(11), color: colors.textSecondary }]}>
                        {subtitle}
                    </Text>
                ) : null}
            </View>
            {actionLabel && onAction ? (
                <Pressable onPress={onAction} hitSlop={8} style={styles.action}>
                    <Text style={[styles.actionText, { fontSize: ms(12), color: colors.primary }]}>
                        {actionLabel}
                    </Text>
                    <Ionicons name="chevron-forward" size={ms(14)} color={colors.primary} />
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    title: {
        fontWeight: '900',
    },
    subtitle: {
        fontWeight: '500',
        marginTop: 2,
    },
    action: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    actionText: {
        fontWeight: '800',
    },
});
