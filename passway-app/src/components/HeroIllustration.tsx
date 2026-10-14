import { Image, StyleSheet, View } from 'react-native';
const images = {
  meet: require('../../assets/illustrations/meet.png'),
  code: require('../../assets/illustrations/code.png'),
  choose: require('../../assets/illustrations/choose.png'),
  temporary: require('../../assets/illustrations/temporary.png'),
};
export default function HeroIllustration({ scene = 'meet', compact = false }: { scene?: keyof typeof images; compact?: boolean }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.wrap, compact && styles.compact]}><Image source={images[scene]} resizeMode="contain" style={styles.image} /></View>;
}
const styles = StyleSheet.create({ wrap: { width: '100%', aspectRatio: 1.3, maxHeight: 280, borderRadius: 32, overflow: 'hidden' }, compact: { aspectRatio: 2.7, maxHeight: 128 }, image: { width: '100%', height: '100%' } });
