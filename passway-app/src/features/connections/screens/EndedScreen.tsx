import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp, EndOutcome } from '../../../navigation/types';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

type EndedRouteProp = RouteProp<RootStackParamList, 'Ended'>;

const COPY: Record<EndOutcome, { glyph: string; title: string; body: string }> = {
  ended: { glyph: '\u2713', title: 'Connection ended', body: 'This connection is closed. To connect again, you will need a new code.' },
  reported: { glyph: '\u2691', title: 'Report submitted', body: 'Your report has been saved, the connection is closed and this person cannot connect with you again.' },
  blocked: { glyph: '\u2298', title: 'Person blocked', body: 'The connection is closed and this person cannot connect with you again.' },
  idle: { glyph: '\u23F2', title: 'Connection closed', body: 'There were no messages for three days, so this connection was closed.' },
};

export default function EndedScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<EndedRouteProp>();
  const copy = COPY[params?.outcome ?? 'ended'];

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <IconBadge glyph={copy.glyph} tone="neutral" />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.helper}>{copy.body}</Text>
        <Button label="Back to start" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Generate' }] })} style={styles.button} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  helper: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', maxWidth: 240, lineHeight: 18 },
  button: { width: 200, marginTop: 6 },
});
