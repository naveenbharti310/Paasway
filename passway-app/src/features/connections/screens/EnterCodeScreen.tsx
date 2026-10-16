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
import FormScreen from '../../../components/FormScreen';
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
    const clean = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const next = [...digits];
    if (clean.length > 1) {
      // A pasted code fills the boxes from this one onwards.
      const chars = clean.length >= 4 ? clean.slice(0, 4).split('') : clean.split('');
      const start = clean.length >= 4 ? 0 : index;
      chars.forEach((char, i) => { if (start + i < 4) next[start + i] = char; });
      setDigits(next);
      inputs.current[Math.min(3, start + chars.length)]?.focus();
      return;
    }
    next[index] = clean;
    setDigits(next);
    if (clean && index < 3) inputs.current[index + 1]?.focus();
  }

  function handleKey(index: number, key: string) {
    // Backspace on an empty box goes back to the previous one.
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputs.current[index - 1]?.focus();
    }
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
    let active = true;
    const unsubscribe = onSnapshot(doc(db, 'connectionRequests', requestId), { includeMetadataChanges: true }, (snap) => {
      if (!active) return;
      const data = snap.data();
      // Cache absence is not a server rejection of this newly created request.
      if (!data && snap.metadata.fromCache) return;
      if (!data) {
        setError('This request is no longer available.');
        setRequestId(null);
        return;
      }
      if (data.status === 'accepted' && typeof data.connectionId === 'string') {
        active = false; // Metadata-only replays cannot navigate a second time.
        navigation.reset({ index: 1, routes: [{ name: 'Chats' }, { name: 'Chat', params: { connectionId: data.connectionId } }] });
      } else if (data.status === 'declined' || data.status === 'expired') {
        setError('That code is no longer available.');
        setRequestId(null);
      }
    }, (err) => {
      if (!active) return;
      setError(errorMessage(err, 'Could not check the request.'));
      setRequestId(null);
    });
    return () => { active = false; unsubscribe(); };
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
          <View style={styles.pulse}><ActivityIndicator accessibilityLabel="Waiting for connection acceptance" color={colors.gold} size="large" /></View>
          <Text style={styles.title}>Waiting for them to accept</Text>
          <Text style={styles.helper}>They will see your name and choose to accept or decline.</Text>
        </View>
      </View>
    );
  }

  return (
    <FormScreen header={<ScreenHeader title="Enter code" showBack />}>
        <Text style={styles.title} accessibilityRole="header">Enter their code</Text>
        <Text style={styles.helper}>Type the 4 characters shown on their screen.</Text>
        <View style={styles.otpRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              testID={`code-box-${index}`}
              ref={(ref) => { inputs.current[index] = ref; }}
              style={[styles.otpBox, digit ? styles.otpBoxFilled : undefined]}
              maxLength={index === 0 ? 4 : 1}
              value={digit}
              onChangeText={(value) => updateDigit(index, value)}
              onKeyPress={(e) => handleKey(index, e.nativeEvent.key)}
              autoCorrect={false}
              autoComplete="off"
              maxFontSizeMultiplier={1.2}
              autoCapitalize="characters"
              selectionColor={colors.gold}
              accessibilityLabel={`Character ${index + 1} of 4`}
            />
          ))}
        </View>
        <LabeledField label="your name" placeholder="Your first name" value={name} onChangeText={setName} maxLength={30} autoCapitalize="words" autoCorrect={false} textContentType="givenName" autoComplete="name-given" returnKeyType="go" onSubmitEditing={handleConnect} testID="name-input" />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Connect" onPress={handleConnect} loading={loading} testID="connect" />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingBottom: 40 },
  title: { fontFamily: 'Passway-Bold', fontSize: 32, color: colors.textPrimary, textAlign: 'left', letterSpacing: -0.4 },
  helper: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'left', maxWidth: 420, lineHeight: 22, marginBottom: 6 },
  pulse: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  otpRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  otpBox: { width: 60, height: 76, borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.surface, borderRadius: 20, textAlign: 'center', fontFamily: 'Passway-Bold', fontSize: 30, color: colors.textPrimary },
  otpBoxFilled: { borderColor: colors.gold, color: colors.gold },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, alignSelf: 'flex-start' },
});
