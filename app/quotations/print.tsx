import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Modal, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';

export default function PrintPreviewScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();

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
            const res = await apiPost(apiUrl('/api/method/get_quotation_html'), { action: 'get_list' }, sessionCookies);
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

            const res = await apiPost(apiUrl('/api/method/get_quotation_html'), {
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
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Print Preview"
                subtitle={`#${id}`}
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/quotations'))}
                rightIcon="refresh"
                onRightPress={fetchPrintHTML}
            />

            {/* Floating Format Selector */}
            {!formatsLoading && printFormats.length > 0 && (
                <View style={[styles.floatingSelectorContainer, { top: insets.top + 82 }]}>
                    <TouchableOpacity
                        style={[styles.glassSelector, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}
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
                        <View style={[styles.errorIconBox, { backgroundColor: colors.danger + '22' }]}>
                            <Ionicons name="alert-circle" size={40} color={colors.danger} />
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
    floatingSelectorContainer: {
        position: 'absolute',
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
        borderRadius: Radius.pill,
        borderWidth: 1,
        maxWidth: '90%',
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
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
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
        borderRadius: Radius.md,
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
        borderRadius: Radius.md,
    },
    retryButtonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: '800',
    },
});

