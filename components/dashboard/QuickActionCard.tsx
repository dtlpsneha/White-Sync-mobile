/**
 * QuickActionCard.tsx — the lighter shortcut row reserved for pure navigation
 * (Sales Orders, Price Calculator, Daily Sales Report, Invoice History): no fetched
 * number, so it deliberately does not use KpiCard's bold color-fill tile. A full-width
 * row (icon chip + title/subtitle + chevron) rather than a grid tile is the whole point
 * — it's the thing that makes "this is a link, not a stat" legible without a label.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsive } from '@/hooks/useResponsive';

export function QuickActionCard({
    title,
    subtitle,
    icon,
    color,
    onPress,
    delay = 0,
}: {
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    onPress: () => void;
    delay?: number;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { s, vs, ms } = useResponsive();

    return (
        <Animated.View entering={FadeInDown.delay(delay).springify()}>
            <TouchableOpacity
                style={[
                    styles.row,
                    {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                        borderRadius: ms(18),
                        padding: ms(14),
                        gap: s(12),
                    },
                ]}
                onPress={onPress}
            >
                <View
                    style={[
                        styles.iconWrap,
                        { width: ms(44), height: ms(44), borderRadius: ms(14), backgroundColor: `${color}1A` },
                    ]}
                >
                    <Ionicons name={icon} size={ms(22)} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { fontSize: ms(13.5), color: colors.text }]} numberOfLines={1}>
                        {title}
                    </Text>
                    <Text
                        style={[styles.subtitle, { fontSize: ms(11), color: colors.textSecondary, marginTop: vs(2) }]}
                        numberOfLines={1}
                    >
                        {subtitle}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={ms(18)} color={colors.textSecondary} />
            </TouchableOpacity>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
    iconWrap: { justifyContent: 'center', alignItems: 'center' },
    title: { fontWeight: '800' },
    subtitle: { fontWeight: '500' },
});
