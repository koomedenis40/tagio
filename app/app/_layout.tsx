import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '../src/state/settings';
import { AccessProvider } from '../src/state/access';
import { color } from '../src/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AccessProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }}>
              <Stack.Screen name="index" options={{ animation: 'none' }} />
              <Stack.Screen name="scan" options={{ animation: 'fade', contentStyle: { backgroundColor: color.black } }} />
              <Stack.Screen name="currency" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
          </AccessProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
