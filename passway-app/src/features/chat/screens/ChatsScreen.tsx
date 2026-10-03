import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../../../firebase/client';
import { colors } from '../../../theme/colors';
import ScreenHeader from '../../../components/ScreenHeader';
import Button from '../../../components/Button';
import type { RootNavigationProp } from '../../../navigation/types';
import { useActiveChats, useNotes, useLastMessage } from '../api/chats';
import { chatColor, otherPerson } from '../identity';

export default function ChatsScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const uid = auth.currentUser?.uid ?? '';
  const { chats, loading } = useActiveChats(uid);
  const notes = useNotes(uid);

  return (
    <View style={styles.container}>
      <ScreenHeader title="chats" showBack={navigation.canGoBack()} />
      {loading ? <ActivityIndicator style={styles.loading} color={colors.accentFill} /> : (
        <FlatList
          data={chats}
          keyExtractor={(item) => item.connectionId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No open chats. When you connect with someone, the chat shows up here.</Text>}
          renderItem={({ item }) => {
            const other = otherPerson(item, uid);
            const note = notes[item.connectionId];
            return (
              <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Chat', { connectionId: item.connectionId })} testID={`chat-row-${item.connectionId}`} accessibilityRole="button">
                <View style={[styles.avatar, { backgroundColor: chatColor(item.connectionId) }]}>
                  <Text style={styles.avatarText}>{other.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.name} numberOfLines={1}>{other.name}{note ? <Text style={styles.note}>{`  ${note}`}</Text> : null}</Text>
                  <LastMessage connectionId={item.connectionId} uid={uid} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
      <Button label="Connect with someone new" onPress={() => navigation.navigate('Generate')} testID="new-connection" />
    </View>
  );
}

function LastMessage({ connectionId, uid }: { connectionId: string; uid: string }) {
  const last = useLastMessage(connectionId);
  const text = last ? `${last.senderId === uid ? 'You: ' : ''}${last.content.replace(/\s+/g, ' ')}` : 'No messages yet';
  return <Text style={styles.meta} numberOfLines={1}>{text}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12 },
  loading: { marginTop: 40 },
  list: { gap: 4, paddingVertical: 8, flexGrow: 1 },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 40, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  rowText: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  note: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },
  meta: { fontSize: 13, color: colors.textMuted },
});
