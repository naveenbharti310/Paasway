import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme/colors';

// On a computer screen the web preview is shown at phone width in the middle.
const webFrame = Platform.OS === 'web'
  ? { flex: 1, width: '100%' as const, maxWidth: 480, alignSelf: 'center' as const, backgroundColor: colors.bg }
  : { flex: 1 };

export default function App() {
  return (
    <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#ECEBE7' : colors.bg }}>
      <View style={webFrame}>
        <RootNavigator />
      </View>
      <StatusBar style="auto" />
    </View>
  );
}
