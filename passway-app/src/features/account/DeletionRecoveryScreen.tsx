import { useState } from 'react';
import { View, Text } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../firebase/client';
import { deleteAccount } from './api/account';
import Button from '../../components/Button';
import { colors } from '../../theme/colors';

export default function DeletionRecoveryScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function resume() {
    setBusy(true); setError('');
    try { await deleteAccount({}); await signOut(auth); }
    catch { setError('Deletion has not finished yet. Try again shortly, or sign out while it continues.'); }
    finally { setBusy(false); }
  }
  return <View testID="deletion-recovery" style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 20, backgroundColor: colors.bg }}>
    <Text accessibilityRole="header" style={{ fontSize: 24, color: colors.textPrimary }}>Account deletion in progress</Text>
    <Text style={{ color: colors.textSecondary }}>Your account cannot make new connections. You can resume deletion here; server maintenance also retries it.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    <Button label="Resume deletion" loading={busy} onPress={() => void resume()} testID="resume-deletion" />
    <Button label="Sign out" variant="secondary" disabled={busy} onPress={() => void signOut(auth).catch(() => setError('Could not sign out. Try again.'))} />
  </View>;
}
