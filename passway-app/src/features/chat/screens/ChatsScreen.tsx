import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../firebase/client';
import { colors } from '../../../theme/colors';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';
import Avatar from '../../../components/Avatar';
import HeroIllustration from '../../../components/HeroIllustration';
import BottomNav from '../../../components/BottomNav';
import type { RootNavigationProp } from '../../../navigation/types';
import { useActiveChats, useNotes, useLastMessage } from '../api/chats';
import { otherPerson } from '../identity';

function shortTime(at: number): string {
  const d = new Date(at);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const h = d.getHours();
    return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  }
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return d.toDateString() === yesterday.toDateString() ? 'Yesterday' : `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function ChatsScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const uid = auth.currentUser?.uid ?? '';
  const { chats, loading, error } = useActiveChats(uid);
  const notes = useNotes(uid);

  return (
    <View style={styles.container}>
      <View style={styles.pad}>
        <ScreenHeader
          title="Chats"
          large
          showBack={navigation.canGoBack()}
          right={(
            <TouchableOpacity onPress={() => navigation.navigate('Settings')} accessibilityRole="button" accessibilityLabel="Settings" testID="chats-settings" style={styles.hit}>
              <Text style={styles.pill}>Settings</Text>
            </TouchableOpacity>
          )}
        />
      </View>
      {error && <Text accessibilityRole="alert" style={styles.empty}>Some chats could not load. Check your connection and reopen this screen.</Text>}
      {loading ? <ActivityIndicator style={styles.loading} color={colors.gold} /> : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.connectionId}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={(
            <View style={styles.emptyWrap}>
              <HeroIllustration scene="temporary" compact />
              <Text style={styles.emptyTitle}>No open chats</Text>
              <Text style={styles.empty}>When you connect with someone, your chat shows up here.</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const other = otherPerson(item, uid);
            const note = notes[item.connectionId];
            return (
              <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => navigation.navigate('Chat', { connectionId: item.connectionId })} testID={`chat-row-${item.connectionId}`} accessibilityRole="button">
                <Avatar name={other.name} seed={item.connectionId} size={56} />
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>{other.name}</Text>
                  {note ? <Text style={styles.note} numberOfLines={1}>{note}</Text> : null}
                  <LastMessage connectionId={item.connectionId} uid={uid} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
      <View style={styles.pad}>
        <Button label="Connect with someone new" onPress={() => navigation.navigate('Generate')} testID="new-connection" style={styles.cta} />
      </View>
      <BottomNav active="chats" />
    </View>
  );
}

function LastMessage({ connectionId, uid }: { connectionId: string; uid: string }) {
  const last = useLastMessage(connectionId, uid);
  const text = last ? `${last.senderId === uid ? 'You: ' : ''}${last.content.replace(/\s+/g, ' ')}` : 'No messages yet';
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.meta, !last && styles.metaEmpty]} numberOfLines={1}>{text}</Text>
      {last && <Text style={styles.time}>{shortTime(last.sentAt)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 16 },
  pad: { paddingHorizontal: 24 },
  loading: { marginTop: 40 },
  list: { paddingHorizontal: 24, paddingVertical: 8, flexGrow: 1 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
  hit: { minHeight: 44, justifyContent: 'center' },
  pill: { fontFamily: 'Passway-Medium', fontSize: 14, color: colors.textSecondary, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface, borderRadius: 999, overflow: 'hidden' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 40 },
  emptyTitle: { fontFamily: 'Passway-Bold', fontSize: 20, color: colors.textPrimary },
  empty: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18 },
  rowText: { flex: 1, gap: 4 },
  name: { fontFamily: 'Passway-SemiBold', fontSize: 18, color: colors.textPrimary },
  note: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.gold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { flex: 1, fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary },
  metaEmpty: { color: colors.textMuted, fontStyle: 'italic' },
  time: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted },
  cta: { marginBottom: 12, marginTop: 8 },
});
