import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiPost } from '@/utils/api';

export default function PrintPreviewScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const isDark = theme === 'dark';

    const [htmlContent, setHtmlContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [formatsLoading, setFormatsLoading] = useState(true);
    const [printFormats, setPrintFormats] = useState<string[]>([]);
    const [selectedFormat, setSelectedFormat] = useState<string>('');
    const [isDropdownVisible, setIsDropdownVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchPrintFormats();
    }, []);

    useEffect(() => {
        if (selectedFormat && id) {
            fetchPrintHTML();
        }
    }, [selectedFormat, id]);

    const fetchPrintFormats = async () => {
        try {
            setFormatsLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            // Ensure we use the documented base URL for print formats
            const res = await apiPost('http://13.234.62.39:8080/api/method/get_quotation_html', { action: 'get_list' }, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message && Array.isArray(data.message)) {
                setPrintFormats(data.message);
                // Try to default to "Proforma Invoice Precitex" if it exists, otherwise use the first one
                const defaultFormat = data.message.includes('Proforma Invoice Precitex')
                    ? 'Proforma Invoice Precitex'
                    : data.message[0];
                setSelectedFormat(defaultFormat);
            } else {
                setError('Failed to load print formats');
            }
        } catch (err) {
            console.error('Fetch Formats Error:', err);
            setError('Error loading print formats');
        } finally {
            setFormatsLoading(false);
        }
    };

    const fetchPrintHTML = async () => {
        try {
            setLoading(true);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            const res = await apiPost('http://13.234.62.39:8080/api/method/get_quotation_html', {
                action: 'get_preview',
                doc_name: id,
                print_format: selectedFormat
            }, sessionCookies);

            const data: any = res.data;

            if (res.ok && data && data.message) {
                // Inject mobile-friendly scaling meta and table styling
                const injectedHTML = `
                    <html>
                        <head>
                            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
                            <style>
                                body { 
                                    margin: 0; 
                                    padding: 10px; 
                                    font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                                    overflow-x: auto;
                                    -webkit-overflow-scrolling: touch;
                                }
                                table { 
                                    max-width: 100% !important; 
                                    display: block; 
                                    overflow-x: auto; 
                                    white-space: nowrap; 
                                }
                                img { max-width: 100%; height: auto; }
                                .print-format { padding: 0 !important; }
                            </style>
                        </head>
                        <body>
                            ${data.message}
                        </body>
                    </html>
                `;
                setHtmlContent(injectedHTML);
            } else if (data.error) {
                setError(data.error);
            } else {
                setError('Failed to load print preview');
            }
        } catch (err) {
            console.error('Print Preview Error:', err);
            setError('An error occurred while fetching the preview');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0F172A' : '#F1F5F9' }]}>
            <StatusBar style="light" />

            {/* Premium Header */}
            <View style={styles.premiumHeader}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <Ionicons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
                <View style={styles.premiumHeaderTitle}>
                    <Text style={styles.headerMainTitle}>Print Preview</Text>
                    <View style={styles.idBadgeMini}>
                        <Text style={styles.idBadgeText}>#{id}</Text>
                    </View>
                </View>
                <TouchableOpacity onPress={fetchPrintHTML} style={styles.refreshIcon}>
                    <Ionicons name="refresh" size={20} color="#FFF" />
                </TouchableOpacity>
            </View>

            {/* Floating Format Selector */}
            {!formatsLoading && printFormats.length > 0 && (
                <View style={styles.floatingSelectorContainer}>
                    <TouchableOpacity
                        style={[styles.glassSelector, { backgroundColor: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)' }]}
                        onPress={() => setIsDropdownVisible(true)}
                    >
                        <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                        <Text style={[styles.selectorText, { color: colors.text }]} numberOfLines={1}>
                            {selectedFormat || 'Select Format'}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                </View>
            )}

            <Modal
                visible={isDropdownVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsDropdownVisible(false)}
            >
                <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownVisible(false)}>
                    <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
                        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                            <Text style={[styles.modalTitle, { color: colors.text }]}>Print Formats</Text>
                            <TouchableOpacity onPress={() => setIsDropdownVisible(false)}>
                                <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
                            {printFormats.map((format) => (
                                <TouchableOpacity
                                    key={format}
                                    style={[
                                        styles.modalItem,
                                        selectedFormat === format && { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30', borderWidth: 1 }
                                    ]}
                                    onPress={() => {
                                        setSelectedFormat(format);
                                        setIsDropdownVisible(false);
                                    }}
                                >
                                    <View style={styles.formatIconLabel}>
                                        <Ionicons
                                            name="file-tray-full-outline"
                                            size={20}
                                            color={selectedFormat === format ? colors.primary : colors.textSecondary}
                                        />
                                        <Text style={[
                                            styles.modalItemText,
                                            { color: selectedFormat === format ? colors.primary : colors.text },
                                            selectedFormat === format && { fontWeight: '700' }
                                        ]}>
                                            {format}
                                        </Text>
                                    </View>
                                    {selectedFormat === format && (
                                        <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>

            {/* Preview Area */}
            <View style={styles.previewContainer}>
                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Rendering Document...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.centerContainer}>
                        <View style={styles.errorIconBox}>
                            <Ionicons name="alert-circle" size={40} color="#EF4444" />
                        </View>
                        <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
                        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={fetchPrintHTML}>
                            <Text style={styles.retryButtonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.paperContainer}>
                        <WebView
                            originWhitelist={['*']}
                            source={{ html: htmlContent || '' }}
                            style={styles.webview}
                            scalesPageToFit={true}
                            showsHorizontalScrollIndicator={false}
                            horizontalScrollingEnabled={true}
                            bounces={true}
                        />
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    premiumHeader: {
        backgroundColor: '#1E293B',
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    closeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    premiumHeaderTitle: {
        alignItems: 'center',
    },
    headerMainTitle: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    idBadgeMini: {
        backgroundColor: 'rgba(56, 189, 248, 0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 4,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.3)',
    },
    idBadgeText: {
        color: '#38BDF8',
        fontSize: 10,
        fontWeight: '900',
    },
    refreshIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    floatingSelectorContainer: {
        position: 'absolute',
        top: 135,
        left: 0,
        right: 0,
        zIndex: 100,
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    glassSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 30,
        maxWidth: '90%',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        gap: 8,
    },
    selectorText: {
        fontSize: 13,
        fontWeight: '700',
        flexShrink: 1,
    },
    previewContainer: {
        flex: 1,
        paddingTop: 30,
        paddingHorizontal: 12,
        paddingBottom: 12,
    },
    paperContainer: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 12,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        maxHeight: '80%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '900',
    },
    modalList: {
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    modalItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 20,
        borderRadius: 16,
        marginBottom: 8,
    },
    formatIconLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    modalItemText: {
        fontSize: 16,
        fontWeight: '600',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 15,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    errorIconBox: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#FEE2E2',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    errorText: {
        fontSize: 16,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 24,
    },
    retryButton: {
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 14,
        elevation: 4,
    },
    retryButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },
});
