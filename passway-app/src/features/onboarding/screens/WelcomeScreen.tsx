import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import Button from '../../../components/Button';
import IconBadge from '../../../components/IconBadge';
import type { AuthStackParamList } from '../../../navigation/types';

const PAGES = [
  { glyph: '\u2318', title: 'Meet someone, keep your number', body: 'Start a private chat with someone you just met, without giving them your phone number or social profiles.' },
  { glyph: '\u23F1', title: 'A code that lasts five minutes', body: 'One of you shows a short code. The other enters it while you are together. Each code works once.' },
  { glyph: '\u2713', title: 'You decide who gets in', body: 'You see their name first and choose to accept or decline. End, block or report a chat at any time.' },
  { glyph: '\u29D7', title: 'Nothing stays forever', body: 'Messages are deleted 72 hours after they are sent. Passway never shows anyone your number or your exact location.' },
];

export default function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [index, setIndex] = useState(0);
  const page = PAGES[index];
  const last = index === PAGES.length - 1;

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.brand}>Passway</Text>
        {!last && (
          <TouchableOpacity onPress={() => setIndex(PAGES.length - 1)} accessibilityRole="button" testID="welcome-skip">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.center}>
        <IconBadge glyph={page.glyph} />
        <Text style={styles.title} accessibilityRole="header">{page.title}</Text>
        <Text style={styles.body}>{page.body}</Text>
        <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${PAGES.length}`}>
          {PAGES.map((item, i) => <View key={item.title} style={[styles.dot, i === index && styles.dotActive]} />)}
        </View>
      </View>
      <View style={styles.actions}>
        {last && <Text style={styles.notice}>Passway is for people aged 18 and over.</Text>}
        <Button testID={last ? 'get-started' : 'welcome-next'} label={last ? 'Get started' : 'Next'} onPress={() => (last ? navigation.navigate('PhoneAuth') : setIndex(index + 1))} />
        {index > 0 && <Button label="Back" variant="secondary" onPress={() => setIndex(index - 1)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 56 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  skip: { fontSize: 14, color: colors.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  title: { fontSize: 20, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', maxWidth: 280 },
  body: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', maxWidth: 290, lineHeight: 21 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentFill, width: 18 },
  actions: { gap: 10, paddingBottom: 12 },
  notice: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
