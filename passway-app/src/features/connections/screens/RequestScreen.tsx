import { connectionNow } from '../clock';
import { errorMessage } from '../../../services/errors';
import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { respondToRequest } from '../api/connections';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp } from '../../../navigation/types';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';

type RequestRouteProp = RouteProp<RootStackParamList, 'Request'>;

export default function RequestScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { width, fontScale } = useWindowDimensions();
  // Preserve full-sized accessible labels rather than splitting consent words
  // into narrow half-width pills at large font scales.
  const stackActions = fontScale >= 1.4 || width < 320;
  const { params } = useRoute<RequestRouteProp>();
  const { requestId, requesterName, requestedAt, tidCreatedAt, expiresAt, clock } = params;
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [expired, setExpired] = useState(connectionNow(clock) >= expiresAt);
  useEffect(() => {
    const timer = setInterval(() => setExpired(connectionNow(clock) >= expiresAt), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, clock]);
  const responseInFlight = useRef(false);
  const [loading, setLoading] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    let active = true;
    setUnavailable(false);
    const unsubscribe = onSnapshot(doc(db, 'connectionRequests', requestId), { includeMetadataChanges: true }, (snap) => {
      if (!active) return;
      const request = snap.data();
      if (!request && snap.metadata.fromCache) return;
      if (!request || request.status === 'declined' || request.status === 'expired') setUnavailable(true);
      // Accepted responses are handled by the explicit idempotent API call;
      // metadata replays must not race it into a second navigation reset.
    }, (err) => {
      if (active) setError(errorMessage(err, 'Could not check this request. Try again.'));
    });
    return () => { active = false; unsubscribe(); };
  }, [requestId]);

  const elapsedSeconds = Math.max(0, Math.round((requestedAt - tidCreatedAt) / 1000));

  async function handleRespond(accept: boolean) {
    if (responseInFlight.current || loading || (accept && (expired || unavailable))) return;
    responseInFlight.current = true;
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
      responseInFlight.current = false;
      setLoading(null);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Request" showBack={false} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center}>
        <View style={styles.ring}>
          <View style={styles.avatar}>
            <Text style={styles.avatarGlyph}>{requesterName.charAt(0).toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.name}>{requesterName}</Text>
        <Text style={styles.title}>wants to connect with you</Text>
        <Text style={styles.helper}>{`Requested ${elapsedSeconds}s after you shared the code`}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {unavailable && <Text accessibilityRole="alert" style={styles.error}>This request is no longer available.</Text>}
        {!unavailable && expired && <Text style={styles.error}>This request has expired.</Text>}
        {(expired || unavailable) && <Button testID="request-start-again" label="Start again" onPress={() => navigation.replace('Generate')} />}
        <View testID="request-actions" style={[styles.row, stackActions && styles.stacked]}>
          <Button label="Decline" testID="decline" variant="secondary" onPress={() => handleRespond(false)} loading={loading === 'decline'} disabled={!!loading} style={stackActions ? styles.full : styles.half} />
          <Button label="Accept" testID="accept" onPress={() => handleRespond(true)} loading={loading === 'accept'} disabled={!!loading || expired || unavailable} style={stackActions ? styles.full : styles.half} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 16 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', gap: 10 },
  ring: { width: 128, height: 128, borderRadius: 40, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatar: { width: 104, height: 104, borderRadius: 34, backgroundColor: colors.accentBg, alignItems: 'center', justifyContent: 'center' },
  avatarGlyph: { fontFamily: 'Passway-Bold', fontSize: 38, color: colors.gold },
  name: { fontFamily: 'Passway-Bold', fontSize: 34, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
  title: { fontFamily: 'Passway-Regular', fontSize: 17, color: colors.textSecondary, textAlign: 'center' },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, textAlign: 'center' },
  helper: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.gold, marginTop: 8, backgroundColor: colors.accentBg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  row: { flexDirection: 'row', gap: 12, marginTop: 28, width: '100%' },
  half: { flex: 1, width: undefined },
  stacked: { flexDirection: 'column' },
  full: { flex: 0, width: '100%' },
});
