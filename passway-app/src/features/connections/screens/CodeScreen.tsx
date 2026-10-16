import { remainingSeconds } from '../clock';
import { errorMessage } from '../../../services/errors';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, where, limit, onSnapshot } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { deactivateTid } from '../api/connections';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp } from '../../../navigation/types';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';

type CodeRouteProp = RouteProp<RootStackParamList, 'Code'>;

export default function CodeScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<CodeRouteProp>();
  const { tid, createdAt, expiresAt, clock } = params;
  const [secondsLeft, setSecondsLeft] = useState(remainingSeconds(expiresAt, clock));
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const left = remainingSeconds(expiresAt, clock);
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(interval);
        navigation.replace('Generate');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, clock, navigation]);

  useEffect(() => {
    const q = query(
      collection(db, 'connectionRequests'),
      where('generatorId', '==', auth.currentUser?.uid ?? ''),
      where('tid', '==', tid),
      where('tidCreatedAt', '==', createdAt),
      where('status', '==', 'pending'),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestDoc = snapshot.docs[0];
      if (requestDoc) {
        const data = requestDoc.data();
        navigation.replace('Request', {
          requestId: requestDoc.id,
          requesterName: data.requesterName,
          requestedAt: data.createdAt,
          tidCreatedAt: data.tidCreatedAt,
          expiresAt: data.expiresAt,
          clock,
        });
      }
    }, (err) => setError(errorMessage(err, 'Could not listen for a connection request.')));
    return unsubscribe;
  }, [tid, createdAt, clock, navigation]);

  // Going back with the system back button or gesture cancels the code, so it
  // is never left active where nobody is watching for a request.
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (event.data.action.type !== 'GO_BACK' && event.data.action.type !== 'POP') return;
    event.preventDefault();
    void handleCancel();
  }), [navigation]);

  async function handleCancel() {
    if (canceling) return;
    setCanceling(true);
    setError(null);
    try {
      await deactivateTid({ tid });
      navigation.replace('Generate');
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the code. Try again.'));
    } finally {
      setCanceling(false);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const urgent = secondsLeft <= 30;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Your code" showBack={false} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center}>
        <Text style={styles.helper}>Show this to the person you just met</Text>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>ONE TIME CODE</Text>
          <Text style={styles.codeText} testID="code-text" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} selectable={false} maxFontSizeMultiplier={1} accessibilityLabel={`Your code is ${tid.split('').join(' ')}`}>{tid}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, secondsLeft / Math.max(1, (expiresAt - createdAt) / 1000))) * 100}%` }, urgent && styles.fillUrgent]} />
          </View>
          <Text style={[styles.timer, urgent && styles.timerUrgent]}>{`Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`}</Text>
        </View>
        <Text style={styles.waiting}>Waiting for them to enter it</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.bottom}>
        <Button label="Cancel code" testID="cancel-code" variant="secondary" onPress={handleCancel} loading={canceling} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', gap: 20 },
  bottom: { paddingBottom: 16 },
  codeCard: { width: '100%', backgroundColor: colors.accentBg, borderRadius: 32, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2A2418' },
  codeLabel: { fontFamily: 'Passway-SemiBold', fontSize: 14, color: colors.textMuted, marginBottom: 12, letterSpacing: 2 },
  codeText: { width: '100%', textAlign: 'center', fontFamily: 'Passway-Bold', fontSize: 52, letterSpacing: 10, color: colors.gold, paddingLeft: 10 },
  track: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 24, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.gold },
  fillUrgent: { backgroundColor: colors.danger },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, textAlign: 'center' },
  timer: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary, marginTop: 12, fontVariant: ['tabular-nums'] },
  timerUrgent: { color: colors.danger },
  helper: { fontFamily: 'Passway-Regular', fontSize: 16, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  waiting: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted },
});
