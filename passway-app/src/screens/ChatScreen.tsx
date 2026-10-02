import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db, app } from '../firebase/config';
import { sendMessage, endConnection, fileReport } from '../api/tid';
import { colors } from '../theme/colors';
import { RootStackParamList } from '../navigation/RootNavigator';
import { Message, Connection } from '../types/models';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

const REPORT_REASONS = [
  'Inappropriate messages',
  'Asked for money or gifts',
  'Made me feel unsafe',
  'Spam or a bot',
  'Other',
];

export default function ChatScreen() {
  const navigation = useNavigation<any>();
  const { params } = useRoute<ChatRouteProp>();
  const { connectionId } = params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [draft, setDraft] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentUserId = getAuth(app).currentUser?.uid ?? '';

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'connections', connectionId), (snap) => {
      setConnection((snap.data() as Connection) ?? null);
    });
    return unsubscribe;
  }, [connectionId]);

  useEffect(() => {
    const q = query(collection(db, 'connections', connectionId, 'messages'), orderBy('sentAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map((d) => d.data() as Message));
    });
    return unsubscribe;
  }, [connectionId]);

  const otherIsA = connection ? connection.userA !== currentUserId : false;
  const otherName = connection ? (otherIsA ? connection.userAName : connection.userBName) : '';
  const otherId = connection ? (otherIsA ? connection.userA : connection.userB) : '';

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    await sendMessage(connectionId, text);
  }

  async function handleEnd() {
    setMenuVisible(false);
    await endConnection(connectionId);
    navigation.replace('Ended');
  }

  async function handleReport(reason: string) {
    setSubmitting(true);
    try {
      await fileReport(connectionId, otherId, reason);
      setReportVisible(false);
      navigation.replace('Ended', { reported: true });
    } catch (err) {
      // A failed report should still leave the person able to try
      // again or just end the connection from the menu instead.
      console.warn('Report failed', err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{otherName || 'Loading'}</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityLabel="Chat options">
          <Text style={styles.menuGlyph}>&#8942;</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.senderId === currentUserId ? styles.bubbleMine : styles.bubbleTheirs]}>
            <Text style={item.senderId === currentUserId ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder="Message" />
        <TouchableOpacity onPress={handleSend} accessibilityLabel="Send message">
          <Text style={styles.sendGlyph}>Send</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={menuVisible} animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.sheet}>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setMenuVisible(false);
                setReportVisible(true);
              }}
            >
              <Text style={styles.sheetRowDanger}>Report and end connection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={handleEnd}>
              <Text style={styles.sheetRowText}>End connection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => setMenuVisible(false)}>
              <Text style={styles.sheetRowMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal transparent visible={reportVisible} animationType="fade" onRequestClose={() => setReportVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => !submitting && setReportVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>What went wrong?</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity key={reason} style={styles.sheetRow} onPress={() => handleReport(reason)} disabled={submitting}>
                <Text style={styles.sheetRowText}>{reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.sheetRow} onPress={() => setReportVisible(false)} disabled={submitting}>
              <Text style={styles.sheetRowMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  headerLabel: { fontSize: 13, color: colors.textSecondary },
  menuGlyph: { fontSize: 18, color: colors.textSecondary, fontWeight: '700' },
  list: { paddingVertical: 12, gap: 8 },
  bubble: { maxWidth: '78%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, marginBottom: 8 },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  bubbleMine: { backgroundColor: colors.accentFill, alignSelf: 'flex-end' },
  bubbleTextTheirs: { fontSize: 13, color: colors.textPrimary },
  bubbleTextMine: { fontSize: 13, color: colors.onAccent },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  input: { flex: 1, borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  sendGlyph: { fontSize: 13, color: colors.accentText, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, paddingHorizontal: 4 },
  sheetTitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 10 },
  sheetRow: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border },
  sheetRowText: { fontSize: 15, color: colors.textPrimary },
  sheetRowDanger: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  sheetRowMuted: { fontSize: 15, color: colors.textSecondary },
});
