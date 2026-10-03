import { errorMessage } from '../../../services/errors';
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';
import Brand from '../../../components/Brand';

export default function PhoneAuthScreen() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    if (loading) return;
    if (!/^\+[1-9]\d{7,14}$/.test(phone.replace(/\s/g, ''))) {
      setError('Enter a phone number, with country code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The native SDK verifies the device with Play Integrity or silent APNs
      // and falls back to a reCAPTCHA page only when that is not possible.
      const result = await signInWithPhoneNumber(auth, phone.replace(/\s/g, ''));
      setConfirmation(result);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not send a code. Check the number and try again.'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (loading) return;
    if (!confirmation || !/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6 digit code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmation.confirm(code.trim());
      // Auth state flips on success, RootNavigator is listening and
      // swaps this screen out for the main stack on its own.
    } catch (err: unknown) {
      setError(errorMessage(err, 'That code did not match. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Brand />
      <View style={styles.center}>
        <IconBadge icon="phone" />
        {!confirmation ? (
          <>
            <Text style={styles.title} accessibilityRole="header">Your phone number</Text>
            <Text style={styles.helper}>Used only to sign in. It is never shown to anyone you connect with.</Text>
            {process.env.EXPO_PUBLIC_SHOW_TEST_NUMBERS === '1' && (
              <Text style={styles.hint} testID="test-numbers">{'Trying the preview? Use +91 99999 00001 or +91 99999 00002 with the code 123456.'}</Text>
            )}
            <LabeledField label="phone number" placeholder="+91 98765 43210" keyboardType="phone-pad" testID="phone-input" value={phone} onChangeText={setPhone} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Send code" onPress={handleSendCode} loading={loading} testID="send-code" />
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">Enter the code</Text>
            <Text style={styles.helper}>{`We sent a 6 digit code to ${phone}`}</Text>
            <LabeledField label="verification code" placeholder="123456" keyboardType="number-pad" testID="verify-input" value={code} onChangeText={setCode} maxLength={6} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Verify" onPress={handleVerifyCode} loading={loading} testID="verify" />
            <Button label="Send another code" variant="secondary" onPress={handleSendCode} disabled={loading} />
            <TouchableOpacity disabled={loading} onPress={() => { setConfirmation(null); setCode(''); setError(null); }} accessibilityRole="button">
              <Text style={styles.link}>Use another number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  helper: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 8 },
  hint: { fontSize: 13, color: colors.gold, textAlign: 'center', maxWidth: 300, lineHeight: 19, backgroundColor: colors.accentBg, padding: 12, borderRadius: 12, overflow: 'hidden' },
  link: { fontSize: 15, color: colors.textSecondary, fontWeight: '500', paddingVertical: 8 },
  error: { fontSize: 13, color: colors.danger, alignSelf: 'flex-start' },
});
