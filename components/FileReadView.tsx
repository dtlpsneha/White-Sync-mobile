import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, toneFor } from '@/constants/theme';
import { dmyDate, FileRead, rupees } from '@/services/attachmentsApi';

type Props = {
    read: FileRead | undefined;
    theme: 'light' | 'dark';
    /** What the reference is called: "PO no" on a Customer PO, "Bill no" on a visit bill. */
    refLabel?: string;
    partyLabel?: string;
};

/** What SmartOps read from one attached file, and where it differs from the record. */
export function FileReadView({ read, theme, refLabel = 'PO no', partyLabel = 'Customer' }: Props) {
    const colors = Colors[theme];
    const [showLines, setShowLines] = useState(false);
    const warn = toneFor(theme, '#D99A14');
    const bad = toneFor(theme, '#C8423B');
    const good = toneFor(theme, '#2F7D5B');

    if (!read) {
        return <Text style={[styles.muted, { color: colors.textSecondary }]}>Not read yet — SmartOps picks it up in a few minutes.</Text>;
    }
    if (read.state === 'reading') {
        return (
            <View style={styles.row}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.muted, { color: colors.textSecondary }]}>Reading the file…</Text>
            </View>
        );
    }
    if (read.state !== 'read') {
        const why = read.state === 'unreadable' ? 'Not a document SmartOps can read.'
            : read.state === 'failed' ? 'SmartOps could not fetch the file; it will try again.'
                : 'Nothing could be read from this file.';
        return (
            <View style={styles.row}>
                <Ionicons name="alert-circle-outline" size={15} color={bad} />
                <Text style={[styles.muted, { color: colors.textSecondary, flex: 1 }]}>{why}</Text>
            </View>
        );
    }

    const values: [string, string][] = [
        [refLabel, read.ref || ''],
        ['Date', dmyDate(read.date)],
        [partyLabel, read.party || ''],
        ['Amount', rupees(read.total)],
    ].filter(([, v]) => v) as [string, string][];

    return (
        <View style={{ gap: 8 }}>
            <View style={styles.row}>
                <Ionicons name="scan-outline" size={14} color={colors.primary} />
                <Text style={[styles.caption, { color: colors.textSecondary }]}>Read from the file</Text>
            </View>
            {values.length ? (
                <View style={styles.grid}>
                    {values.map(([k, v]) => (
                        <View key={k} style={styles.cell}>
                            <Text style={[styles.key, { color: colors.textSecondary }]}>{k}</Text>
                            <Text style={[styles.value, { color: colors.text }]} numberOfLines={2}>{v}</Text>
                        </View>
                    ))}
                </View>
            ) : (
                <Text style={[styles.muted, { color: colors.textSecondary }]}>No PO number, date or amount found on it.</Text>
            )}

            {read.lines.length > 0 && (
                <View>
                    <TouchableOpacity style={styles.row} onPress={() => setShowLines(s => !s)} hitSlop={6}>
                        <Text style={[styles.link, { color: colors.primary }]}>
                            {read.lines.length} item line{read.lines.length === 1 ? '' : 's'}
                        </Text>
                        <Ionicons name={showLines ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} />
                    </TouchableOpacity>
                    {showLines && read.lines.map((ln, i) => (
                        <View key={i} style={[styles.lineRow, { borderTopColor: colors.border }]}>
                            <Text style={[styles.lineText, { color: colors.text, flex: 1 }]} numberOfLines={2}>{ln.description || ln.item_code}</Text>
                            <Text style={[styles.lineText, { color: colors.textSecondary }]}>
                                {ln.qty !== null ? `${ln.qty}${ln.uom ? ' ' + ln.uom : ''}` : ''}
                                {ln.amount ? `  ${rupees(ln.amount)}` : ''}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            {read.differences.length > 0 ? (
                <View style={[styles.diffBox, { backgroundColor: warn + '1A', borderColor: warn + '55' }]}>
                    <View style={styles.row}>
                        <Ionicons name="warning-outline" size={15} color={warn} />
                        <Text style={[styles.diffTitle, { color: warn }]}>
                            {read.differences.length} difference{read.differences.length === 1 ? '' : 's'} from the order
                        </Text>
                    </View>
                    {read.differences.map((d, i) => (
                        <Text key={i} style={[styles.diffText, { color: colors.text }]}>• {d}</Text>
                    ))}
                </View>
            ) : refLabel === 'PO no' ? (
                <View style={styles.row}>
                    <Ionicons name="checkmark-circle-outline" size={15} color={good} />
                    <Text style={[styles.muted, { color: colors.textSecondary }]}>Matches the order</Text>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    muted: { fontSize: 12, fontWeight: '600' },
    caption: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
    cell: { width: '50%', paddingRight: 8, minWidth: 0 },
    key: { fontSize: 11, fontWeight: '700' },
    value: { fontSize: 13, fontWeight: '800', marginTop: 1 },
    link: { fontSize: 12, fontWeight: '800' },
    lineRow: { flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
    lineText: { fontSize: 12, fontWeight: '600' },
    diffBox: { borderWidth: 1, borderRadius: Radius.md, padding: 10, gap: 4 },
    diffTitle: { fontSize: 12, fontWeight: '800' },
    diffText: { fontSize: 12, fontWeight: '600', lineHeight: 17 },
});
