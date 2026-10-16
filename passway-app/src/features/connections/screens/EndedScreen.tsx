import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp, EndOutcome } from '../../../navigation/types';
import Button from '../../../components/Button';
import { auth } from '../../../firebase/client';
import { useActiveChats } from '../../chat/api/chats';
import IconBadge from '../../../components/IconBadge';
import type { IconName } from '../../../components/Icon';

type EndedRouteProp = RouteProp<RootStackParamList, 'Ended'>;

const COPY: Record<EndOutcome, { icon: IconName; title: string; body: string }> = {
  ended: { icon: 'check', title: 'Connection ended', body: 'This connection is closed. To connect again, you will need a new code.' },
  reported: { icon: 'flag', title: 'Report submitted', body: 'Your report has been saved, the connection is closed and this person cannot connect with you again.' },
  blocked: { icon: 'ban', title: 'Person blocked', body: 'The connection is closed and this person cannot connect with you again.' },
  idle: { icon: 'clock', title: 'Connection closed', body: 'There were no messages for three days, so this connection was closed.' },
};

export default function EndedScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<EndedRouteProp>();
  const copy = COPY[params?.outcome ?? 'ended'];
  const { chats } = useActiveChats(auth.currentUser?.uid ?? '');

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <IconBadge icon={copy.icon} tone="neutral" />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.helper}>{copy.body}</Text>
        {chats.length > 0
          ? <Button label="Back to chats" testID="back-to-chats" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Chats' }] })} style={styles.button} />
          : <Button label="Back to start" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Generate' }] })} style={styles.button} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontFamily: 'Passway-Bold', fontSize: 26, color: colors.textPrimary, letterSpacing: -0.4 },
  helper: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 22 },
  button: { marginTop: 16 },
});
