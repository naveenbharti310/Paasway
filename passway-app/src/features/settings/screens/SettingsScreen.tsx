import { useEffect, useState } from 'react';
import { Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { deleteAccount } from '../../account/api/account';
import { errorMessage } from '../../../services/errors';
import { colors } from '../../../theme/colors';
import ScreenHeader from '../../../components/ScreenHeader';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';

const SAFETY_TIPS = [
  'Never share a one time password, PIN or bank details, even with someone you have met.',
  'Be careful with anyone who asks for money, gift cards or crypto, or who wants you to install an app.',
  'Take your time before moving to another app or sharing your number.',
  'If something feels wrong, end the chat and report it. They will not be able to connect with you again.',
];

export default function SettingsScreen() {
  const uid = auth.currentUser?.uid ?? '';
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    getSavedName(uid).then((value) => { if (active) { setName(value); setSavedName(value); } }).catch(() => undefined);
    return () => { active = false; };
  }, [uid]);

  async function handleSaveName() {
    const value = name.trim();
    if (!value || value === savedName || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveDefaultName(uid, value);
      setSavedName(value);
      setMessage('Name saved');
    } catch (err) {
      setError(errorMessage(err, 'Could not save your name. Try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function runDelete() {
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

  function confirmDelete() {
    Alert.alert(
      'Delete your account?',
      'Your profile and sign in are removed and any open chat is ended. Messages already sent are deleted on their normal schedule. This cannot be undone.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete account', style: 'destructive', onPress: () => void runDelete() }],
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <ScreenHeader title="settings" showBack />
      <Text style={styles.section}>Your name</Text>
      <LabeledField label="name shown to people you connect with" value={name} onChangeText={setName} maxLength={30} testID="settings-name" />
      <Button label="Save name" variant="secondary" onPress={handleSaveName} loading={saving} disabled={!name.trim() || name.trim() === savedName} />
      {message && <Text style={styles.ok}>{message}</Text>}

      <Text style={styles.section}>Staying safe</Text>
      {SAFETY_TIPS.map((tip) => <Text key={tip} style={styles.tip}>{tip}</Text>)}

      <Text style={styles.section}>Account</Text>
      <Text style={styles.helper}>Your phone number is used only to sign in. It is never shown to anyone.</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Button label="Sign out" variant="secondary" onPress={() => void signOut(auth)} disabled={deleting} />
      <Button label="Delete account" variant="secondary" onPress={confirmDelete} loading={deleting} style={styles.danger} testID="delete-account" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  section: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 14 },
  tip: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  helper: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  ok: { fontSize: 12, color: colors.accentText },
  error: { fontSize: 12, color: colors.danger },
  danger: { borderColor: colors.danger },
});
