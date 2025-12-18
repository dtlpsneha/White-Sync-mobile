import React, { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';

interface CustomerVisit {
    name: string;
    customer_name: string;
    purpose: string;
    visit_date: string;
    visit_summary: string;
}

const CustomerVisitList = () => {
    const [visits, setVisits] = useState<CustomerVisit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCustomerVisits = async () => {
        try {
            console.log('Fetching customer visits...');
            // Using a short timeout to fail fast if server is unreachable
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            // Get session cookies
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const headers: HeadersInit = {
                'Content-Type': 'application/json',
            };

            if (sessionCookies) {
                headers['Cookie'] = sessionCookies;
                console.log('Using stored session cookies for request');
            } else {
                console.warn('No session cookies found. Request might fail.');
            }

            const response = await fetch('http://13.234.62.39:8080/api/resource/Customer%20Visit', {
                method: 'GET',
                headers: headers,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                // If 401/403, maybe session expired?
                if (response.status === 401 || response.status === 403) {
                    console.log('Session expired or unauthorized');
                }
                throw new Error('Failed to fetch data: ' + response.status);
            }

            const data = await response.json();
            setVisits(data.data);
        } catch (err) {
            console.warn('API Fetch Failed, loading Mock Data:', err);
            setError(err instanceof Error ? err.message : String(err));
            setVisits([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomerVisits();
    }, []);

    if (loading) {
        return <ActivityIndicator size="large" style={styles.centered} color="#007AFF" />;
    }

    return (
        <View style={styles.container}>
            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Showing Mock Data (API Connection Failed)</Text>
                </View>
            )}
            <FlatList
                data={visits}
                keyExtractor={(item: any) => item.name}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }: { item: any }) => (
                    <View style={styles.itemContainer}>
                        <Text style={styles.title}>{item.customer_name}</Text>
                        <Text style={styles.subtitle}>Purpose: {item.purpose}</Text>
                        <Text style={styles.date}>Date: {item.visit_date}</Text>
                        <Text style={styles.summary}>{item.visit_summary}</Text>
                    </View>
                )}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorContainer: {
        backgroundColor: '#FFF4F4',
        padding: 8,
        marginBottom: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FF3B30',
    },
    errorText: {
        color: '#FF3B30',
        textAlign: 'center',
        fontSize: 12,
    },
    itemContainer: {
        padding: 16,
        backgroundColor: '#FFFFFF',
        marginBottom: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1C1C1E',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#3A3A3C',
        marginBottom: 4,
    },
    date: {
        fontSize: 12,
        color: '#8E8E93',
        marginBottom: 8,
    },
    summary: {
        fontSize: 14,
        color: '#636366',
        fontStyle: 'italic',
    },
});

export default CustomerVisitList;
