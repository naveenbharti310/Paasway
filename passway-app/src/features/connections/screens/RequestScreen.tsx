import { errorMessage } from '../../../services/errors';
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { respondToRequest } from '../api/connections';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp } from '../../../navigation/types';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';

type RequestRouteProp = RouteProp<RootStackParamList, 'Request'>;

export default function RequestScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<RequestRouteProp>();
  const { requestId, requesterName, requestedAt, tidCreatedAt, expiresAt } = params;
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(Date.now() >= expiresAt);
  useEffect(() => {
    const timer = setInterval(() => setExpired(Date.now() >= expiresAt), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  const elapsedSeconds = Math.max(0, Math.round((requestedAt - tidCreatedAt) / 1000));

  async function handleRespond(accept: boolean) {
    if (loading || (accept && expired)) return;
    setError(null);
    setLoading(accept ? 'accept' : 'decline');
    try {
      const result = await respondToRequest({ requestId, accept });
      if (accept && result?.connectionId) {
        navigation.replace('Chat', { connectionId: result.connectionId });
      } else {
        navigation.replace('Generate');
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not respond to the request. Try again.'));
    } finally {
      setLoading(null);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="request" showBack={false} />
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Text style={styles.avatarGlyph}>{requesterName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{`${requesterName} wants to connect`}</Text>
        <Text style={styles.helper}>{`Requested ${elapsedSeconds}s after you shared the code`}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {expired && <Text style={styles.error}>This request has expired.</Text>}
        {expired && <Button label="Start again" onPress={() => navigation.replace('Generate')} />}
        <View style={styles.row}>
          <Button label="Decline" variant="secondary" onPress={() => handleRespond(false)} loading={loading === 'decline'} disabled={!!loading} style={styles.half} />
          <Button label="Accept" onPress={() => handleRespond(true)} loading={loading === 'accept'} disabled={!!loading || expired} style={styles.half} />
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
  error: { fontSize: 12, color: colors.danger, textAlign: 'center' },
  helper: { fontSize: 12, color: colors.textMuted },
  row: { flexDirection: 'row', gap: 10, marginTop: 6, width: '100%' },
  half: { flex: 1 },
});
