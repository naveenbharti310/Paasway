import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';
import { useEffect } from 'react';
import { startDiagnostics } from './src/services/diagnostics';

// On a computer screen the web preview is shown at phone width in the middle.
const webFrame = Platform.OS === 'web'
  ? { flex: 1, width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const, backgroundColor: colors.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.hairline }
  : { flex: 1 };

// Browsers draw their own white focus ring on text boxes. The app shows a
// gold border instead, so the browser ring is turned off in the web preview.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = 'input,textarea{outline:none!important}html,body{background:#0B0B0B}';
  document.head.appendChild(style);
}

export default function App() {
  useEffect(startDiagnostics, []);
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#0B0B0B' : colors.bg }}>
        {/* Keeps every screen clear of the notch, status bar and home indicator. */}
        <SafeAreaView style={webFrame} edges={['top', 'bottom', 'left', 'right']}>
          <RootNavigator />
        </SafeAreaView>
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
