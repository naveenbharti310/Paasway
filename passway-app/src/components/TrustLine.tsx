import { View, Text, StyleSheet } from 'react-native';
import Icon, { type IconName } from './Icon';
import { colors, fonts } from '../theme/colors';
export default function TrustLine({ label, icon = 'shield' }: { label: string; icon?: IconName }) {
  return <View style={styles.wrap}><Icon name={icon} size={16} color={colors.sage} /><Text style={styles.text}>{label}</Text></View>;
}
const styles = StyleSheet.create({ wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }, text: { flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.textSecondary } });
