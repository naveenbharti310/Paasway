import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import Icon from './Icon';

interface Props {
  title?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  large?: boolean;
}

export default function ScreenHeader({ title, showBack, right, large }: Props) {
  const navigation = useNavigation();
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.left}>
          {showBack && (
            <TouchableOpacity style={styles.backCircle} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}>
              <Icon name="back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          {title && !large ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
        </View>
        {right}
      </View>
      {title && large ? <Text style={styles.largeTitle} accessibilityRole="header">{title}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 24, color: colors.textPrimary, lineHeight: 26, marginTop: -2 },
  title: { fontSize: 17, color: colors.textPrimary, fontWeight: '600' },
  largeTitle: { fontSize: 32, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.5, marginTop: 12 },
});
