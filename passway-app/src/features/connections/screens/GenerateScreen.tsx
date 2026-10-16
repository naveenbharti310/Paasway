import { errorMessage } from '../../../services/errors';
import type { RootNavigationProp } from '../../../navigation/types';
import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../firebase/client';
import { generateTid } from '../api/connections';
import { getCurrentLocation } from '../../../services/location';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import HeroIllustration from '../../../components/HeroIllustration';
import TrustLine from '../../../components/TrustLine';
import BottomNav from '../../../components/BottomNav';
import Icon from '../../../components/Icon';
import Brand from '../../../components/Brand';
import FormScreen from '../../../components/FormScreen';


export default function GenerateScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  // State updates render later; a synchronous lock also covers same-frame presses
  // and keyboard-submit/button overlap before the disabled state is committed.
  const generationInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid ?? '';

  useEffect(() => {
    if (!uid) return;
    let active = true;
    getSavedName(uid).then((saved) => { if (active) setName(saved); }).catch(() => console.warn('Saved name could not be loaded.'));
    return () => { active = false; };
  }, [uid]);

  async function handleGenerate() {
    if (generationInFlight.current) return;
    if (!name.trim()) {
      setError('Enter a name to show the other person');
      return;
    }
    generationInFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await getCurrentLocation();
      const { tid, createdAt, expiresAt, clock } = await generateTid({ lat, lng, displayName: name.trim() });
      void saveDefaultName(uid, name.trim()).catch(() => console.warn('Default name could not be saved.'));
      navigation.navigate('Code', { tid, createdAt, expiresAt, clock });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not generate a code. Try again.'));
    } finally {
      generationInFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <FormScreen footer={<BottomNav active="connect" />} header={(
      <View style={styles.top}>
        <Brand />
        <View style={styles.topRight}>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Settings" testID="open-settings" style={styles.hit}>
          <Icon name="settings" size={23} color={colors.textSecondary} />
        </TouchableOpacity>
        </View>
      </View>
    )}>
        <HeroIllustration scene="code" compact />
        <Text style={styles.eyebrow}>CONNECT IN PERSON</Text>
        <Text style={styles.title} accessibilityRole="header">{'A moment.\nA new connection.'}</Text>
        <Text style={styles.helper}>Create a code for someone nearby. Your number stays private.</Text>
        <LabeledField label="your name" placeholder="Your first name" value={name} onChangeText={setName} maxLength={30} autoCapitalize="words" autoCorrect={false} textContentType="givenName" autoComplete="name-given" returnKeyType="go" onSubmitEditing={handleGenerate} testID="name-input" />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Generate code" onPress={handleGenerate} loading={loading} testID="generate" />
        <Button label="I have a code" variant="secondary" disabled={loading} onPress={() => navigation.navigate('EnterCode')} testID="have-code" />
        <TrustLine label="Nearby only · One use · Expires in 5 minutes" icon="timer" />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontFamily: 'Passway-SemiBold', fontSize: 14, letterSpacing: 1.8, color: colors.gold, marginTop: -6 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  hit: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 24 },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chats: { fontFamily: 'Passway-Bold', fontSize: 14, color: colors.onAccent, backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  settings: { fontFamily: 'Passway-Medium', fontSize: 14, color: colors.textSecondary, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: 'hidden' },
  title: { fontFamily: 'Passway-Bold', fontSize: 34, color: colors.textPrimary, textAlign: 'left', letterSpacing: -1.0 },
  helper: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'left', maxWidth: 420, lineHeight: 22, marginBottom: 10 },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, alignSelf: 'flex-start' },
});
