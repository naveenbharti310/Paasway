import { useRef } from 'react';
import { Animated, Pressable, Text, StyleSheet, ActivityIndicator, Platform, type ViewStyle } from 'react-native';
import { colors, radius, fonts } from '../theme/colors';
import { tap } from '../services/haptics';
import useReducedMotion from '../hooks/useReducedMotion';
interface Props { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; style?: ViewStyle; testID?: string }
export default function Button({ label, onPress, variant = 'primary', loading, disabled, style, testID }: Props) {
  const off = disabled || loading, primary = variant === 'primary';
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const resize = (value: number) => { if (reduced) return; Animated.spring(scale, { toValue: value, stiffness: 320, damping: 24, mass: 0.6, useNativeDriver: Platform.OS !== 'web' }).start(); };
  return <Animated.View style={[styles.wrap, style, { transform: [{ scale }] }]}><Pressable onPressIn={() => resize(0.98)} onPressOut={() => resize(1)} style={[styles.base, styles[variant], off && styles.off]} android_ripple={{ color: primary ? '#00000014' : '#ffffff12' }} onPress={() => { if (primary) tap(); onPress(); }} disabled={off} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!loading }} testID={testID}>
    {loading ? <ActivityIndicator color={primary ? colors.onAccent : colors.textPrimary} /> : <Text style={[styles.text, primary && styles.textPrimary, variant === 'danger' && styles.textDanger, variant === 'ghost' && styles.textGhost]}>{label}</Text>}
  </Pressable></Animated.View>;
}
const styles = StyleSheet.create({ wrap: { width: '100%' }, base: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 14, overflow: 'hidden' }, primary: { backgroundColor: colors.accentFill }, secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }, ghost: { backgroundColor: 'transparent', minHeight: 48 }, danger: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: '#684047' }, off: { opacity: 0.55 }, text: { fontFamily: fonts.semibold, color: colors.textPrimary, fontSize: 16, lineHeight: 23 }, textPrimary: { color: colors.onAccent }, textDanger: { color: colors.danger }, textGhost: { color: colors.textSecondary, fontFamily: fonts.medium, fontSize: 15 } });
