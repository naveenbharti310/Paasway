import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { signOut } from '@react-native-firebase/auth';
import { auth } from '../../../firebase/client';
import { confirmAge } from '../../account/api/account';
import { errorMessage } from '../../../services/errors';
import { colors } from '../../../theme/colors';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';
import FormScreen from '../../../components/FormScreen';
import { diagnosticScreen } from '../../../services/diagnostics';

interface Props {
  onResult: (confirmed: boolean) => void;
}

export default function AgeCheckScreen({ onResult }: Props) {
  useEffect(() => diagnosticScreen('AgeCheck'), []);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dayRef = useRef<TextInput>(null);
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
    <FormScreen>
        <IconBadge icon="calendar" />
        <Text style={styles.title} accessibilityRole="header">What is your date of birth?</Text>
        <Text style={styles.helper}>Passway is for people aged 18 and over. We store your eligibility result. If you are under 18, we also keep the date you turn 18. You can answer once.</Text>
        <View style={styles.row}>
          <TextInput testID="age-day" ref={dayRef} maxFontSizeMultiplier={1.2} style={styles.box} placeholder="DD" placeholderTextColor={colors.textMuted} selectionColor={colors.gold} keyboardType="number-pad" maxLength={2} value={day}
            accessibilityLabel="Day" onChangeText={(v) => { setDay(digits(v)); if (digits(v).length === 2) monthRef.current?.focus(); }} />
          <TextInput testID="age-month" ref={monthRef} style={styles.box} placeholder="MM" placeholderTextColor={colors.textMuted} selectionColor={colors.gold} keyboardType="number-pad" maxLength={2} value={month}
            accessibilityLabel="Month" maxFontSizeMultiplier={1.2} onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !month) dayRef.current?.focus(); }} onChangeText={(v) => { setMonth(digits(v)); if (digits(v).length === 2) yearRef.current?.focus(); }} />
          <TextInput testID="age-year" ref={yearRef} style={[styles.box, styles.year]} placeholder="YYYY" placeholderTextColor={colors.textMuted} selectionColor={colors.gold} keyboardType="number-pad" maxLength={4} value={year}
            accessibilityLabel="Year" maxFontSizeMultiplier={1.2} returnKeyType="done" onSubmitEditing={handleContinue} onKeyPress={(e) => { if (e.nativeEvent.key === 'Backspace' && !year) monthRef.current?.focus(); }} onChangeText={(v) => setYear(digits(v))} />
        </View>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Button label="Continue" onPress={handleContinue} loading={loading} testID="age-continue" />
        <Button label="Sign out" variant="ghost" onPress={() => void signOut(auth)} disabled={loading} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Passway-Bold', fontSize: 32, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4 },
  helper: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'left', maxWidth: 420, lineHeight: 22, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  box: { width: 72, minHeight: 72, borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.surface, borderRadius: 20, textAlign: 'center', fontFamily: 'Passway-SemiBold', fontSize: 20, color: colors.textPrimary },
  year: { width: 108 },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger },
});
