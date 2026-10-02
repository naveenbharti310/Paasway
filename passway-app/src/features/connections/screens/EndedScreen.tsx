import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp } from '../../../navigation/types';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';

type EndedRouteProp = RouteProp<RootStackParamList, 'Ended'>;

export default function EndedScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<EndedRouteProp>();
  const reported = params?.reported ?? false;

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <IconBadge glyph={reported ? '\u2691' : '\u2713'} tone="neutral" />
        <Text style={styles.title}>{reported ? 'Report submitted' : 'Connection ended'}</Text>
        <Text style={styles.helper}>
          {reported
            ? 'Your report has been saved and the connection is closed.'
            : 'This connection is closed. To connect again, you will need a new code.'}
        </Text>
        <Button label="Generate new TID" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Generate' }] })} style={styles.button} />
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
