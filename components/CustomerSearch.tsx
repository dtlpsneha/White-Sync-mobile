/**
 * CustomerSearch.tsx — the one customer-search implementation, shared by the Home
 * screen's AI search bar and the AI chat's "/" lookup mode.
 *
 * Smart Customer Resolution itself is server-side (`repo.customer_candidates()`, reached
 * via `searchCustomers`): exact → partial → disambiguation, matching name, phone, email
 * and linked contact records alike. Nothing here re-implements that matching — this hook
 * only debounces, tracks which answer belongs to which query, and renders the rows.
 *
 * Ported from the old app's customer search screen, whose answer-keyed-by-query pattern
 * is the important part and is kept exactly: results, searching and error are all DERIVED
 * at render time by comparing `answer.query` against the live query, never set as their
 * own state inside the debounce. Keystrokes and responses can arrive out of order, and
 * that ordering check is what stops a stale answer being painted over a newer one.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { searchCustomers, type CustomerSearchResult } from '@/services/smartopsApi';

/** Two characters minimum — the server short-circuits below that, so searching would
 * only produce empty answers and wasted round trips. */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

export interface CustomerSearchState {
    /** True once the query is long enough that the results area should show at all. */
    active: boolean;
    searching: boolean;
    results: CustomerSearchResult[];
    error: string | null;
    /** More than one match — the person must disambiguate; nothing auto-selects. */
    disambiguating: boolean;
}

export function useCustomerSearch(query: string): CustomerSearchState {
    const trimmed = query.trim();
    const [answer, setAnswer] = useState<{
        query: string;
        results: CustomerSearchResult[];
        error: string | null;
    } | null>(null);

    useEffect(() => {
        if (trimmed.length < MIN_QUERY) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            searchCustomers(trimmed)
                .then((out) => {
                    if (cancelled) return;
                    if (!out.live) {
                        setAnswer({
                            query: trimmed,
                            results: [],
                            error: "No database connection — customers can't be searched right now.",
                        });
                    } else if (out.erp_error) {
                        // A reachability/config failure behind SmartOps. Deliberately NOT
                        // rendered as "no customers found" — that would read as "this person
                        // doesn't exist" when in fact nothing was ever searched.
                        setAnswer({ query: trimmed, results: [], error: out.erp_error });
                    } else {
                        setAnswer({ query: trimmed, results: out.results, error: null });
                    }
                })
                .catch((err) => {
                    if (cancelled) return;
                    setAnswer({
                        query: trimmed,
                        results: [],
                        error: err instanceof Error ? err.message : 'Search failed.',
                    });
                });
        }, DEBOUNCE_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [trimmed]);

    const current = answer && answer.query === trimmed ? answer : null;
    const active = trimmed.length >= MIN_QUERY;
    const searching = active && current === null;
    const results = current?.results ?? [];
    const error = current?.error ?? null;

    return {
        active,
        searching,
        results,
        error,
        disambiguating: active && !searching && !error && results.length > 1,
    };
}

/** Two-letter initials for the avatar chip, so a name always renders the same. */
export function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

export function CustomerResultRow({
    item,
    onPress,
}: {
    item: CustomerSearchResult;
    onPress: (item: CustomerSearchResult) => void;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const disabled = item.status === 'Disabled';
    // Says WHY this row matched when it wasn't on the name — otherwise a phone-number
    // search returns rows whose connection to what was typed is invisible.
    const matchedValue = item.matched_contact_phone ?? item.matched_contact_email;
    const matchedVia = matchedValue
        ? `Matched via ${item.matched_contact_name ? `${item.matched_contact_name} · ` : ''}${matchedValue}`
        : null;

    return (
        <Pressable
            onPress={() => onPress(item)}
            style={({ pressed }) => [
                styles.row,
                { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
            ]}
        >
            <View style={[styles.avatar, { backgroundColor: disabled ? colors.textSecondary : colors.primary }]}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                </Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {matchedVia ??
                        (disabled
                            ? `Disabled${item.territory ? ` · ${item.territory}` : ''}`
                            : `Active${item.territory ? ` · ${item.territory}` : ''}`)}
                </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
        </Pressable>
    );
}

/** The results area shared by both surfaces — spinner, error, empty, or rows. */
export function CustomerSearchResults({
    state,
    onSelect,
    maxHeight,
}: {
    state: CustomerSearchState;
    onSelect: (item: CustomerSearchResult) => void;
    maxHeight?: number;
}) {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    if (!state.active) return null;

    return (
        <View
            style={[
                styles.panel,
                { backgroundColor: colors.surface, borderColor: colors.border, maxHeight },
            ]}
        >
            {state.searching && (
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={[styles.centeredText, { color: colors.textSecondary }]}>Searching…</Text>
                </View>
            )}

            {!state.searching && state.error && (
                <View style={styles.centered}>
                    <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
                    <Text style={[styles.centeredText, { color: colors.danger }]}>{state.error}</Text>
                </View>
            )}

            {!state.searching && !state.error && state.results.length === 0 && (
                <View style={styles.centered}>
                    <Text style={[styles.centeredText, { color: colors.textSecondary }]}>
                        No customers found. Try another name or phone number.
                    </Text>
                </View>
            )}

            {!state.searching &&
                !state.error &&
                state.results.map((item) => (
                    <CustomerResultRow key={item.party_id} item={item} onPress={onSelect} />
                ))}

            {state.disambiguating && (
                <Text style={[styles.tip, { color: colors.textSecondary, borderTopColor: colors.border }]}>
                    Multiple matches — pick the exact customer. Nothing is auto-selected, and
                    disabled accounts stay visible.
                </Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    panel: {
        borderRadius: 16,
        borderWidth: 1,
        overflow: 'hidden',
    },
    centered: {
        alignItems: 'center',
        gap: 6,
        paddingVertical: 18,
        paddingHorizontal: 16,
    },
    centeredText: {
        fontSize: 12.5,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 18,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#FFF',
        fontSize: 12.5,
        fontWeight: '800',
    },
    rowName: {
        fontSize: 14,
        fontWeight: '700',
    },
    rowMeta: {
        fontSize: 11.5,
        fontWeight: '500',
    },
    tip: {
        fontSize: 11.5,
        fontWeight: '500',
        lineHeight: 17,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
});
