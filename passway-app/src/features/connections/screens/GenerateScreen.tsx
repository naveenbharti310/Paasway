import { errorMessage } from '../../../services/errors';
import type { RootNavigationProp } from '../../../navigation/types';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../firebase/config';
import { generateTid } from '../api/connections';
import { getCurrentLocation } from '../../../services/location';
import { getSavedName, saveDefaultName } from '../../profile/api/profile';
import { colors } from '../../../theme/colors';
import LabeledField from '../../../components/LabeledField';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

export default function GenerateScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = auth.currentUser?.uid ?? '';

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
      const { tid, expiresAt } = await generateTid(lat, lng, name.trim());
      void saveDefaultName(uid, name.trim()).catch(() => console.warn('Default name could not be saved.'));
      navigation.navigate('Code', { tid, expiresAt });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not generate a code. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Passway</Text>
      <View style={styles.center}>
        <IconBadge glyph="\u2318" />
        <Text style={styles.helper}>Met someone new? Generate a code to connect.</Text>
        <LabeledField label="your name" placeholder="Your name" value={name} onChangeText={setName} maxLength={30} />
        {error && <Text style={styles.error}>{error}</Text>}
        <Button label="Generate TID" onPress={handleGenerate} loading={loading} />
        <TouchableOpacity disabled={loading} onPress={() => navigation.navigate('EnterCode')}>
          <Text style={styles.link}>Have a code instead?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  brand: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  helper: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 220, lineHeight: 19 },
  error: { fontSize: 12, color: colors.danger, alignSelf: 'flex-start' },
  link: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
});
