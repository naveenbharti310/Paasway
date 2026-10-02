import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

// One button component so every screen shares the same padding, radius,
// and loading treatment, instead of each screen defining its own
// slightly different version of the same button.
export default function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      style={[isPrimary ? styles.primary : styles.secondary, style]}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.textPrimary} />
      ) : (
        <Text style={isPrimary ? styles.primaryText : styles.secondaryText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  primary: { backgroundColor: colors.accentFill, paddingVertical: 13, borderRadius: 10, alignItems: 'center', width: '100%' },
  secondary: { borderWidth: 0.5, borderColor: colors.border, paddingVertical: 12, borderRadius: 10, alignItems: 'center', width: '100%' },
  primaryText: { color: colors.onAccent, fontSize: 15, fontWeight: '600' },
  secondaryText: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
});
