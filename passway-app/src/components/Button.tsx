import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, radius } from '../theme/colors';
import { tap } from '../services/haptics';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export default function Button({ label, onPress, variant = 'primary', loading, disabled, style, testID }: Props) {
  const off = disabled || loading;
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      style={({ pressed }) => [styles.base, styles[variant], off && styles.off, pressed && !off && styles.pressed, style]}
      onPress={() => { if (isPrimary) tap(); onPress(); }}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.textPrimary} />
      ) : (
        <Text style={[styles.text, isPrimary && styles.textPrimary, variant === 'danger' && styles.textDanger, variant === 'ghost' && styles.textGhost]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: 18 },
  primary: { backgroundColor: colors.accentFill },
  secondary: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent', minHeight: 44 },
  danger: { backgroundColor: colors.dangerBg, borderWidth: StyleSheet.hairlineWidth, borderColor: '#3A1A1A' },
  off: { opacity: 0.4 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  text: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  textPrimary: { color: colors.onAccent },
  textDanger: { color: colors.danger },
  textGhost: { color: colors.textSecondary, fontWeight: '500', fontSize: 15 },
});
