import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { acceptContentPolicy, deleteAccount } from '../../account/api/account';
import { CONTENT_POLICY_VERSION, CONTENT_RULES } from '../../../services/contentPolicy';
import { withDeadline } from '../../../services/withDeadline';
import { errorMessage } from '../../../services/errors';
import FormScreen from '../../../components/FormScreen';
import Button from '../../../components/Button';
import PrivacyLinks from '../../../components/PrivacyLinks';
import { colors } from '../../../theme/colors';

export default function ContentPolicyScreen({ onResult }: { onResult: (accepted: boolean) => void }) {
  const mounted = useRef(true);
  const operation = useRef(false);
  const confirming = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function run(kind: 'accept' | 'signout' | 'delete') {
    if (operation.current || !mounted.current) return;
    operation.current = true;
    setBusy(kind); setError(null);
    // Capture the identity so a late response cannot accept for another sign-in.
    const uid = auth.currentUser?.uid;
    try {
      if (kind === 'accept') {
        const result = await withDeadline(() => acceptContentPolicy({ version: CONTENT_POLICY_VERSION, accept: true }));
        if (result.accepted !== true || result.version !== CONTENT_POLICY_VERSION) throw new Error('Use rules acceptance was not confirmed. Try again.');
        if (mounted.current && uid && auth.currentUser?.uid === uid) onResult(true);
      } else {
        if (kind === 'delete') await deleteAccount({});
        if (mounted.current && auth.currentUser?.uid === uid) await withDeadline(() => signOut(auth));
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Could not complete this action. Try again.'));
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  function confirmDelete() {
    if (operation.current || confirming.current) return;
    confirming.current = true;
    const title = 'Delete your account?';
    const body = 'Your profile and sign in are removed and any open chat is ended. Messages already sent are deleted on their normal schedule. This cannot be undone.';
    const cancel = () => { confirming.current = false; };
    const accept = () => { cancel(); if (mounted.current) void run('delete'); };
    if (Platform.OS === 'web') { if (window.confirm(`${title}\n\n${body}`)) accept(); else cancel(); return; }
    Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel', onPress: cancel }, { text: 'Delete account', style: 'destructive', onPress: accept }], { onDismiss: cancel });
  }

  return <FormScreen>
    <Text style={styles.title} accessibilityRole="header">Passway use rules</Text>
    <Text style={styles.copy}>Read and accept these rules before connecting or sending content. You can decline and sign out, or delete your account without accepting.</Text>
    {CONTENT_RULES.map((rule, index) => <Text key={rule} style={styles.copy}>{index + 1}. {rule}</Text>)}
    <Text style={styles.copy}>Rules version {CONTENT_POLICY_VERSION}</Text>
    {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    <Button label="Accept use rules" testID="accept-use-rules" onPress={() => void run('accept')} loading={busy === 'accept'} disabled={busy !== null} />
    <Button label="Decline and sign out" testID="decline-use-rules" variant="secondary" onPress={() => void run('signout')} loading={busy === 'signout'} disabled={busy !== null} />
    <Button label="Delete account" testID="policy-delete-account" variant="danger" onPress={confirmDelete} loading={busy === 'delete'} disabled={busy !== null} />
    <PrivacyLinks />
  </FormScreen>;
}
const styles = StyleSheet.create({ title: { color: colors.textPrimary, fontSize: 28, fontWeight: '600', flexShrink: 1 }, copy: { color: colors.textSecondary, fontSize: 16, lineHeight: 25 }, error: { color: colors.danger, fontSize: 16, lineHeight: 24 } });
