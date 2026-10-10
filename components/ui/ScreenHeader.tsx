import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gradients, Radius } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';

type Props = {
    title: string;
    subtitle?: string;
    onBack?: () => void;
    /** Icon button on the right (e.g. filters). */
    rightIcon?: keyof typeof Ionicons.glyphMap;
    onRightPress?: () => void;
    /** Free-form content on the right; used instead of rightIcon. */
    right?: React.ReactNode;
    /** Content under the title row — search bars, filter pills, summary tiles. */
    children?: React.ReactNode;
};

/**
 * The one header every screen uses: brand gradient, rounded bottom edge, white
 * title. Keep screen content out of here; pass only the title row and any
 * search or filter controls via `children`.
 */
export function ScreenHeader({ title, subtitle, onBack, rightIcon, onRightPress, right, children }: Props) {
    const insets = useSafeAreaInsets();
    const { ms } = useResponsive();

    return (
        <LinearGradient
            colors={Gradients.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.wrap, { paddingTop: insets.top + 10 }]}
        >
            <StatusBar style="light" />
            <View style={styles.row}>
                {onBack ? (
                    <TouchableOpacity onPress={onBack} activeOpacity={0.8} style={styles.iconBtn} hitSlop={8}>
                        <Ionicons name="chevron-back" size={22} color="#FFF" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.iconSpacer} />
                )}

                <View style={styles.titleWrap}>
                    <Text style={[styles.title, { fontSize: ms(19) }]} numberOfLines={1}>{title}</Text>
                    {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
                </View>

                {right ? (
                    right
                ) : rightIcon && onRightPress ? (
                    <TouchableOpacity onPress={onRightPress} activeOpacity={0.8} style={styles.iconBtn} hitSlop={8}>
                        <Ionicons name={rightIcon} size={20} color="#FFF" />
                    </TouchableOpacity>
                ) : (
                    <View style={styles.iconSpacer} />
                )}
            </View>
            {children ? <View style={styles.body}>{children}</View> : null}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    wrap: {
        paddingHorizontal: 16,
        paddingBottom: 18,
        borderBottomLeftRadius: Radius.xl,
        borderBottomRightRadius: Radius.xl,
        shadowColor: '#4338CA',
        shadowOpacity: 0.28,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
        zIndex: 10,
    },
    row: { flexDirection: 'row', alignItems: 'center' },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconSpacer: { width: 40, height: 40 },
    titleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
    title: { color: '#FFF', fontWeight: '800', letterSpacing: -0.2 },
    subtitle: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600', marginTop: 2 },
    body: { marginTop: 14 },
});
