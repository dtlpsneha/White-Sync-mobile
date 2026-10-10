import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type Props = {
    children: React.ReactNode;
    onPress?: () => void;
    style?: StyleProp<ViewStyle>;
    /** Remove the default inner padding (for cards that manage their own layout). */
    flush?: boolean;
    /** Colored strip down the left edge, e.g. a status color. */
    accent?: string;
};

/** The one card surface: same fill, border, radius and shadow everywhere. */
export function Card({ children, onPress, style, flush, accent }: Props) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];

    const base: StyleProp<ViewStyle> = [
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
        Shadow.card(theme),
        !flush && styles.padded,
        style,
    ];

    const content = (
        <>
            {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
            {children}
        </>
    );

    if (onPress) {
        return (
            <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={base}>
                {content}
            </TouchableOpacity>
        );
    }
    return <View style={base}>{content}</View>;
}

const styles = StyleSheet.create({
    card: {
        borderRadius: Radius.lg,
        borderWidth: 1,
        overflow: 'hidden',
    },
    padded: { padding: 16 },
    accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
});
