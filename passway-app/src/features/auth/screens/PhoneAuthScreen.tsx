import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import { signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth, firebaseConfig } from '../../../firebase/config';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

// Phone auth on the Firebase JS SDK needs a reCAPTCHA challenge inside
// React Native, expo-firebase-recaptcha supplies that as an invisible
// modal. This is the standard way to do it in an Expo managed project
// without moving onto @react-native-firebase and a custom native build.
export default function PhoneAuthScreen() {
  const recaptchaVerifier = useRef<FirebaseRecaptchaVerifierModal>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    if (!phone.trim()) {
      setError('Enter a phone number, with country code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPhoneNumber(auth, phone.trim(), recaptchaVerifier.current!);
      setConfirmation(result);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send a code. Check the number and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    if (!confirmation || code.trim().length < 6) {
      setError('Enter the 6 digit code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await confirmation.confirm(code.trim());
      // Auth state flips on success, RootNavigator is listening and
      // swaps this screen out for the main stack on its own.
    } catch (err: any) {
      setError(err?.message ?? 'That code did not match. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <FirebaseRecaptchaVerifierModal ref={recaptchaVerifier} firebaseConfig={firebaseConfig} attemptInvisibleVerification />
      <Text style={styles.brand}>Passway</Text>
      <View style={styles.center}>
        <IconBadge glyph="\u25C8" />
        {!confirmation ? (
          <>
            <Text style={styles.helper}>Verify your number to get started. It is never shown to anyone you connect with.</Text>
            <LabeledField label="phone number" placeholder="+91 98765 43210" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Send code" onPress={handleSendCode} loading={loading} />
          </>
        ) : (
          <>
            <Text style={styles.helper}>{`Enter the code sent to ${phone}`}</Text>
            <LabeledField label="verification code" placeholder="123456" keyboardType="number-pad" value={code} onChangeText={setCode} maxLength={6} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Button label="Verify" onPress={handleVerifyCode} loading={loading} />
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
