import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigationProp } from '../navigation/types';
import Icon, { type IconName } from './Icon';
import { colors, fonts } from '../theme/colors';
const items: { key: 'connect' | 'chats' | 'you'; label: string; icon: IconName; route: 'Generate' | 'Chats' | 'Settings' }[] = [
  { key: 'connect', label: 'Connect', icon: 'link', route: 'Generate' },
  { key: 'chats', label: 'Chats', icon: 'chat', route: 'Chats' },
  { key: 'you', label: 'You', icon: 'shield', route: 'Settings' },
];
export default function BottomNav({ active }: { active: 'connect' | 'chats' | 'you' }) {
  const navigation = useNavigation<RootNavigationProp>();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardOpen) return null;
  return <View style={styles.bar}>{items.map(item => <Pressable key={item.key} testID={item.key === 'chats' ? 'open-chats' : undefined} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: active === item.key }} onPress={() => { if (active !== item.key) navigation.reset({ index: 0, routes: [{ name: item.route }] }); }} android_ripple={{ color: '#ffffff12' }} style={styles.item}><View style={[styles.icon, active === item.key && styles.selected]}><Icon name={item.icon} size={22} color={active === item.key ? colors.gold : colors.textMuted} /></View><Text style={[styles.label, active === item.key && styles.labelSelected]}>{item.label}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', paddingTop: 10, paddingBottom: 4, backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, item: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4 }, icon: { width: 64, height: 32, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: colors.accentBg }, label: { fontFamily: fonts.medium, fontSize: 14, color: colors.textMuted }, labelSelected: { color: colors.gold, fontFamily: fonts.semibold } });
