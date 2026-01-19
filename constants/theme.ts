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
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    background: '#0F172A', // Deep Navy (Slate 900)
    surface: '#1E293B',    // Slate 800
    surfaceSecondary: '#334155', // Slate 700
    surfaceVariant: '#475569',   // Slate 600
    tint: '#38BDF8', // Light Blue
    primary: '#0EA5E9',
    primaryVariant: '#0284C7',
    secondary: '#94A3B8',
    icon: '#94A3B8',
    border: 'rgba(51, 65, 85, 0.5)', // Slate 700 with opacity
    tabIconDefault: '#475569',
    tabIconSelected: '#38BDF8',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#0EA5E9',
    cardShadow: 'rgba(0, 0, 0, 0.5)',
    placeholder: '#475569',
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
