import { View, Text, StyleSheet } from 'react-native';
import { chatColor } from '../features/chat/identity';

// A round initial with a soft tint, unique per chat.
export default function Avatar({ name, seed, size = 48 }: { name: string; seed: string; size?: number }) {
  const color = chatColor(seed);
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.circle, { width: size, height: size, borderRadius: size * 0.34, backgroundColor: `${color}22`, borderColor: `${color}55` }]}>
      <Text maxFontSizeMultiplier={1} style={{ color, fontSize: size * 0.4, fontFamily: 'Passway-Bold' }}>{(name || '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
