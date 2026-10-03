import { errorMessage } from '../../../services/errors';
import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

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
      <Text style={styles.brand}>Passway</Text>
      <View style={styles.center}>
        <IconBadge glyph={'\u25C8'} />
        {!confirmation ? (
          <>
            <Text style={styles.helper}>Verify your number to get started. It is never shown to anyone you connect with.</Text>
            {process.env.EXPO_PUBLIC_SHOW_TEST_NUMBERS === '1' && (
              <Text style={styles.helper} testID="test-numbers">{'Trying the preview? Use +91 99999 00001 or +91 99999 00002 with the code 123456.'}</Text>
            )}
            <LabeledField label="phone number" placeholder="+91 98765 43210" keyboardType="phone-pad" testID="phone-input" value={phone} onChangeText={setPhone} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Send code" onPress={handleSendCode} loading={loading} testID="send-code" />
          </>
        ) : (
          <>
            <Text style={styles.helper}>{`Enter the code sent to ${phone}`}</Text>
            <LabeledField label="verification code" placeholder="123456" keyboardType="number-pad" testID="verify-input" value={code} onChangeText={setCode} maxLength={6} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Verify" onPress={handleVerifyCode} loading={loading} testID="verify" />
            <Button label="Send another code" variant="secondary" onPress={handleSendCode} disabled={loading} />
            <TouchableOpacity disabled={loading} onPress={() => { setConfirmation(null); setCode(''); setError(null); }}>
              <Text style={styles.helper}>Use another number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  brand: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  helper: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  error: { fontSize: 12, color: colors.danger, alignSelf: 'flex-start' },
});
