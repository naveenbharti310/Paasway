import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { deleteAccount } from '../../account/api/account';
import { errorMessage } from '../../../services/errors';
import { colors } from '../../../theme/colors';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

export default function UnderAgeScreen() {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount({});
      await signOut(auth).catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete your account. Try again.'));
      setDeleting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <IconBadge icon="lock" tone="neutral" />
        <Text style={styles.title} accessibilityRole="header">Passway is for adults</Text>
        <Text style={styles.helper}>You need to be 18 or over to use Passway. You can delete your account now, and you are welcome back once you turn 18.</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Delete my account" onPress={handleDelete} loading={deleting} />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut(auth)} disabled={deleting} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  helper: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 310, lineHeight: 22 },
  error: { fontSize: 13, color: colors.danger },
});
