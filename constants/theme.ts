/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#71FADCFF';
const tintColorDark = '#FFFFFF';

export const Colors = {
  light: {
    text: '#1B2129',
    textSecondary: '#64748B',
    background: '#F8F9FA', // Clean light gray/white
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9', // Subtle slate-gray
    surfaceVariant: '#E2E8F0',
    tint: '#0277BD',
    primary: '#01579B',
    primaryVariant: '#01579B',
    secondary: '#64748B',
    icon: '#64748B',
    border: '#E2E8F0',
    tabIconDefault: '#94A3B8',
    tabIconSelected: '#00BFA5',
    success: '#00BFA5',
    danger: '#F4511E',
    warning: '#FFB300',
    info: '#0277BD',
    cardShadow: 'rgba(27, 33, 41, 0.1)',
    placeholder: '#94A3B8',
  },
  dark: {
    text: '#F1F5F9',
    textSecondary: '#9CA3AF', // Was #A3A3A3 — cooler, to match the surfaces.
    /**
     * Elevation ladder. Previously this was pure black with a #121212 surface,
     * which left almost no separation between the page and the cards sitting on
     * it, so the UI read as one flat black sheet. Each step is now a visible
     * increment, which is what gives cards their edges in dark mode.
     */
    background: '#0B0D10',
    surface: '#15181D',
    surfaceSecondary: '#1D2126',
    surfaceVariant: '#262B31',
    tint: '#38BDF8', // Light Blue
    primary: '#0EA5E9',
    primaryVariant: '#0284C7',
    secondary: '#9CA3AF',
    icon: '#9CA3AF',
    border: 'rgba(255, 255, 255, 0.09)', // Subtle border
    // #444446 was so dark it was almost invisible against the background —
    // inactive tabs and placeholder text were effectively unreadable.
    tabIconDefault: '#6B7280',
    tabIconSelected: '#38BDF8',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#0EA5E9',
    cardShadow: 'rgba(0, 0, 0, 0.8)',
    placeholder: '#6B7280',
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
