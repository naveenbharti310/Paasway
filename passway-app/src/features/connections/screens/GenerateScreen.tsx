import { errorMessage } from '../../../services/errors';
import type { RootNavigationProp } from '../../../navigation/types';
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../firebase/client';
import { generateTid } from '../api/connections';
import { getCurrentLocation } from '../../../services/location';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';
import Brand from '../../../components/Brand';
import FormScreen from '../../../components/FormScreen';
import { useActiveChats } from '../../chat/api/chats';

export default function GenerateScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid ?? '';
  const { chats } = useActiveChats(uid);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    getSavedName(uid).then((saved) => { if (active) setName(saved); }).catch(() => console.warn('Saved name could not be loaded.'));
    return () => { active = false; };
  }, [uid]);

  async function handleGenerate() {
    if (loading) return;
    if (!name.trim()) {
      setError('Enter a name to show the other person');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await getCurrentLocation();
      const { tid, createdAt, expiresAt } = await generateTid({ lat, lng, displayName: name.trim() });
      void saveDefaultName(uid, name.trim()).catch(() => console.warn('Default name could not be saved.'));
      navigation.navigate('Code', { tid, createdAt, expiresAt });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not generate a code. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScreen header={(
      <View style={styles.top}>
        <Brand />
        <View style={styles.topRight}>
        {chats.length > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('Chats')} accessibilityRole="button" accessibilityLabel={`Chats, ${chats.length} open`} testID="open-chats" style={styles.hit}>
            <Text style={styles.chats}>{`Chats  ${chats.length}`}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Settings" testID="open-settings" style={styles.hit}>
          <Text style={styles.settings}>Settings</Text>
        </TouchableOpacity>
        </View>
      </View>
    )}>
        <IconBadge icon="link" />
        <Text style={styles.title} accessibilityRole="header">Met someone?</Text>
        <Text style={styles.helper}>Create a one time code and show it to them. It works for 5 minutes.</Text>
        <LabeledField label="your name" placeholder="Your first name" value={name} onChangeText={setName} maxLength={30} autoCapitalize="words" autoCorrect={false} textContentType="givenName" autoComplete="name-given" returnKeyType="go" onSubmitEditing={handleGenerate} testID="name-input" />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Generate code" onPress={handleGenerate} loading={loading} testID="generate" />
        <Button label="I have a code" variant="secondary" disabled={loading} onPress={() => navigation.navigate('EnterCode')} testID="have-code" />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 },
  hit: { minHeight: 44, justifyContent: 'center' },
  topRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chats: { fontSize: 14, color: colors.onAccent, fontWeight: '700', backgroundColor: colors.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, overflow: 'hidden' },
  settings: { fontSize: 14, color: colors.textSecondary, fontWeight: '500', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: 'hidden' },
  title: { fontSize: 30, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.6 },
  helper: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 22, marginBottom: 10 },
  error: { fontSize: 13, color: colors.danger, alignSelf: 'flex-start' },
});
