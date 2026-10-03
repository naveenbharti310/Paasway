import { errorMessage } from '../../../services/errors';
import type { RootNavigationProp } from '../../../navigation/types';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { redeemTid } from '../api/connections';
import { getCurrentLocation } from '../../../services/location';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { colors } from '../../../theme/colors';
import ScreenHeader from '../../../components/ScreenHeader';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';

export default function EnterCodeScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const [digits, setDigits] = useState(['', '', '', '']);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestExpiresAt, setRequestExpiresAt] = useState<number | null>(null);
  const inputs = useRef<Array<TextInput | null>>([]);
  const uid = auth.currentUser?.uid ?? '';

  useEffect(() => {
    if (!uid) return;
    let active = true;
    getSavedName(uid).then((saved) => { if (active) setName(saved); }).catch(() => console.warn('Saved name could not be loaded.'));
    return () => { active = false; };
  }, [uid]);

  function updateDigit(index: number, value: string) {
    const next = [...digits];
    next[index] = value.replace(/[^A-Za-z0-9]/g, '').slice(-1).toUpperCase();
    setDigits(next);
    if (value && index < 3) inputs.current[index + 1]?.focus();
  }

  async function handleConnect() {
    if (loading || requestId) return;
    const code = digits.join('');
    if (code.length !== 4) {
      setError('Enter all four characters');
      return;
    }
    if (!name.trim()) {
      setError('Enter a name to show the other person');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await getCurrentLocation();
      const result = await redeemTid({ tid: code, lat, lng, displayName: name.trim() });
      void saveDefaultName(uid, name.trim()).catch(() => console.warn('Default name could not be saved.'));
      setRequestExpiresAt(result.expiresAt);
      setRequestId(result.requestId);
    } catch (err: unknown) {
      setError(errorMessage(err, 'That code did not work. Check it and try again.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!requestId) return;
    const unsubscribe = onSnapshot(doc(db, 'connectionRequests', requestId), (snap) => {
      const data = snap.data();
      if (!data) {
        setError('This request is no longer available.');
        setRequestId(null);
        return;
      }
      if (data.status === 'accepted' && typeof data.connectionId === 'string') {
        navigation.replace('Chat', { connectionId: data.connectionId });
      } else if (data.status === 'declined' || data.status === 'expired') {
        setError('That code is no longer available.');
        setRequestId(null);
      }
    }, (err) => {
      setError(errorMessage(err, 'Could not check the request.'));
      setRequestId(null);
    });
    return unsubscribe;
  }, [requestId, navigation]);

  useEffect(() => {
    if (!requestId || !requestExpiresAt) return;
    const checkExpiry = () => {
      if (Date.now() >= requestExpiresAt) {
        setRequestId(null);
        setError('The request expired. Ask them to generate a new code.');
      }
    };
    checkExpiry();
    const timer = setInterval(checkExpiry, 1000);
    return () => clearInterval(timer);
  }, [requestId, requestExpiresAt]);

  if (requestId) {
    return (
      <View style={styles.container}>
        <ScreenHeader showBack={false} />
        <View style={styles.center}>
          <View style={styles.pulse}><ActivityIndicator color={colors.gold} size="large" /></View>
          <Text style={styles.title}>Waiting for them to accept</Text>
          <Text style={styles.helper}>They will see your name and choose to accept or decline.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Enter code" showBack />
      <View style={styles.center}>
        <Text style={styles.title} accessibilityRole="header">Enter their code</Text>
        <Text style={styles.helper}>Type the 4 characters shown on their screen.</Text>
        <View style={styles.otpRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              testID={`code-box-${index}`}
              ref={(ref) => { inputs.current[index] = ref; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : undefined]}
              maxLength={1}
              value={digit}
              onChangeText={(value) => updateDigit(index, value)}
              autoCapitalize="characters"
              selectionColor={colors.gold}
              accessibilityLabel={`Character ${index + 1} of 4`}
            />
          ))}
        </View>
        <LabeledField label="your name" placeholder="Your name" value={name} onChangeText={setName} maxLength={30} testID="name-input" />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Connect" onPress={handleConnect} loading={loading} testID="connect" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  helper: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 290, lineHeight: 22, marginBottom: 6 },
  pulse: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  otpBox: { width: 60, height: 70, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 16, textAlign: 'center', fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  otpBoxFilled: { borderColor: colors.gold, color: colors.gold },
  error: { fontSize: 13, color: colors.danger, alignSelf: 'flex-start' },
});
