import { View, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import Icon, { type IconName } from './Icon';

interface Props {
  icon: IconName;
  tone?: 'accent' | 'neutral';
}

// The round icon used as the focal point on a handful of screens.
export default function IconBadge({ icon, tone = 'accent' }: Props) {
  const accent = tone === 'accent';
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.ring, accent ? styles.ringAccent : styles.ringNeutral]}>
      <View style={[styles.badge, accent ? styles.accent : styles.neutral]}>
        <Icon name={icon} size={28} color={accent ? colors.gold : colors.textSecondary} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: 92, height: 92, borderRadius: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 6 },
  ringAccent: { borderColor: colors.border },
  ringNeutral: { borderColor: colors.border },
  badge: { width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  accent: { backgroundColor: colors.accentBg },
  neutral: { backgroundColor: colors.surface },
});
