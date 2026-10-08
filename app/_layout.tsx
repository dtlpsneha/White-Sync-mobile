import { DarkTheme, DefaultTheme, ThemeProvider as NavigationProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ThemeProvider, useTheme } from '@/context/ThemeContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { Colors } from '@/constants/theme';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { NotificationPopup } from '@/components/NotificationPopup';
import { NotificationModal } from '@/components/NotificationModal';
import { View } from 'react-native';
// Must be imported at module scope so the background task is defined before
// the runtime tries to execute it (even when the app is not fully mounted).
import '../services/BackgroundNotificationHandler';
import { registerBackgroundNotificationTask } from '../services/BackgroundNotificationHandler';
import { notificationService } from '../services/NotificationService';
import { notifeeService } from '../services/NotifeeService';

// Set up channels and register background task as early as possible.
try { notificationService.setupChannels(); } catch (e) { console.warn('[Layout] notificationService.setupChannels failed:', e); }
try { notifeeService.setupChannels(); } catch (e) { console.warn('[Layout] notifeeService.setupChannels failed:', e); }
try { registerBackgroundNotificationTask(); } catch (e) { console.warn('[Layout] registerBackgroundNotificationTask failed:', e); }

function RootLayoutContent() {
  const { theme } = useTheme();
  usePushNotifications();

  return (
    <NavigationProvider value={theme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={{ flex: 1 }}>
        {/* Without an explicit contentStyle, the native stack's own screen
          * container defaults to white while a screen transitions/mounts —
          * briefly visible as a white flash on back navigation, especially
          * in dark mode. Matching it to the current theme's background stops
          * that flash from ever being a different color than the screen
          * underneath. */}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors[theme].background } }} />
        <NotificationPopup />
        <NotificationModal />
      </View>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
    </NavigationProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <NotificationsProvider>
        <RootLayoutContent />
      </NotificationsProvider>
    </ThemeProvider>
  );
}
