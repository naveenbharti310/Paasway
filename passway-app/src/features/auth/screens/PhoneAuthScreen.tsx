import { errorMessage } from '../../../services/errors';
import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FormScreen from '../../../components/FormScreen';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../../navigation/types';
import { signInWithPhoneNumber, type ConfirmationResult } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';
import Brand from '../../../components/Brand';

// Passway is only open to Indian numbers for now. Accepts 98765 43210,
// 098765 43210 or +91 98765 43210 and returns +919876543210.
export function indianNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

export default function PhoneAuthScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    if (loading) return;
    const number = indianNumber(phone);
    if (!number) {
      setError('Enter a 10 digit Indian mobile number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // The native SDK verifies the device with Play Integrity or silent APNs
      // and falls back to a reCAPTCHA page only when that is not possible.
      const result = await signInWithPhoneNumber(auth, number);
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
    <FormScreen header={<View style={styles.top}><Brand /></View>}>
        <IconBadge icon="phone" />
        {!confirmation ? (
          <>
            <Text style={styles.title} accessibilityRole="header">Your phone number</Text>
            <Text style={styles.helper}>Used only to sign in. It is never shown to anyone you connect with.</Text>
            {process.env.EXPO_PUBLIC_SHOW_TEST_NUMBERS === '1' && (
              <Text style={styles.hint} testID="test-numbers">{'Trying the preview? Use 99999 00001 or 99999 00002 with the code 123456.'}</Text>
            )}
            <LabeledField label="Indian mobile number (+91)" placeholder="98765 43210" keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel" returnKeyType="done" onSubmitEditing={handleSendCode} testID="phone-input" value={phone} onChangeText={setPhone} />
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Button label="Send code" onPress={handleSendCode} loading={loading} testID="send-code" />
            <Text style={styles.notice}>Passway is for people aged 18 and over.</Text>
            <Button label="How Passway works" variant="ghost" onPress={() => navigation.navigate('Welcome')} testID="how-it-works" />
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">Enter the code</Text>
            <Text style={styles.helper}>{`We sent a 6 digit code to ${phone.trim()}`}</Text>
            <LabeledField label="verification code" placeholder="123456" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" returnKeyType="done" onSubmitEditing={handleVerifyCode} testID="verify-input" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} maxLength={6} />
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Button label="Verify" onPress={handleVerifyCode} loading={loading} testID="verify" />
            <Button label="Send another code" variant="secondary" onPress={handleSendCode} disabled={loading} />
            <Button label="Use another number" variant="ghost" disabled={loading} onPress={() => { setConfirmation(null); setCode(''); setError(null); }} />
          </>
        )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  top: { minHeight: 44, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  helper: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 8 },
  hint: { fontSize: 13, color: colors.gold, textAlign: 'center', maxWidth: 300, lineHeight: 19, backgroundColor: colors.accentBg, padding: 12, borderRadius: 12, overflow: 'hidden' },
  error: { fontSize: 13, color: colors.danger, alignSelf: 'flex-start' },
  notice: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
