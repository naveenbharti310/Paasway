import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';
export default function FormScreen({ header, children, footer }: { header?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><View style={styles.container}>{header}<ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>{children}</ScrollView></View>{footer}</KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ flex: { flex: 1, backgroundColor: colors.bg }, container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 12 }, content: { flexGrow: 1, alignItems: 'stretch', justifyContent: 'flex-start', gap: 16, paddingTop: 20, paddingBottom: 32 } });
