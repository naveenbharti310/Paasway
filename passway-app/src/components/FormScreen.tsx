import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

// Wraps screens with text boxes. When the keyboard opens, the content can
// scroll so the buttons are never hidden, even on small phones.
export default function FormScreen({ header, children, footer }: { header?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        {header}
        <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {footer}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingVertical: 24 },
});
