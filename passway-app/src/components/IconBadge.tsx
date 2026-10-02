import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface Props {
  glyph: string;
  tone?: 'accent' | 'neutral';
}

// The rounded square icon badge used for the focal icon on a handful
// of screens. A shared component so the size and corner radius stay
// identical everywhere instead of drifting screen to screen.
export default function IconBadge({ glyph, tone = 'accent' }: Props) {
  return (
    <View style={[styles.badge, tone === 'accent' ? styles.accent : styles.neutral]}>
      <Text style={[styles.glyph, tone === 'accent' ? styles.accentText : styles.neutralText]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  accent: { backgroundColor: colors.accentBg },
  neutral: { backgroundColor: colors.surface },
  glyph: { fontSize: 20, fontWeight: '600' },
  accentText: { color: colors.accentText },
  neutralText: { color: colors.textSecondary },
});
