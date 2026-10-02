import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAuth } from 'firebase/auth';
import { app } from '../firebase/config';
import { generateTid } from '../api/tid';
import { getCurrentLocation } from '../api/location';
import { getSavedName, saveDefaultName } from '../api/profile';
import { colors } from '../theme/colors';
import LabeledField from '../components/LabeledField';
import Button from '../components/Button';
import IconBadge from '../components/IconBadge';

export default function GenerateScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = getAuth(app).currentUser?.uid ?? '';

  useEffect(() => {
    if (!uid) return;
    getSavedName(uid).then(setName).catch(() => {});
  }, [uid]);

  async function handleGenerate() {
    if (!name.trim()) {
      setError('Enter a name to show the other person');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await getCurrentLocation();
      const { tid, expiresAt } = await generateTid(lat, lng, name.trim());
      saveDefaultName(uid, name.trim()).catch(() => {});
      navigation.navigate('Code', { tid, expiresAt });
    } catch (err: any) {
      setError(err?.message ?? 'Could not generate a code. Try again.');
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
        <TouchableOpacity onPress={() => navigation.navigate('EnterCode')}>
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
