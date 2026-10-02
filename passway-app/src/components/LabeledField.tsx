import React from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors } from '../theme/colors';

interface Props extends TextInputProps {
  label: string;
}

// Label above field, the pattern used throughout the reviewed mockups.
// A bare TextInput with only a placeholder loses its label the moment
// someone starts typing, this keeps context visible the whole time.
export default function LabeledField({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.field, style]} placeholderTextColor={colors.textMuted} {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  label: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  field: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
  },
});
