import { connectionNow } from '../clock';
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
  const { requestId, requesterName, requestedAt, tidCreatedAt, expiresAt, clock } = params;
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(connectionNow(clock) >= expiresAt);
  useEffect(() => {
    const timer = setInterval(() => setExpired(connectionNow(clock) >= expiresAt), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, clock]);
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  const elapsedSeconds = Math.max(0, Math.round((requestedAt - tidCreatedAt) / 1000));

  async function handleRespond(accept: boolean) {
    if (loading || (accept && expired)) return;
    setError(null);
    setLoading(accept ? 'accept' : 'decline');
    try {
      const result = await respondToRequest({ requestId, accept });
      if (accept && result?.connectionId) {
        navigation.reset({ index: 1, routes: [{ name: 'Chats' }, { name: 'Chat', params: { connectionId: result.connectionId } }] });
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
      <ScreenHeader title="Request" showBack={false} />
      <View style={styles.center}>
        <View style={styles.ring}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph}>{requesterName.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.name}>{requesterName}</Text>
        <Text style={styles.title}>wants to connect with you</Text>
        <Text style={styles.helper}>{`Requested ${elapsedSeconds}s after you shared the code`}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {expired && <Text style={styles.error}>This request has expired.</Text>}
        {expired && <Button label="Start again" onPress={() => navigation.replace('Generate')} />}
        <View style={styles.row}>
          <Button label="Decline" testID="decline" variant="secondary" onPress={() => handleRespond(false)} loading={loading === 'decline'} disabled={!!loading} style={styles.half} />
          <Button label="Accept" testID="accept" onPress={() => handleRespond(true)} loading={loading === 'accept'} disabled={!!loading || expired} style={styles.half} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  ring: { width: 128, height: 128, borderRadius: 40, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatar: { width: 104, height: 104, borderRadius: 34, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontFamily: 'Passway-Bold', fontSize: 38, color: colors.gold },
  name: { fontFamily: 'Passway-Bold', fontSize: 34, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
  title: { fontFamily: 'Passway-Regular', fontSize: 17, color: colors.textSecondary, textAlign: 'center' },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, textAlign: 'center' },
  helper: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.gold, marginTop: 8, backgroundColor: colors.accentBg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  row: { flexDirection: 'row', gap: 12, marginTop: 28, width: '100%' },
  half: { flex: 1, width: undefined },
});
