import { DarkTheme, DefaultTheme, ThemeProvider as NavigationProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { Colors } from '@/constants/theme';
import { usePushNotifications } from '@/hooks/usePushNotifications';

function RootLayoutContent() {
  const { theme } = useTheme();
  usePushNotifications();

  return (
    <NavigationProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Without an explicit contentStyle, the native stack's own screen
        * container defaults to white while a screen transitions/mounts —
        * briefly visible as a white flash on back navigation, especially
        * in dark mode. Matching it to the current theme's background stops
        * that flash from ever being a different color than the screen
        * underneath. */}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors[theme].background } }} />
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </NavigationProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}
