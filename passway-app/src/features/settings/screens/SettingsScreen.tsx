import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Platform, Linking } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { deleteAccount } from '../../account/api/account';
import { errorMessage } from '../../../services/errors';
import { PHONE_USE_DISCLOSURE, SUPPORT_EMAIL, openSupportEmail } from '../../../services/support';
import { colors } from '../../../theme/colors';
import ScreenHeader from '../../../components/ScreenHeader';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import BottomNav from '../../../components/BottomNav';
import TrustLine from '../../../components/TrustLine';

const SAFETY_TIPS = [
  'Never share a one time password, PIN or bank details, even with someone you have met.',
  'Be careful with anyone who asks for money, gift cards or crypto, or who wants you to install an app.',
  'Take your time before moving to another app or sharing your number.',
  'End the chat and report it if something feels wrong. Reporting closes the chat and blocks that account from reconnecting with you.',
];

export default function SettingsScreen() {
  const uid = auth.currentUser?.uid ?? '';
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const operationInFlight = useRef(false);
  const confirmationOpen = useRef(false);
  const [signingOut, setSigningOut] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supportInFlight = useRef(false);
  const mounted = useRef(true);
  const [openingSupport, setOpeningSupport] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function handleSupport() {
    if (supportInFlight.current) return;
    supportInFlight.current = true;
    setOpeningSupport(true);
    setSupportMessage(null);
    try {
      const result = await openSupportEmail((uri) => Linking.openURL(uri));
      if (mounted.current && !result.opened) setSupportMessage(result.message);
    } finally {
      supportInFlight.current = false;
      if (mounted.current) setOpeningSupport(false);
    }
  }

  useEffect(() => {
    if (!uid) return;
    let active = true;
    getSavedName(uid).then((value) => { if (active) { setName(value); setSavedName(value); } }).catch(() => undefined);
    return () => { active = false; };
  }, [uid]);

  async function handleSaveName() {
    const value = name.trim();
    if (!value || value === savedName || saving || operationInFlight.current) return;
    operationInFlight.current = true;
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
      operationInFlight.current = false;
      setSaving(false);
    }
  }

  async function runDelete() {
    confirmationOpen.current = false;
    if (operationInFlight.current) return;
    operationInFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount({});
      await signOut(auth);
    } catch (err) {
      setError(errorMessage(err, 'Could not delete your account. Try again.'));
    } finally {
      operationInFlight.current = false;
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    if (operationInFlight.current) return;
    operationInFlight.current = true; setSigningOut(true); setError(null);
    try { await signOut(auth); }
    catch (err) { setError(errorMessage(err, 'Could not sign out. Try again.')); }
    finally { operationInFlight.current = false; setSigningOut(false); }
  }

  function confirmDelete() {
    if (operationInFlight.current || confirmationOpen.current) return;
    confirmationOpen.current = true;
    const title = 'Delete your account?';
    const body = 'Your profile and sign in are removed and any open chat is ended. Messages already sent are deleted on their normal schedule. This cannot be undone.';
    // Alert buttons do nothing in a browser, so the web preview asks with confirm.
    if (Platform.OS === 'web') {
      if (window.confirm(`${title}\n\n${body}`)) void runDelete();
      else confirmationOpen.current = false;
      return;
    }
    Alert.alert(
      title,
      body,
      [{ text: 'Cancel', style: 'cancel', onPress: () => { confirmationOpen.current = false; } }, { text: 'Delete account', style: 'destructive', onPress: () => void runDelete() }],
      { onDismiss: () => { confirmationOpen.current = false; } },
    );
  }

  return (
    <View style={styles.container}><ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <ScreenHeader title="Settings" showBack large />

      <TrustLine label="Your details. Your boundaries." />
      <Text style={styles.section}>PROFILE</Text>
      <View style={styles.card}>
        <LabeledField label="Name shown to people you connect with" value={name} onChangeText={setName} maxLength={30} testID="settings-name" />
        <Button label="Save name" variant="secondary" onPress={handleSaveName} loading={saving} disabled={!name.trim() || name.trim() === savedName} />
        {message && <Text style={styles.ok}>{message}</Text>}
      </View>

      <Text style={styles.section}>STAYING SAFE</Text>
      <View style={styles.card}>
        {SAFETY_TIPS.map((tip, i) => (
          <View key={tip} style={[styles.tipRow, i > 0 && styles.tipDivider]}>
            <View style={styles.tipDot} />
            <Text style={styles.tip}>{tip}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>ACCOUNT</Text>
      <View style={styles.card}>
        <Text style={styles.helper}>{PHONE_USE_DISCLOSURE}</Text>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Sign out" testID="sign-out" variant="secondary" onPress={handleSignOut} loading={signingOut} disabled={deleting || saving} />
        <Button label="Delete account" variant="danger" onPress={confirmDelete} loading={deleting} disabled={saving || signingOut} testID="delete-account" />
      </View>

      <Text style={styles.section}>HELP</Text>
      <View style={styles.card}>
        <Text selectable style={styles.helper} testID="support-contact">{SUPPORT_EMAIL}</Text>
        <Button label="Email support" variant="secondary" onPress={handleSupport} loading={openingSupport} disabled={openingSupport} testID="email-support" />
        {supportMessage && <Text accessibilityRole="alert" style={styles.error} testID="support-error">{supportMessage}</Text>}
      </View>
    </ScrollView><BottomNav active="you" /></View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 16, gap: 10, paddingBottom: 32 },
  section: { fontFamily: 'Passway-SemiBold', fontSize: 14, color: colors.textMuted, letterSpacing: 1.4, marginTop: 22, marginLeft: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 28, padding: 20, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tipRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 },
  tipDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.gold, marginTop: 8 },
  tip: { flex: 1, fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  helper: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  ok: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.success },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger },
});
