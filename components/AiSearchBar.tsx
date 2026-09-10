/**
 * AiSearchBar.tsx — the Home screen's customer search, and the floating bubble that
 * opens the assistant.
 *
 * Both live here because they're two halves of the same entry point: the bar finds a
 * customer and hands off to their profile, the bubble opens a blank assistant. The search
 * itself is `useCustomerSearch` — the same hook the chat's "/" mode uses, so the two
 * surfaces can't drift apart in what they match on or how they report a failure.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { CustomerSearchResults, useCustomerSearch } from '@/components/CustomerSearch';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function AiSearchBar() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    const [query, setQuery] = useState('');
    const [focused, setFocused] = useState(false);
    const state = useCustomerSearch(query);

    return (
        <View style={styles.wrapper}>
            <View
                style={[
                    styles.bar,
                    {
                        backgroundColor: colors.surface,
                        borderColor: focused ? colors.primary : colors.border,
                    },
                ]}
            >
                <Ionicons name="sparkles" size={17} color={colors.primary} />
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder="Search a customer by name or phone…"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    returnKeyType="search"
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

            <CustomerSearchResults
                state={state}
                maxHeight={320}
                onSelect={(item) => {
                    Keyboard.dismiss();
                    setQuery('');
                    router.push({
                        pathname: '/customer/[partyId]',
                        params: { partyId: item.party_id, name: item.name, source: item.source },
                    });
                }}
            />
        </View>
    );
}

/**
 * The assistant entry point. Sits above the page content but below the FloatingNav, and
 * opens a blank chat — no customer attached, no suggested prompts (see `ai-chat.tsx`).
 */
export function AiBubble() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    return (
        <Pressable
            onPress={() => router.push('/ai-chat')}
            accessibilityLabel="Open SmartOps AI assistant"
            style={({ pressed }) => [
                styles.bubble,
                {
                    backgroundColor: colors.primary,
                    shadowColor: colors.primary,
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                },
            ]}
        >
            <Ionicons name="sparkles" size={24} color="#FFF" />
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        gap: 8,
        // Lifts the dropdown above the cards below it, which would otherwise paint over
        // the results on Android where later siblings win regardless of zIndex alone.
        zIndex: 20,
        elevation: 20,
    },
    bar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1.5,
        borderRadius: 16,
        paddingHorizontal: 15,
        paddingVertical: 12,
    },
    input: {
        flex: 1,
        fontSize: 14.5,
        fontWeight: '600',
        padding: 0,
    },
    bubble: {
        position: 'absolute',
        right: 22,
        // Clears the FloatingNav (78px tall, sitting 30px off the bottom).
        bottom: 124,
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 999,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
});
