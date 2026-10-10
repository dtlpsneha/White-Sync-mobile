/**
 * White Sync design system.
 *
 * One indigo brand across every screen. Screens should read colors from
 * `Colors[theme]`, and use `Radius`, `Space`, `Shadow`, `Gradients` and `Type`
 * below instead of hardcoding hex values, radii or shadows, so the whole app
 * stays visually consistent.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#141B34',
    textSecondary: '#5B6485',
    background: '#F4F5FB', // Soft indigo-tinted page
    surface: '#FFFFFF',
    surfaceSecondary: '#EEF0FA',
    surfaceVariant: '#E2E6F5',
    tint: '#4F46E5',
    primary: '#4F46E5', // Indigo 600 — buttons, links, active states
    primaryVariant: '#4338CA',
    primarySoft: '#EEF0FF', // Tinted backgrounds behind primary icons/chips
    secondary: '#5B6485',
    icon: '#5B6485',
    border: '#E3E6F4',
    tabIconDefault: '#9AA3C0',
    tabIconSelected: '#4F46E5',
    success: '#10B981',
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#0EA5E9',
    onPrimary: '#FFFFFF',
    cardShadow: 'rgba(67, 56, 202, 0.12)',
    placeholder: '#9AA3C0',
  },
  dark: {
    text: '#EEF0FB',
    textSecondary: '#9AA3C7',
    /**
     * Elevation ladder: each step is a visible increment so cards keep their
     * edges against the page.
     */
    background: '#0A0B14',
    surface: '#14162A',
    surfaceSecondary: '#1C1F38',
    surfaceVariant: '#262A48',
    tint: '#A5B4FC',
    primary: '#6366F1', // Indigo 500 — keeps white text readable
    primaryVariant: '#4F46E5',
    primarySoft: 'rgba(99, 102, 241, 0.18)',
    secondary: '#9AA3C7',
    icon: '#9AA3C7',
    border: 'rgba(165, 180, 252, 0.14)',
    tabIconDefault: '#6B74A0',
    tabIconSelected: '#A5B4FC',
    success: '#34D399',
    danger: '#F87171',
    warning: '#FBBF24',
    info: '#38BDF8',
    onPrimary: '#FFFFFF',
    cardShadow: 'rgba(0, 0, 0, 0.6)',
    placeholder: '#6B74A0',
  },
};

/** Brand gradients: headers, hero cards, primary buttons. */
export const Gradients = {
  brand: ['#4338CA', '#6366F1', '#8B5CF6'] as const,
  brandSoft: ['#6366F1', '#8B5CF6'] as const,
  success: ['#10B981', '#059669'] as const,
  warning: ['#F59E0B', '#F97316'] as const,
  danger: ['#F87171', '#E11D48'] as const,
  info: ['#38BDF8', '#0EA5E9'] as const,
};

/** Corner radii. */
export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

/** Spacing scale. */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

/** Typography. Weights are strings so they drop straight into style objects. */
export const Type = {
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '800' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  label: { fontSize: 12, fontWeight: '700' as const },
  caption: { fontSize: 11, fontWeight: '600' as const },
  eyebrow: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1.4 },
};

/** Elevation: pass `Shadow.card(theme)` into a style array. */
export const Shadow = {
  card: (theme: 'light' | 'dark') => ({
    shadowColor: theme === 'dark' ? '#000' : '#4338CA',
    shadowOpacity: theme === 'dark' ? 0.35 : 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  }),
  raised: (theme: 'light' | 'dark') => ({
    shadowColor: theme === 'dark' ? '#000' : '#4338CA',
    shadowOpacity: theme === 'dark' ? 0.5 : 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  }),
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
