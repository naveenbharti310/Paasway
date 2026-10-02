import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { deactivateTid } from '../api/tid';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/RootNavigator';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';

type CodeRouteProp = RouteProp<RootStackParamList, 'Code'>;

export default function CodeScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<CodeRouteProp>();
  const { tid, expiresAt } = params;
  const [secondsLeft, setSecondsLeft] = useState(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  const [canceling, setCanceling] = useState(false);

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
  }, [expiresAt]);

  useEffect(() => {
    const q = query(
      collection(db, 'connectionRequests'),
      where('tid', '==', tid),
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
          tidCreatedAt: expiresAt - 5 * 60 * 1000,
        });
      }
    });
    return unsubscribe;
  }, [tid]);

  async function handleCancel() {
    setCanceling(true);
    try {
      await deactivateTid(tid);
      navigation.replace('Generate');
    } finally {
      setCanceling(false);
    }
  }

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const urgent = secondsLeft <= 30;

  return (
    <View style={styles.container}>
      <ScreenHeader title="your code" showBack={false} />
      <View style={styles.center}>
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>tid</Text>
          <Text style={styles.codeText}>{tid}</Text>
        </View>
        <Text style={[styles.timer, urgent && styles.timerUrgent]}>{`Expires in ${minutes}:${seconds.toString().padStart(2, '0')}`}</Text>
        <Text style={styles.helper}>Show this to the person you just met</Text>
        <Button label="Cancel" variant="secondary" onPress={handleCancel} loading={canceling} style={styles.cancelButton} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  codeCard: { backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 22, paddingHorizontal: 34, alignItems: 'center' },
  codeLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 6, letterSpacing: 1 },
  codeText: { fontSize: 34, fontWeight: '700', letterSpacing: 5, color: colors.textPrimary },
  timer: { fontSize: 13, color: colors.textSecondary },
  timerUrgent: { color: colors.danger, fontWeight: '600' },
  helper: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 220 },
  cancelButton: { width: 140 },
});
