import { useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { confirmAge } from '../../account/api/account';
import { errorMessage } from '../../../services/errors';
import { colors } from '../../../theme/colors';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

interface Props {
  onResult: (confirmed: boolean) => void;
}

export default function AgeCheckScreen({ onResult }: Props) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  async function handleContinue() {
    if (loading) return;
    const d = Number(day), m = Number(month), y = Number(year);
    if (!d || !m || year.length !== 4 || d > 31 || m > 12) {
      setError('Enter your full date of birth');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const birthDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const { confirmed } = await confirmAge({ birthDate });
      onResult(confirmed);
    } catch (err) {
      setError(errorMessage(err, 'Could not check your age. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  const digits = (value: string) => value.replace(/\D/g, '');

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <IconBadge glyph={'\u2605'} />
        <Text style={styles.title} accessibilityRole="header">What is your date of birth?</Text>
        <Text style={styles.helper}>Passway is for people aged 18 and over. We only keep whether you are old enough, not the date itself. You can answer once.</Text>
        <View style={styles.row}>
          <TextInput testID="age-day" style={styles.box} placeholder="DD" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={2} value={day}
            accessibilityLabel="Day" onChangeText={(v) => { setDay(digits(v)); if (digits(v).length === 2) monthRef.current?.focus(); }} />
          <TextInput testID="age-month" ref={monthRef} style={styles.box} placeholder="MM" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={2} value={month}
            accessibilityLabel="Month" onChangeText={(v) => { setMonth(digits(v)); if (digits(v).length === 2) yearRef.current?.focus(); }} />
          <TextInput testID="age-year" ref={yearRef} style={[styles.box, styles.year]} placeholder="YYYY" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={4} value={year}
            accessibilityLabel="Year" onChangeText={(v) => setYear(digits(v))} />
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Continue" onPress={handleContinue} loading={loading} testID="age-continue" />
        <Button label="Sign out" variant="secondary" onPress={() => void signOut(auth)} disabled={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
  helper: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 290, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  box: { width: 60, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, paddingVertical: 12, textAlign: 'center', fontSize: 17, color: colors.textPrimary },
  year: { width: 90 },
  error: { fontSize: 12, color: colors.danger },
});
