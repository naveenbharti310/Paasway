import { errorMessage } from '../../../services/errors';
import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, doc, limitToLast } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { sendMessage } from '../api/messages';
import { endConnection } from '../../connections/api/connections';
import { fileReport, blockUser } from '../../safety/api/reports';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp, EndOutcome } from '../../../navigation/types';
import { Message, Connection } from '../../../types/models';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

function outcomeFor(connection: Connection | null, uid: string): EndOutcome {
  if (connection?.reportedBy === uid) return 'reported';
  if (connection?.blockedBy === uid) return 'blocked';
  if (connection?.endReason === 'idle') return 'idle';
  return 'ended';
}

// Shown under a received message the server flagged. Only the recipient sees it.
const WARNINGS: Partial<Record<Message['moderationFlag'], string>> = {
  scam_suspected: 'This looks like a common scam. Never send money, codes or card details. Tap to report.',
  harassment_suspected: 'This message may be abusive. You can end, block or report this chat. Tap to report.',
};

const REPORT_REASONS = [
  'Inappropriate messages',
  'Asked for money or gifts',
  'Made me feel unsafe',
  'Spam or a bot',
  'Other',
];

export default function ChatScreen() {
  const navigation = useNavigation<RootNavigationProp>();
  const { params } = useRoute<ChatRouteProp>();
  const { connectionId } = params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [draft, setDraft] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [safetyNotice, setSafetyNotice] = useState(false);
  const navigatedAway = useRef(false);
  const list = useRef<FlatList<Message>>(null);
  const currentUserId = auth.currentUser?.uid ?? '';

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'connections', connectionId), (snap) => {
      const data = (snap.data() as Connection) ?? null;
      setConnection(data);
      if ((!data || data.status === 'ended') && !navigatedAway.current) {
        navigatedAway.current = true;
        navigation.replace('Ended', { outcome: outcomeFor(data, currentUserId) });
      }
    }, (err) => setError(errorMessage(err, 'Could not load this connection.')));
    return unsubscribe;
  }, [connectionId, navigation, currentUserId]);

  useEffect(() => {
    const q = query(collection(db, 'connections', connectionId, 'messages'), orderBy('sentAt', 'asc'), limitToLast(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Expired messages can stay in the database until the next cleanup
      // sweep, so hide anything past its deletion time.
      const now = Date.now();
      setMessages(snapshot.docs.filter((d) => {
        const deleteAt = d.get('deleteAt') as { toMillis?: () => number } | undefined;
        return !deleteAt?.toMillis || deleteAt.toMillis() > now;
      }).map((d) => d.data() as Message));
    }, (err) => setError(errorMessage(err, 'Could not load messages.')));
    return unsubscribe;
  }, [connectionId]);

  // The back button or gesture would hide an open chat without ending it, so
  // it opens the chat options instead.
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (navigatedAway.current) return;
    if (event.data.action.type !== 'GO_BACK' && event.data.action.type !== 'POP') return;
    event.preventDefault();
    setMenuVisible(true);
  }), [navigation]);

  const otherIsA = connection ? connection.userA !== currentUserId : false;
  const otherName = connection ? (otherIsA ? connection.userAName : connection.userBName) : '';
  const otherId = connection ? (otherIsA ? connection.userA : connection.userB) : '';

  function leaveChat(outcome: EndOutcome = 'ended') {
    if (navigatedAway.current) return;
    navigatedAway.current = true;
    navigation.replace('Ended', { outcome });
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || ending || submitting || connection?.status !== 'active') return;
    setSending(true);
    setError(null);
    try {
      const result = await sendMessage({ connectionId, content: text });
      setDraft((current) => current.trim() === text ? '' : current);
      if (result.earlyContactShare) setSafetyNotice(true);
    } catch (err) {
      setError(errorMessage(err, 'Your message was not sent. Try again.'));
    } finally {
      setSending(false);
    }
  }

  async function handleEnd() {
    if (ending || submitting) return;
    setMenuVisible(false);
    setEnding(true);
    setError(null);
    try {
      await endConnection({ connectionId });
      leaveChat();
    } catch (err) {
      setError(errorMessage(err, 'Could not end the connection. Try again.'));
    } finally {
      setEnding(false);
    }
  }

  async function handleBlock() {
    if (ending || submitting) return;
    setMenuVisible(false);
    setEnding(true);
    setError(null);
    try {
      await blockUser({ connectionId });
      leaveChat('blocked');
    } catch (err) {
      setError(errorMessage(err, 'Could not block this person. Try again.'));
    } finally {
      setEnding(false);
    }
  }

  async function handleReport(reason: string) {
    if (submitting || ending || !otherId) return;
    setSubmitting(true);
    setError(null);
    try {
      await fileReport({ connectionId, reportedId: otherId, reason });
      setReportVisible(false);
      leaveChat('reported');
    } catch (err) {
      setError(errorMessage(err, 'Your report was not saved. Try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{otherName || 'Loading'}</Text>
        <TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityLabel="Chat options" testID="chat-options">
          <Text style={styles.menuGlyph}>&#8942;</Text>
        </TouchableOpacity>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {safetyNotice && <Text style={styles.notice}>Take your time before sharing contact details or moving to another app.</Text>}
      <FlatList
        ref={list}
        data={messages}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        keyExtractor={(item) => item.messageId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const mine = item.senderId === currentUserId;
          const warning = !mine ? WARNINGS[item.moderationFlag] : undefined;
          return (
            <View style={mine ? styles.rowMine : styles.rowTheirs}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
              </View>
              {warning && (
                <TouchableOpacity onPress={() => setReportVisible(true)} accessibilityRole="button" accessibilityHint="Opens the report options">
                  <Text style={styles.warning}>{warning}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextInput testID="message-input" style={styles.input} value={draft} onChangeText={setDraft} placeholder="Message" maxLength={2000} onSubmitEditing={handleSend} submitBehavior="submit" editable={!ending && !submitting && connection?.status === 'active'} />
        <TouchableOpacity onPress={handleSend} disabled={sending || ending || submitting || !draft.trim() || connection?.status !== 'active'} accessibilityLabel="Send message" testID="send-message">
          <Text style={styles.sendGlyph}>{sending ? 'Sending' : 'Send'}</Text>
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
            <TouchableOpacity style={styles.sheetRow} onPress={handleBlock} disabled={ending || submitting}>
              <Text style={styles.sheetRowDanger}>Block and end connection</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={handleEnd} disabled={ending || submitting}>
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
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
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
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  warning: { fontSize: 12, color: colors.danger, maxWidth: 260, marginTop: 4, lineHeight: 16 },
  container: { flex: 1, backgroundColor: colors.bg, padding: 20 },
  error: { fontSize: 12, color: colors.danger, paddingVertical: 8 },
  notice: { fontSize: 12, color: colors.textSecondary, paddingVertical: 8 },
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
