/**
 * White Sync design system.
 *
 * Midnight x Ember: charcoal header bands, terracotta actions, sand pages. Screens should read colors from
 * `Colors[theme]`, and use `Radius`, `Space`, `Shadow`, `Gradients` and `Type`
 * below instead of hardcoding hex values, radii or shadows, so the whole app
 * stays visually consistent.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1F2421', // Charcoal ink
    textSecondary: '#7A6F62', // Warm grey
    background: '#FAF6EF', // Sand page
    surface: '#FFFFFF',
    surfaceSecondary: '#F4EFE7',
    surfaceVariant: '#E9DFCF', // Beige
    tint: '#E4572E',
    primary: '#E4572E', // Terracotta — buttons, links, active states
    primaryVariant: '#B4401F',
    primarySoft: '#FDE7DF', // Tinted backgrounds behind primary icons/chips
    secondary: '#7A6F62',
    icon: '#7A6F62',
    border: '#EDE5D8',
    tabIconDefault: '#A79C8E',
    tabIconSelected: '#E4572E',
    success: '#2F7D5B',
    danger: '#C8423B',
    warning: '#D99A14',
    info: '#3E7CB1',
    onPrimary: '#FFFFFF',
    cardShadow: 'rgba(31, 36, 33, 0.10)',
    placeholder: '#A79C8E',
    /** Charcoal header band, dark icon tiles and their raised steps. */
    ink: '#1F2421',
    ink2: '#2A302C',
    ink3: '#3A413C',
    onInk: '#E9DFCF',
    onInkMuted: '#A79C8E',
    amber: '#F2B134',
    mint: '#7FD1A8', // Positive figures on the charcoal band
    plum: '#8E5BB5',
  },
  dark: {
    text: '#F4EFE7',
    textSecondary: '#B5AA9C',
    /**
     * Elevation ladder: each step is a visible increment so cards keep their
     * edges against the page.
     */
    background: '#121412',
    surface: '#1F2421',
    surfaceSecondary: '#2A302C',
    surfaceVariant: '#3A413C',
    tint: '#F08A68',
    primary: '#E4572E',
    primaryVariant: '#F08A68',
    primarySoft: 'rgba(228, 87, 46, 0.18)',
    secondary: '#B5AA9C',
    icon: '#B5AA9C',
    border: 'rgba(233, 223, 207, 0.12)',
    tabIconDefault: '#8C8173',
    tabIconSelected: '#F08A68',
    success: '#5FBF8F',
    danger: '#E8766F',
    warning: '#F2B134',
    info: '#6FA6D6',
    onPrimary: '#FFFFFF',
    cardShadow: 'rgba(0, 0, 0, 0.6)',
    placeholder: '#8C8173',
    ink: '#0B0D0C',
    ink2: '#1F2421',
    ink3: '#2A302C',
    onInk: '#E9DFCF',
    onInkMuted: '#A79C8E',
    amber: '#F2B134',
    mint: '#7FD1A8',
    plum: '#B48AD6',
  },
};

/** Brand gradients: headers, hero cards, primary buttons. */
export const Gradients = {
  brand: ['#1F2421', '#2A302C', '#3A2A22'] as const, // Charcoal band with a warm edge
  brandSoft: ['#F07A55', '#E4572E'] as const, // Terracotta
  success: ['#3F8F6B', '#2F5D50'] as const,
  warning: ['#F2B134', '#D99A14'] as const,
  danger: ['#E4572E', '#C8423B'] as const,
  info: ['#5B95C6', '#3E7CB1'] as const,
};

/** Status colours shared by quotations, orders and visits. */
export const StatusColors = {
  approved: '#2F7D5B',
  pending: '#3E7CB1',
  review: '#D99A14',
  reopen: '#8E5BB5',
  cancelled: '#C8423B',
  draft: '#8C8173',
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
    shadowColor: theme === 'dark' ? '#000' : '#1F2421',
    shadowOpacity: theme === 'dark' ? 0.35 : 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  }),
  raised: (theme: 'light' | 'dark') => ({
    shadowColor: theme === 'dark' ? '#000' : '#1F2421',
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
