import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CustomerSearchResults, useCustomerSearch } from '@/components/CustomerSearch';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * A dedicated customer-search screen, reachable from the side menu. Reuses
 * the same search hook/results list the old Home-screen search bar and the
 * AI chat's "/" lookup mode already share — see CustomerSearch.tsx.
 */
export default function CustomerSearchScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const [query, setQuery] = useState('');
    const state = useCustomerSearch(query);

    return (
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.topbar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
                    <Ionicons name="arrow-back" size={22} color={colors.text} />
                </Pressable>
                <Ionicons name="search" size={16} color={colors.text} style={{ marginLeft: 12 }} />
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Search a customer by name or phone…"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    returnKeyType="search"
                    autoFocus
                    style={[styles.input, { color: colors.text }]}
                />
                {query.length > 0 && (
                    <Pressable
                        onPress={() => {
                            setQuery('');
                            Keyboard.dismiss();
                        }}
                        hitSlop={8}
                        accessibilityLabel="Clear search"
                    >
                        <Ionicons name="close-circle" size={17} color={colors.placeholder} />
                    </Pressable>
                )}
            </View>

            <View style={{ padding: 16 }}>
                <CustomerSearchResults
                    state={state}
                    onSelect={(item) => {
                        Keyboard.dismiss();
                        router.push({
                            pathname: '/customer/[partyId]',
                            params: { partyId: item.party_id, name: item.name, source: item.source },
                        });
                    }}
                />
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    topbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    input: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '600',
        marginLeft: 8,
        paddingVertical: 4,
    },
});
