import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { respondToRequest } from '../api/connections';
import { colors } from '../../../theme/colors';
import type { RootStackParamList } from '../../../navigation/types';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';

type RequestRouteProp = RouteProp<RootStackParamList, 'Request'>;

export default function RequestScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<RequestRouteProp>();
  const { requestId, requesterName, requestedAt, tidCreatedAt } = params;
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  const elapsedSeconds = Math.max(0, Math.round((requestedAt - tidCreatedAt) / 1000));

  async function handleRespond(accept: boolean) {
    setLoading(accept ? 'accept' : 'decline');
    try {
      const result = await respondToRequest(requestId, accept);
      if (accept && result?.connectionId) {
        navigation.replace('Chat', { connectionId: result.connectionId });
      } else {
        navigation.replace('Generate');
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="request" showBack />
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Text style={styles.avatarGlyph}>{requesterName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{`${requesterName} wants to connect`}</Text>
        <Text style={styles.helper}>{`Requested ${elapsedSeconds}s after you shared the code`}</Text>
        <View style={styles.row}>
          <Button label="Decline" variant="secondary" onPress={() => handleRespond(false)} loading={loading === 'decline'} disabled={!!loading} style={styles.half} />
          <Button label="Accept" onPress={() => handleRespond(true)} loading={loading === 'accept'} disabled={!!loading} style={styles.half} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontSize: 20, color: colors.accentText, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, textAlign: 'center', maxWidth: 220 },
  helper: { fontSize: 12, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
  half: { flex: 1 },
});
