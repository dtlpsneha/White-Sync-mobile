/**
 * customer/[partyId].tsx — Customer 360, reached from the Home screen's AI search bar.
 *
 * Everything here comes from the single gated `GET /bff/v1/reception/customer/lookup`
 * route — the same `crm.customer.*` tools the chat loop calls mid-turn. No separate
 * ERPNext integration and no duplicated ownership logic: who may see which customer is
 * enforced server-side, and this screen renders whatever comes back.
 *
 * Data boundary: name, status, territory, contact, credit limit, quotes, invoices,
 * outstanding, assigned salesperson — and nothing else. No score, tier, margin, profit,
 * health or recommendation fields exist in the API response at all, so there is nothing
 * of that kind to accidentally render here.
 *
 * Ported from the old app's Customer 360 screen, restyled onto this app's tokens.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { initials } from '@/components/CustomerSearch';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { chatErrorMessage, lookupCustomer, type CustomerLookupOut } from '@/services/smartopsApi';

/** Quotes/invoices carry ALREADY-DIVIDED rupee floats — a backend quirk, so no rescale. */
function money(rupeeValue: number | null | undefined): string {
    if (rupeeValue === null || rupeeValue === undefined) return '-';
    return `₹${rupeeValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `credit_limit_paise` really is paise, unlike the fields above — divide, don't reuse. */
function rupeesFromPaise(paise: number | null): string {
    if (paise === null || paise === undefined) return '-';
    return money(paise / 100);
}

function isOverdue(dueDate: string | null): boolean {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
}

export default function CustomerProfileScreen() {
    const { partyId, name, source } = useLocalSearchParams<{
        partyId: string;
        name?: string;
        source?: string;
    }>();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const [data, setData] = useState<CustomerLookupOut | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        lookupCustomer(partyId)
            .then((out) => {
                if (cancelled) return;
                setData(out);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(chatErrorMessage(err));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [partyId]);

    const profile = data?.profile.profile ?? null;
    // Falls back to whatever the search row already knew, so the header still names the
    // customer even when the lookup itself failed.
    const displayName = profile?.name ?? name ?? 'Customer';

    function askAi() {
        router.push({
            pathname: '/ai-chat',
            params: {
                customerId: partyId,
                customerName: displayName,
                customerSource: profile ? (data?.profile.source ?? 'erpnext') : (source ?? 'erpnext'),
            },
        });
    }

    const invoices = data?.invoices.available ? data.invoices.invoices : [];
    const quotes = data?.quotes.available ? data.quotes.quotes : [];
    const outstandingTotal = data?.invoices.available
        ? invoices.reduce((sum, i) => sum + (i.outstanding ?? 0), 0)
        : null;
    const assignment = data?.assigned_to.assignment ?? null;

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
                <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </Pressable>
                <Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>
                    {displayName}
                </Text>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={colors.primary} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.container}>
                    {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}
                    {data?.erp_error && (
                        <Text style={[styles.errorText, { color: colors.danger }]}>{data.erp_error}</Text>
                    )}
                    {data && !data.live && (
                        <Text style={[styles.errorText, { color: colors.danger }]}>
                            No database connection — this customer can&apos;t be looked up right now.
                        </Text>
                    )}

                    <View style={styles.identity}>
                        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                            <Text style={styles.avatarText}>{initials(displayName)}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 6, paddingTop: 2 }}>
                            <Text style={[styles.name, { color: colors.text }]}>{displayName}</Text>
                            <View style={styles.identityMeta}>
                                {profile?.status && (
                                    <View
                                        style={[
                                            styles.badge,
                                            {
                                                backgroundColor:
                                                    profile.status === 'Disabled'
                                                        ? `${colors.danger}22`
                                                        : `${colors.success}22`,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.badgeText,
                                                {
                                                    color:
                                                        profile.status === 'Disabled'
                                                            ? colors.danger
                                                            : colors.success,
                                                },
                                            ]}
                                        >
                                            {profile.status === 'Disabled' ? 'Disabled' : 'Active'}
                                        </Text>
                                    </View>
                                )}
                                {profile?.territory && (
                                    <Text style={[styles.territory, { color: colors.textSecondary }]}>
                                        {profile.territory}
                                    </Text>
                                )}
                            </View>
                        </View>
                    </View>

                    {!profile ? (
                        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
                                {data?.profile.message ?? 'Profile unavailable.'}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, gap: 11 }]}>
                            <InfoRow icon="call-outline" label="Mobile" value={profile.mobile_no} colors={colors} />
                            <InfoRow icon="mail-outline" label="Email" value={profile.email_id} colors={colors} />
                            <InfoRow icon="location-outline" label="Address" value={profile.address} colors={colors} multiline />
                            <InfoRow
                                icon="card-outline"
                                label="Credit limit"
                                value={profile.credit_limit_paise !== null ? rupeesFromPaise(profile.credit_limit_paise) : null}
                                colors={colors}
                            />
                        </View>
                    )}

                    <View style={styles.statsGrid}>
                        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.statValue, { color: colors.text }]}>
                                {data?.quotes.available ? quotes.length : '-'}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Quotes</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.statValue, { color: colors.text }]}>
                                {data?.invoices.available ? invoices.length : '-'}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Invoices</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: `${colors.danger}18`, borderColor: 'transparent' }]}>
                            <Text style={[styles.statValueSm, { color: colors.danger }]}>
                                {outstandingTotal !== null ? money(outstandingTotal) : '-'}
                            </Text>
                            <Text style={[styles.statLabel, { color: colors.danger }]}>Outstanding</Text>
                        </View>
                    </View>

                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent activity</Text>
                    <ActivityCard
                        label="Latest quote"
                        reference={quotes[0]?.ref ?? null}
                        meta={quotes[0] ? `${quotes[0].status}${quotes[0].date ? ` · ${quotes[0].date}` : ''}` : null}
                        amount={quotes[0] ? money(quotes[0].total) : null}
                        empty="No quotes on record."
                        icon="document-text-outline"
                        colors={colors}
                    />
                    <ActivityCard
                        label="Latest invoice"
                        reference={invoices[0]?.ref ?? null}
                        meta={
                            invoices[0]
                                ? `${isOverdue(invoices[0].due_date) ? 'Overdue' : invoices[0].status}${invoices[0].due_date ? ` · due ${invoices[0].due_date}` : ''}`
                                : null
                        }
                        amount={invoices[0] ? money(invoices[0].outstanding) : null}
                        alert={invoices[0] ? isOverdue(invoices[0].due_date) : false}
                        empty="No outstanding invoices."
                        icon="time-outline"
                        colors={colors}
                    />

                    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Assigned to</Text>
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        {assignment ? (
                            <View style={styles.assignee}>
                                <View style={[styles.assigneeAvatar, { backgroundColor: colors.primary }]}>
                                    <Text style={styles.assigneeInitials}>
                                        {assignment.salesperson ? initials(assignment.salesperson) : '?'}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, gap: 1 }}>
                                    <Text style={[styles.assigneeName, { color: colors.text }]}>
                                        {assignment.salesperson ?? 'Unassigned'}
                                    </Text>
                                    <Text style={[styles.assigneeRole, { color: colors.textSecondary }]}>
                                        Salesperson
                                        {assignment.manager ? ` · reports to ${assignment.manager}` : ' · no manager on file'}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[styles.mutedText, { color: colors.textSecondary }]}>
                                {data?.assigned_to.message ?? 'Not available.'}
                            </Text>
                        )}
                    </View>

                    <Pressable
                        onPress={askAi}
                        style={({ pressed }) => [
                            styles.askButton,
                            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                        ]}
                    >
                        <Ionicons name="sparkles" size={17} color="#FFF" />
                        <Text style={styles.askButtonText}>Ask AI about this customer</Text>
                    </Pressable>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

type ThemeColors = (typeof Colors)['light'];

function InfoRow({
    icon,
    label,
    value,
    colors,
    multiline,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string | null;
    colors: ThemeColors;
    multiline?: boolean;
}) {
    // A long address doesn't fit the label-left/value-right single line the other fields
    // use — stack it instead, keeping the same leading icon.
    if (multiline) {
        return (
            <View style={styles.infoRowMultiline}>
                <Ionicons name={icon} size={16} color={colors.placeholder} />
                <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
                    <Text style={[styles.infoValueMultiline, { color: value ? colors.text : colors.placeholder }]}>
                        {value ?? 'Not on file'}
                    </Text>
                </View>
            </View>
        );
    }
    return (
        <View style={styles.infoRow}>
            <Ionicons name={icon} size={16} color={colors.placeholder} />
            <Text style={[styles.infoLabel, { color: colors.textSecondary, flex: 1 }]}>{label}</Text>
            <Text style={[styles.infoValue, { color: value ? colors.text : colors.placeholder }]}>
                {value ?? 'Not on file'}
            </Text>
        </View>
    );
}

function ActivityCard({
    label,
    reference,
    meta,
    amount,
    empty,
    icon,
    colors,
    alert,
}: {
    label: string;
    reference: string | null;
    meta: string | null;
    amount: string | null;
    empty: string;
    icon: keyof typeof Ionicons.glyphMap;
    colors: ThemeColors;
    alert?: boolean;
}) {
    if (!reference) {
        return (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.mutedText, { color: colors.textSecondary }]}>{empty}</Text>
            </View>
        );
    }
    const tint = alert ? colors.danger : colors.primary;
    return (
        <View style={[styles.card, styles.activityRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.activityIcon, { backgroundColor: `${tint}18` }]}>
                <Ionicons name={icon} size={16} color={tint} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.activityLabel, { color: colors.textSecondary }]}>{label}</Text>
                <Text style={[styles.activityRef, { color: colors.text }]} numberOfLines={1}>
                    {reference}
                </Text>
                {meta && (
                    <Text style={[styles.activityMeta, { color: alert ? colors.danger : colors.placeholder }]}>
                        {meta}
                    </Text>
                )}
            </View>
            {amount && <Text style={[styles.activityAmount, { color: alert ? colors.danger : colors.text }]}>{amount}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    topBarTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '800',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        padding: 20,
        gap: 14,
        paddingBottom: 40,
    },
    errorText: {
        fontSize: 13,
        fontWeight: '600',
    },
    identity: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
    },
    avatar: {
        width: 54,
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
    },
    name: {
        fontSize: 18,
        fontWeight: '800',
        lineHeight: 23,
    },
    identityMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    badge: {
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 3,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    territory: {
        fontSize: 12,
        fontWeight: '600',
    },
    card: {
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        padding: 15,
    },
    mutedText: {
        fontSize: 13,
        fontWeight: '500',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    infoRowMultiline: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    infoLabel: {
        fontSize: 12.5,
        fontWeight: '500',
    },
    infoValue: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    infoValueMultiline: {
        fontSize: 13.5,
        fontWeight: '700',
        lineHeight: 19,
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 9,
    },
    statCard: {
        flex: 1,
        gap: 3,
        borderRadius: 16,
        borderWidth: StyleSheet.hairlineWidth,
        paddingVertical: 13,
        paddingHorizontal: 11,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
    },
    statValueSm: {
        fontSize: 15,
        fontWeight: '800',
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '600',
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: 2,
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    activityIcon: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityLabel: {
        fontSize: 11.5,
        fontWeight: '600',
    },
    activityRef: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    activityMeta: {
        fontSize: 11,
        fontWeight: '500',
    },
    activityAmount: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    assignee: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    assigneeAvatar: {
        width: 34,
        height: 34,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    assigneeInitials: {
        color: '#FFF',
        fontSize: 12.5,
        fontWeight: '800',
    },
    assigneeName: {
        fontSize: 14,
        fontWeight: '700',
    },
    assigneeRole: {
        fontSize: 11.5,
        fontWeight: '500',
    },
    askButton: {
        marginTop: 6,
        borderRadius: 14,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    askButtonText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '700',
    },
});
