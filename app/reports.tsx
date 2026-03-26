import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { FloatingNav } from '@/components/FloatingNav';

export default function ReportsScreen() {
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ headerShown: false }} />

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Reports</Text>

                {/* Monthly Summary Card */}
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>MONTHLY SUMMARY</Text>
                    <Text style={styles.summaryValue}>₹5,88,87,970.98</Text>
                    <Text style={styles.summarySubtext}>Total Quote Value</Text>
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsRow}>
                    <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Success Rate</Text>
                        <Text style={[styles.metricValue, { color: '#00BFA5' }]}>93.8%</Text>
                    </View>
                    <View style={styles.metricCard}>
                        <Text style={styles.metricLabel}>Total Quotes</Text>
                        <Text style={[styles.metricValue, { color: '#0277BD' }]}>644</Text>
                    </View>
                </View>

                {/* Recent Activity */}
                <View style={styles.activityContainer}>
                    <Text style={[styles.activityTitle, { color: colors.text }]}>Recent Activity</Text>

                    <View style={styles.activityItem}>
                        <View style={[styles.dot, { backgroundColor: '#0277BD' }]} />
                        <Text style={[styles.activityText, { color: colors.textSecondary }]}>Quote #1029 approved</Text>
                    </View>
                    <View style={styles.activityItem}>
                        <View style={[styles.dot, { backgroundColor: '#0277BD' }]} />
                        <Text style={[styles.activityText, { color: colors.textSecondary }]}>Quote #1028 pending review</Text>
                    </View>
                    <View style={styles.activityItem}>
                        <View style={[styles.dot, { backgroundColor: '#0277BD' }]} />
                        <Text style={[styles.activityText, { color: colors.textSecondary }]}>Quote #1027 cancelled</Text>
                    </View>
                </View>
            </ScrollView>

            <FloatingNav />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        padding: 24,
        paddingBottom: 120,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: '900',
        marginBottom: 24,
        letterSpacing: -1,
    },
    summaryCard: {
        backgroundColor: '#EFF6FF',
        borderRadius: 24,
        padding: 28,
        marginBottom: 20,
        shadowColor: '#3B82F6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 15,
        elevation: 5,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    summaryLabel: {
        color: '#3B82F6',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.5,
        marginBottom: 12,
    },
    summaryValue: {
        color: '#1E3A8A',
        fontSize: 32,
        fontWeight: '900',
        marginBottom: 4,
    },
    summarySubtext: {
        color: '#60A5FA',
        fontSize: 14,
        fontWeight: '700',
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
    },
    metricCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    metricLabel: {
        color: '#64748B',
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 8,
    },
    metricValue: {
        fontSize: 24,
        fontWeight: '900',
    },
    activityContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    activityTitle: {
        fontSize: 18,
        fontWeight: '800',
        marginBottom: 20,
    },
    activityItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 12,
    },
    activityText: {
        fontSize: 15,
        fontWeight: '500',
    }
});
