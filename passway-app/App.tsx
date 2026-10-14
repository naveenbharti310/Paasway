import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { startDiagnostics } from './src/services/diagnostics';

// On a computer screen the web preview is shown at phone width in the middle.
const webFrame = Platform.OS === 'web'
  ? { flex: 1, width: '100%' as const, maxWidth: 600, alignSelf: 'center' as const, backgroundColor: colors.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.hairline }
  : { flex: 1, width: '100%' as const, maxWidth: 720, alignSelf: 'center' as const };

// Browsers draw their own white focus ring on text boxes. The app shows a
// gold border instead, so the browser ring is turned off in the web preview.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'input,textarea{outline:none!important}html,body{background:#0B0D11}';
  document.head.appendChild(style);
}

export default function App() {
  useEffect(startDiagnostics, []);
  useFonts({ 'Passway-Regular': require('./assets/fonts/Manrope-Regular.ttf'), 'Passway-Medium': require('./assets/fonts/Manrope-Medium.ttf'), 'Passway-SemiBold': require('./assets/fonts/Manrope-SemiBold.ttf'), 'Passway-Bold': require('./assets/fonts/Manrope-Bold.ttf') });
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Keeps every screen clear of the notch, status bar and home indicator. */}
        <SafeAreaView style={webFrame} edges={['top', 'bottom', 'left', 'right']}>
          <RootNavigator />
        </SafeAreaView>
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
