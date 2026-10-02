import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';

interface Props {
  title?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}

export default function ScreenHeader({ title, showBack, right }: Props) {
  const navigation = useNavigation();
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity style={styles.backCircle} onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Text style={styles.backGlyph}>{'\u2039'}</Text>
          </TouchableOpacity>
        )}
        {title ? <Text style={styles.title}>{title}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, marginBottom: 6 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontSize: 16, color: colors.textPrimary },
  title: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
});
