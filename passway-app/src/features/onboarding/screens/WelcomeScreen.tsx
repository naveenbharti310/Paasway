import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../../../theme/colors';
import Button from '../../../components/Button';
import HeroIllustration from '../../../components/HeroIllustration';
import MotionView from '../../../components/MotionView';
import TrustLine from '../../../components/TrustLine';
import Brand from '../../../components/Brand';
import { markWelcomeSeen } from '../../../services/onboarding';
import type { AuthStackParamList } from '../../../navigation/types';

const PAGES = [
  { icon: 'link' as const, title: 'Meet someone, keep your number', body: 'Start a private chat with someone you just met, without giving them your phone number or social profiles.' },
  { icon: 'timer' as const, title: 'A code that lasts five minutes', body: 'One of you shows a short code. The other enters it while you are together. Each code works once.' },
  { icon: 'shield' as const, title: 'You choose who gets in', body: 'You see their name first and choose to accept or decline. End, block or report a chat at any time.' },
  { icon: 'hourglass' as const, title: 'Nothing stays forever', body: 'Messages are deleted 72 hours after they are sent. Passway never shows anyone your number or your exact location.' },
];

export default function WelcomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const [index, setIndex] = useState(0);
  const page = PAGES[index];
  const last = index === PAGES.length - 1;
  const scenes = ['meet', 'code', 'choose', 'temporary'] as const;
  // Swipe left or right to move between pages, like most onboarding screens.
  const indexRef = useRef(index);
  indexRef.current = index;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_e, g) => {
      if (g.dx < -50) setIndex(Math.min(PAGES.length - 1, indexRef.current + 1));
      else if (g.dx > 50) setIndex(Math.max(0, indexRef.current - 1));
    },
  })).current;

  return (
    <View style={styles.container}>
      <View style={styles.top}><Brand />{!last && <TouchableOpacity onPress={() => setIndex(PAGES.length - 1)} accessibilityRole="button" testID="welcome-skip" style={styles.skipButton}><Text style={styles.skip}>Skip</Text></TouchableOpacity>}</View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center} showsVerticalScrollIndicator={false} {...swipe.panHandlers}>
        <MotionView key={index} style={styles.page}>
          <HeroIllustration scene={scenes[index]} />
          <Text style={styles.eyebrow}>REAL MOMENTS. NEW CONNECTIONS.</Text>
          <Text style={styles.title} accessibilityRole="header">{page.title}</Text>
          <Text style={styles.body}>{page.body}</Text>
        </MotionView>
      </ScrollView>
      <View style={styles.actions}>
        <View style={styles.progress}><View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${PAGES.length}`}>{PAGES.map((item, i) => <View key={item.title} style={[styles.dot, i === index && styles.dotActive]} />)}</View><Text style={styles.step}>{`0${index + 1} / 04`}</Text></View>
        {last && <Text style={styles.notice}>Passway is for people aged 18 and over.</Text>}
        <Button testID={last ? 'get-started' : 'welcome-next'} label={last ? 'Get started' : 'Next'} onPress={() => { if (last) { markWelcomeSeen(); navigation.navigate('PhoneAuth'); } else setIndex(index + 1); }} />
        {index > 0 ? <Button label="Back" variant="ghost" onPress={() => setIndex(index - 1)} /> : <TrustLine label="Your phone number stays yours." />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 },
  skipButton: { minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }, skip: { fontFamily: 'Passway-Medium', fontSize: 14, color: colors.textSecondary },
  scroll: { flex: 1 }, center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 16 }, page: { gap: 16 },
  eyebrow: { fontFamily: 'Passway-SemiBold', fontSize: 14, color: colors.gold, letterSpacing: 1.7, marginTop: 4 },
  title: { fontFamily: 'Passway-Bold', fontSize: 34, color: colors.textPrimary, letterSpacing: -1.1, lineHeight: 41 },
  body: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, lineHeight: 23 }, progress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dots: { flexDirection: 'row', gap: 7 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border }, dotActive: { width: 24, backgroundColor: colors.gold },
  step: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted, letterSpacing: 1.4 }, actions: { gap: 8, paddingBottom: 10 }, notice: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted, marginBottom: 4 },
});
