import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius, fonts } from '../theme/colors';
interface Props extends TextInputProps { label: string }
export default function LabeledField({ label, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const friendly = label.charAt(0).toUpperCase() + label.slice(1);
  return <View style={styles.wrap}><Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>{friendly}</Text><TextInput style={[styles.field, focused && styles.focused, style]} placeholderTextColor={colors.textMuted} selectionColor={colors.gold} accessibilityLabel={label} onFocus={e => { setFocused(true); onFocus?.(e); }} onBlur={e => { setFocused(false); onBlur?.(e); }} {...rest} /></View>;
}
const styles = StyleSheet.create({ wrap: { width: '100%' }, label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginBottom: 10 }, field: { borderWidth: 1.5, borderColor: colors.fieldBorder, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 16, minHeight: 60, fontFamily: fonts.medium, fontSize: 17, color: colors.textPrimary, backgroundColor: colors.surface }, focused: { borderColor: colors.gold, backgroundColor: '#1E211F' } });
