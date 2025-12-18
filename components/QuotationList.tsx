import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';

interface Quotation {
    name: string;
    customer_name: string;
    transaction_date: string;
    valid_till: string;
    grand_total: number;
    status: string;
    currency: string;
    company: string;
    workflow_state?: string;
    owner: string;
    team_member?: string; // Added team_member
}

interface QuotationListProps {
    filter?: string;
    searchQuery?: string;
    scrollEnabled?: boolean;
}

export default function QuotationList({ filter = 'All', searchQuery = '', scrollEnabled = true }: QuotationListProps) {
    const router = useRouter();
    const [quotations, setQuotations] = useState<Quotation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchQuotations();
    }, [filter, searchQuery]);

    const fetchQuotations = async () => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');
            const headers: HeadersInit = { 'Content-Type': 'application/json' };
            if (sessionCookies) headers['Cookie'] = sessionCookies;

            let filterParam = '';
            if (filter !== 'All') {
                filterParam = `&filters=${encodeURIComponent(JSON.stringify([["workflow_state", "=", filter]]))}`;
            }

            if (searchQuery) {
                const orFilters = JSON.stringify([
                    ["name", "like", `%${searchQuery}%`],
                    ["customer_name", "like", `%${searchQuery}%`]
                ]);
                filterParam += `&or_filters=${encodeURIComponent(orFilters)}`;
            }

            // Added team_member to fields
            const fields = JSON.stringify(["name", "customer_name", "transaction_date", "valid_till", "grand_total", "status", "currency", "company", "workflow_state", "owner", "team_member"]);
            const url = `http://13.234.62.39:8080/api/resource/Quotation?fields=${encodeURIComponent(fields)}&order_by=creation desc&limit_page_length=50${filterParam}`;

            const response = await fetch(url, { headers });
            const data = await response.json();

            if (response.ok && data.data) {
                setQuotations(data.data);
            } else {
                console.warn('Failed to fetch quotations', data);
                // If search returns nothing or error, clear list
                setQuotations([]);
            }
        } catch (error) {
            console.error('Error fetching quotations:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColors = (status: string) => {
        switch (status) {
            case 'Approved': return { bg: '#E8FDF3', text: '#28C76F', border: '#B9F6CA' };
            case 'Ordered': return { bg: '#E8FDF3', text: '#28C76F', border: '#B9F6CA' };
            case 'Open': return { bg: '#FFF4E5', text: '#FF9F43', border: '#FFE0B2' };
            case 'Pending': return { bg: '#FFF4E5', text: '#FF9F43', border: '#FFE0B2' };
            case 'Lost': return { bg: '#FFE5E5', text: '#EA5455', border: '#FFCDD2' };
            case 'Cancelled': return { bg: '#FFE5E5', text: '#EA5455', border: '#FFCDD2' };
            default: return { bg: '#F2F2F7', text: '#7367F0', border: '#E7E5F8' };
        }
    };

    const getRandomColor = (char: string) => {
        const colors = ['#7367F0', '#00CFE8', '#FF9F43', '#28C76F', '#EA5455'];
        const index = char.charCodeAt(0) % colors.length;
        return colors[index];
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const renderItem = ({ item }: { item: Quotation }) => {
        const statusColors = getStatusColors(item.workflow_state || item.status);
        const iconColor = getRandomColor(item.customer_name?.[0] || 'A');
        const isPending = (item.workflow_state === 'Pending' || item.status === 'Pending');

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                style={styles.card}
                onPress={() => {
                    router.push({ pathname: '/quotations/[id]', params: { id: item.name } });
                }}
            >
                <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
                        <Ionicons name="document-text" size={22} color={iconColor} />
                    </View>
                    <View style={styles.headerTextContainer}>
                        <View style={styles.titleRow}>
                            <Text style={styles.customerName} numberOfLines={1}>{item.customer_name}</Text>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.dateText}>{formatDate(item.transaction_date)}</Text>
                                {item.valid_till && <Text style={styles.validTillText}>Valid: {formatDate(item.valid_till)}</Text>}
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                            <View>
                                <View style={[styles.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                                    <View style={[styles.statusDot, { backgroundColor: statusColors.text }]} />
                                    <Text style={[styles.statusText, { color: statusColors.text }]}>
                                        {item.workflow_state || item.status}
                                    </Text>
                                </View>

                                {/* Team Member Display */}
                                {(item.team_member || item.owner) && (
                                    <View style={styles.ownerContainer}>
                                        <Ionicons name="person-circle-outline" size={14} color="#8E8E93" />
                                        <Text style={styles.ownerText} numberOfLines={1}>
                                            {item.team_member || item.owner}
                                        </Text>
                                    </View>
                                )}
                            </View>
                            {/* Approve Icon Removed */}
                        </View>
                    </View>
                </View>

                {/* Dashed Separator */}
                <View style={styles.dividerContainer}>
                    <View style={styles.divider} />
                </View>

                <View style={styles.detailsRow}>
                    <View style={styles.idContainer}>
                        <Text style={styles.quotationLabel}>ID: </Text>
                        <Text style={styles.quotationId}>{item.name}</Text>
                    </View>
                    <Text style={[styles.amount, { color: '#003366' }]}>
                        {item.currency} {item.grand_total?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#7367F0" />
            </View>
        );
    }

    if (quotations.length === 0) {
        return (
            <View style={styles.center}>
                <Ionicons name="documents-outline" size={64} color="#E5E5EA" />
                <Text style={styles.emptyText}>No quotations found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {scrollEnabled ? (
                <FlatList
                    data={quotations}
                    renderItem={renderItem}
                    keyExtractor={item => item.name}
                    scrollEnabled={true}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <View style={styles.listContent}>
                    {quotations.map(item => (
                        <View key={item.name}>{renderItem({ item })}</View>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    listContent: {
        paddingBottom: 24,
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#4A4A4A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
        borderWidth: 1,
        borderColor: '#F1F3F6',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 14,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    headerTextContainer: {
        flex: 1,
        gap: 6,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    customerName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2C3E50',
        flex: 1,
        marginRight: 8,
    },
    dateText: {
        fontSize: 12,
        color: '#95A5A6',
        fontWeight: '500',
    },
    validTillText: {
        fontSize: 11,
        color: '#EA5455', // Using a reddish color (or distinct color) to indicate deadline/expiry
        marginTop: 2,
        fontWeight: '500',
    },
    statusPill: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 20,
        borderWidth: 1,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '700',
    },
    ownerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 4,
    },
    ownerText: {
        fontSize: 12,
        color: '#8E8E93',
        fontWeight: '500',
    },
    dividerContainer: {
        marginBottom: 14,
        overflow: 'hidden',
    },
    divider: {
        height: 1,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: '#E0E0E0',
        borderRadius: 1,
    },
    detailsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 2,
    },
    idContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    quotationLabel: {
        fontSize: 12,
        color: '#B0BEC5',
        fontWeight: '600',
    },
    quotationId: {
        fontSize: 13,
        color: '#78909C',
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    amount: {
        fontSize: 18,
        fontWeight: '800',
    },
    emptyText: {
        color: '#AAB7B8',
        fontSize: 16,
        marginTop: 12,
        fontWeight: '500',
    },
    approveButton: {
        padding: 4,
        marginLeft: 12,
    }
});
