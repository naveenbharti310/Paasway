import { errorMessage } from '../../../services/errors';
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
  const { tid, createdAt, expiresAt } = params;
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(interval);
        navigation.replace('Generate');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, navigation]);

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
        });
      }
    }, (err) => setError(errorMessage(err, 'Could not listen for a connection request.')));
    return unsubscribe;
  }, [tid, createdAt, navigation]);

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
      <View style={styles.center}>
        <Text style={styles.helper}>Show this to the person you just met</Text>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>ONE TIME CODE</Text>
          <Text style={styles.codeText} testID="code-text" selectable={false}>{tid}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, secondsLeft / Math.max(1, (expiresAt - createdAt) / 1000))) * 100}%` }, urgent && styles.fillUrgent]} />
          </View>
          <Text style={[styles.timer, urgent && styles.timerUrgent]}>{`Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`}</Text>
        </View>
        <Text style={styles.waiting}>Waiting for them to enter it</Text>
        {error && <Text style={styles.error}>{error}</Text>}
      </View>
      <View style={styles.bottom}>
        <Button label="Cancel code" testID="cancel-code" variant="secondary" onPress={handleCancel} loading={canceling} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  bottom: { paddingBottom: 16 },
  codeCard: { width: '100%', backgroundColor: colors.surface, borderRadius: 28, paddingVertical: 32, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2A2418' },
  codeLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 12, letterSpacing: 2, fontWeight: '600' },
  codeText: { fontSize: 60, fontWeight: '700', letterSpacing: 14, color: colors.gold, paddingLeft: 14 },
  track: { width: '100%', height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 24, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.gold },
  fillUrgent: { backgroundColor: colors.danger },
  error: { fontSize: 13, color: colors.danger, textAlign: 'center' },
  timer: { fontSize: 13, color: colors.textSecondary, marginTop: 12, fontVariant: ['tabular-nums'] },
  timerUrgent: { color: colors.danger, fontWeight: '600' },
  helper: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 },
  waiting: { fontSize: 13, color: colors.textMuted },
});
