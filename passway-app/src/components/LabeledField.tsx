import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, radius } from '../theme/colors';

interface Props extends TextInputProps {
  label: string;
}

export default function LabeledField({ label, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} maxFontSizeMultiplier={1.3} importantForAccessibility="no" accessibilityElementsHidden>{label.toUpperCase()}</Text>
      <TextInput
        style={[styles.field, focused && styles.focused, style]}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.gold}
        accessibilityLabel={label}
        maxFontSizeMultiplier={1.4}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: 8, letterSpacing: 1.2, fontWeight: '600' },
  field: {
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    minHeight: 52,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  focused: { borderColor: colors.gold },
});
