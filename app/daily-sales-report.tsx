import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { useResponsive } from '@/hooks/useResponsive';
import { DailySalesReportBody } from '@/components/dashboard/DailySalesReportBody';
import { ScreenHeader } from '@/components/ui/ScreenHeader';

export default function DailySalesReportScreen() {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const { vs } = useResponsive();
    const styles = getStyles({ vs });

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScreenHeader
                title="Daily Sales Report (Cumulative)"
                onBack={() => router.canGoBack() ? router.back() : router.replace('/home')}
            />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <DailySalesReportBody />
            </ScrollView>
        </View>
    );
}

function getStyles({ vs }: { vs: (n: number) => number }) {
    return StyleSheet.create({
        container: { flex: 1 },
        scrollContent: { paddingBottom: vs(40) },
    });
}
