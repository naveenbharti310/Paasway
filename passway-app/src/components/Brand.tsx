import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

// The Passway wordmark.
export default function Brand() {
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="Passway">
      <View style={styles.mark} />
      <Text style={styles.word}>PASSWAY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 11, height: 11, borderWidth: 3, borderColor: colors.gold, transform: [{ rotate: '45deg' }] },
  word: { fontSize: 14, fontWeight: '700', letterSpacing: 4, color: colors.textPrimary },
});
