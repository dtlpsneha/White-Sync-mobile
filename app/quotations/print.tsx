import React, { useState, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Colors, Radius, Shadow } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { apiGet, apiPost } from '@/utils/api';
import { apiUrl } from '@/constants/config';

/** ERPNext's own print page is laid out for an A4 sheet, ~794 CSS px wide. */
const PAGE_WIDTH_PX = 794;

/** Scheme + host of the ERP server, used so the print page's relative links (/files/..., /assets/...) resolve. */
const ERP_ORIGIN = apiUrl('/').replace(/\/+$/, '');

/**
 * Wraps ERPNext's print HTML for the phone without changing how it looks:
 * the stylesheet and logo come from the ERP server (via baseUrl), the page is
 * laid out at A4 width and shrunk to fit the screen, and only the "Print /
 * Get PDF" banner is hidden.
 */
function wrapPrintHtml(erpHtml: string) {
    const cleaned = erpHtml.replace(/<meta[^>]*name=["']viewport["'][^>]*>/i, '');
    const inject =
        `<meta name="viewport" content="width=${PAGE_WIDTH_PX}, maximum-scale=5.0, user-scalable=yes">` +
        `<style>.action-banner { display: none !important; } html, body { margin: 0; }</style>`;
    return /<head[^>]*>/i.test(cleaned)
        ? cleaned.replace(/<head[^>]*>/i, match => `${match}${inject}`)
        : `<html><head>${inject}</head><body>${cleaned}</body></html>`;
}

export default function PrintPreviewScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const theme = colorScheme ?? 'light';
    const colors = Colors[theme];
    const insets = useSafeAreaInsets();
    const quotationId = String(id);

    const [erpHtml, setErpHtml] = useState<string | null>(null);
    const [formatLabel, setFormatLabel] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (id) loadPreview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    /** The value of the Quotation's "Print Format" field in ERP, or '' if it is empty / unreadable. */
    const fetchQuotationPrintFormat = async (sessionCookies: string | null): Promise<string> => {
        try {
            const res = await apiGet(apiUrl(
                `/api/method/frappe.client.get_value?doctype=Quotation` +
                `&filters=${encodeURIComponent(JSON.stringify({ name: quotationId }))}&fieldname=print_format`
            ), sessionCookies);
            const value = res.ok ? (res.data as any)?.message?.print_format : '';
            return typeof value === 'string' ? value : '';
        } catch {
            return '';
        }
    };

    const loadPreview = async () => {
        try {
            setLoading(true);
            setError(null);
            const sessionCookies = await SecureStore.getItemAsync('session_cookies');

            // The format chosen on the quotation in ERP; ERP itself falls back to
            // "Standard" when that field is empty.
            const format = (await fetchQuotationPrintFormat(sessionCookies)) || 'Standard';
            setFormatLabel(format);

            const res = await apiPost(apiUrl('/api/method/get_quotation_html'), {
                action: 'get_preview',
                doc_name: quotationId,
                print_format: format,
            }, sessionCookies);
            const data: any = res.data;

            if (res.ok && data && data.message) {
                setErpHtml(String(data.message));
            } else if (data?.error) {
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

    const html = useMemo(() => (erpHtml ? wrapPrintHtml(erpHtml) : ''), [erpHtml]);

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScreenHeader
                title="Print Preview"
                subtitle={`#${id}`}
                onBack={() => (router.canGoBack() ? router.back() : router.replace('/quotations'))}
                rightIcon="refresh"
                onRightPress={loadPreview}
            />

            {/* Read-only: the format is the one set on the quotation in ERP. */}
            {!!formatLabel && (
                <View style={[styles.floatingSelectorContainer, { top: insets.top + 82 }]}>
                    <View style={[styles.glassSelector, Shadow.card(theme), { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                        <Text style={[styles.selectorText, { color: colors.text }]} numberOfLines={1}>{formatLabel}</Text>
                    </View>
                </View>
            )}

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
                        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={loadPreview}>
                            <Text style={styles.retryButtonText}>Try Again</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.paperContainer}>
                        <WebView
                            originWhitelist={['*']}
                            source={{ html, baseUrl: ERP_ORIGIN }}
                            style={styles.webview}
                            javaScriptEnabled
                            domStorageEnabled
                            mixedContentMode="always"
                            scalesPageToFit
                            showsHorizontalScrollIndicator={false}
                            bounces={false}
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
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
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
