import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CustomerSearchResults, useCustomerSearch } from '@/components/CustomerSearch';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius } from '@/constants/theme';
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
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader
                title="Customer Search"
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            >
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={16} color={colors.primary} />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Search a customer by name or phone…"
                        placeholderTextColor={colors.placeholder}
                        autoCapitalize="none"
                        returnKeyType="search"
                        autoFocus
                        style={styles.input}
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
            </ScreenHeader>

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
        </View>
    );
}

const styles = StyleSheet.create({
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: Radius.md,
        paddingHorizontal: 14,
        height: 46,
        gap: 8,
    },
    input: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '600',
        color: '#0F172A',
        paddingVertical: 4,
    },
});
