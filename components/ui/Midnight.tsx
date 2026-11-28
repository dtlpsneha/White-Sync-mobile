/**
 * Building blocks of the Midnight x Ember look: figures on the charcoal header
 * band, a step tracker for multi-step forms, and section cards led by a dark
 * icon tile. Screens put BandStats / StepTracker inside <ScreenHeader> and
 * SectionCard in the page body.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const INK2 = '#2A302C';
const INK3 = '#3A413C';
const ON_INK = '#E9DFCF';
const ON_INK_MUTED = '#A79C8E';

/** Big system font sizes still grow text, but not past the point where tiles overflow. */
const FONT_CAP = 1.25;
/** Phones narrower than this get tighter tiles and step labels. */
const COMPACT_WIDTH = 360;

export type BandStat = { label: string; value: string; note?: string; color?: string; flex?: number };

/** Up to three figures in raised tiles on the header band. */
export function BandStats({ items }: { items: BandStat[] }) {
    const { width } = useWindowDimensions();
    const compact = width < COMPACT_WIDTH;
    return (
        <View style={[styles.stats, compact && { gap: 8 }]}>
            {items.map(it => (
                <View key={it.label} style={[styles.stat, compact && styles.statCompact, { flex: it.flex ?? 1 }]}>
                    <Text style={styles.statLabel} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{it.label}</Text>
                    <Text
                        style={[styles.statValue, compact && { fontSize: 19 }, { color: it.color ?? '#FFF' }]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        maxFontSizeMultiplier={FONT_CAP}
                    >
                        {it.value}
                    </Text>
                    {it.note ? <Text style={styles.statNote} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{it.note}</Text> : null}
                </View>
            ))}
        </View>
    );
}

/** Numbered steps on the header band: done steps turn green, the current one terracotta. */
export function StepTracker({ steps, current }: { steps: string[]; current: number }) {
    const { width } = useWindowDimensions();
    // On narrow phones only the current step keeps its name, so the row never overflows.
    const compact = width < COMPACT_WIDTH + 30;
    return (
        <View style={styles.steps}>
            {steps.map((name, i) => {
                const n = i + 1;
                const done = n < current;
                const on = n === current;
                return (
                    <React.Fragment key={name}>
                        <View style={styles.step}>
                            <View style={[styles.stepDot, done && styles.stepDotDone, on && styles.stepDotOn]}>
                                {done ? (
                                    <Ionicons name="checkmark" size={12} color="#FFF" />
                                ) : (
                                    <Text style={[styles.stepNum, on && { color: '#FFF' }]}>{n}</Text>
                                )}
                            </View>
                            {!compact || on ? (
                                <Text
                                    style={[styles.stepText, done && { color: ON_INK }, on && { color: '#FFF' }]}
                                    numberOfLines={1}
                                    maxFontSizeMultiplier={FONT_CAP}
                                >
                                    {name}
                                </Text>
                            ) : null}
                        </View>
                        {n < steps.length ? <View style={[styles.stepLine, done && { backgroundColor: '#2F7D5B' }]} /> : null}
                    </React.Fragment>
                );
            })}
        </View>
    );
}

/** Small read-only chips on the header band (e.g. the choices made so far). */
export function BandChips({ items }: { items: string[] }) {
    return (
        <View style={styles.bandChips}>
            {items.map(t => (
                <View key={t} style={styles.bandChip}>
                    <Text style={styles.bandChipText} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{t}</Text>
                </View>
            ))}
        </View>
    );
}

/** Dark rounded tile holding an icon (or a number) in the accent colour. */
export function InkTile({ icon, label, size = 36, color = '#E4572E' }: {
    icon?: keyof typeof Ionicons.glyphMap;
    label?: string;
    size?: number;
    color?: string;
}) {
    const theme = useColorScheme() ?? 'light';
    return (
        <View style={[styles.tile, { backgroundColor: Colors[theme].ink, width: size, height: size, borderRadius: Math.round(size * 0.31) }]}>
            {icon ? (
                <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
            ) : (
                <Text style={styles.tileText}>{label}</Text>
            )}
        </View>
    );
}

/** White card that opens with an ink tile, a title and an optional subtitle. */
export function SectionCard({ icon, number, title, subtitle, right, children, style }: {
    icon?: keyof typeof Ionicons.glyphMap;
    number?: number;
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const theme = useColorScheme() ?? 'light';
    const colors = Colors[theme];
    return (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, Shadow.card(theme), style]}>
            <View style={styles.cardHead}>
                <InkTile icon={icon} label={number !== undefined ? String(number) : undefined} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2} maxFontSizeMultiplier={FONT_CAP}>{title}</Text>
                    {subtitle ? <Text style={[styles.cardSub, { color: colors.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={FONT_CAP}>{subtitle}</Text> : null}
                </View>
                {right}
            </View>
            {children}
        </View>
    );
}

/** A soft pill: status text in its colour on a light wash of the same colour. */
export function StatusPill({ text, color, onDark }: { text: string; color: string; onDark?: boolean }) {
    return (
        <View style={[styles.pill, { backgroundColor: onDark ? 'rgba(255,255,255,0.1)' : color + '1F' }]}>
            <View style={[styles.pillDot, { backgroundColor: color }]} />
            <Text style={[styles.pillText, { color: onDark ? '#FFF' : color }]} numberOfLines={1} maxFontSizeMultiplier={FONT_CAP}>{text}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    stats: { flexDirection: 'row', gap: 10 },
    stat: { backgroundColor: INK2, borderRadius: 16, padding: 12, minWidth: 0 },
    statCompact: { padding: 10, borderRadius: 14 },
    statLabel: { fontSize: 11, fontWeight: '600', color: ON_INK_MUTED },
    statValue: { fontSize: 22, fontWeight: '800', marginTop: 4, letterSpacing: -0.3 },
    statNote: { fontSize: 10.5, color: ON_INK_MUTED, marginTop: 2 },

    steps: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: INK2, alignItems: 'center', justifyContent: 'center' },
    stepDotOn: { backgroundColor: '#E4572E' },
    stepDotDone: { backgroundColor: '#2F7D5B' },
    stepNum: { fontSize: 11, fontWeight: '800', color: ON_INK_MUTED },
    stepText: { fontSize: 11.5, fontWeight: '700', color: ON_INK_MUTED },
    stepLine: { flex: 1, height: 2, borderRadius: 1, backgroundColor: INK3 },

    bandChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    bandChip: { backgroundColor: INK2, borderRadius: Radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
    bandChipText: { color: ON_INK, fontSize: 11.5, fontWeight: '700' },

    tile: { backgroundColor: '#1F2421', alignItems: 'center', justifyContent: 'center' },
    tileText: { color: '#FFF', fontWeight: '800', fontSize: 14 },

    card: { borderRadius: Radius.lg, borderWidth: 1, padding: 16, gap: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardTitle: { fontSize: 15, fontWeight: '800' },
    cardSub: { fontSize: 12, marginTop: 1, fontWeight: '500' },

    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radius.pill, alignSelf: 'flex-start' },
    pillDot: { width: 6, height: 6, borderRadius: 3 },
    pillText: { fontSize: 11, fontWeight: '800' },
});
