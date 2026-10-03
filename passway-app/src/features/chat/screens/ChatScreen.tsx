import { errorMessage } from '../../../services/errors';
import { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, doc, limitToLast } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { sendMessage } from '../api/messages';
import { endConnection } from '../../connections/api/connections';
import { fileReport, blockUser } from '../../safety/api/reports';
import { colors } from '../../../theme/colors';
import type { RootStackParamList, RootNavigationProp, EndOutcome } from '../../../navigation/types';
import { Message, Connection } from '../../../types/models';
import SwipeToReply from '../components/SwipeToReply';
import { chatColor } from '../identity';
import { saveNote, useNotes } from '../api/chats';

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

function timeOf(sentAt: number): string {
  const d = new Date(sentAt);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [actionFor, setActionFor] = useState<Message | null>(null);
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const notes = useNotes(auth.currentUser?.uid ?? '');
  const note = notes[connectionId];
  const navigatedAway = useRef(false);
  const list = useRef<FlatList<Message>>(null);
  const input = useRef<TextInput>(null);
  // Closing the options sheet can hand focus back to the message that was
  // pressed, so the message box is focused again just after it closes.
  const focusInput = () => setTimeout(() => input.current?.focus(), 250);
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

  // Going back always lands on the chats list, so an open chat is never
  // hidden somewhere the person cannot find it again.
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (navigatedAway.current) return;
    if (event.data.action.type !== 'GO_BACK' && event.data.action.type !== 'POP') return;
    const routes = navigation.getState().routes;
    if (routes[routes.length - 2]?.name === 'Chats') return;
    event.preventDefault();
    navigation.reset({ index: 0, routes: [{ name: 'Chats' }] });
  }), [navigation]);

  const otherIsA = connection ? connection.userA !== currentUserId : false;
  const otherName = connection ? (otherIsA ? connection.userAName : connection.userBName) : '';
  const otherId = connection ? (otherIsA ? connection.userA : connection.userB) : '';

  const byId = new Map(messages.map((m) => [m.messageId, m]));
  const nameOf = (m: Message) => (m.senderId === currentUserId ? 'You' : otherName || 'Them');

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
      const result = await sendMessage({ connectionId, content: text, ...(replyingTo ? { replyTo: replyingTo.messageId } : {}) });
      setDraft((current) => current.trim() === text ? '' : current);
      setReplyingTo(null);
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
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back to chats" testID="chat-back" style={styles.back}>
          <Text style={styles.backGlyph}>{'\u2039'}</Text>
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: chatColor(connectionId) }]}>
          <Text style={styles.avatarText}>{(otherName || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <TouchableOpacity style={styles.headerText} onPress={() => { setNoteDraft(note ?? ''); setNoteVisible(true); }} accessibilityHint="Add a private note to remember who this is" testID="chat-title">
          <Text style={styles.headerName} numberOfLines={1}>{otherName || 'Loading'}</Text>
          <Text style={note ? styles.headerNote : styles.headerSub} numberOfLines={1} testID="chat-note">{note || 'Add a private note'}</Text>
        </TouchableOpacity>
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
          const quoted = item.replyTo ? byId.get(item.replyTo) : undefined;
          return (
            <View style={mine ? styles.rowMine : styles.rowTheirs}>
              <SwipeToReply onReply={() => { setReplyingTo(item); focusInput(); }}>
              <Pressable
                onLongPress={() => setActionFor(item)}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityHint="Swipe sideways to reply, or long press for options"
                testID={`message-${item.messageId}`}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                {item.replyTo && (
                  <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]} testID="quote">
                    <Text style={[styles.quoteName, mine && styles.quoteTextMine]}>{quoted ? nameOf(quoted) : ''}</Text>
                    <Text style={[styles.quoteText, mine && styles.quoteTextMine]} numberOfLines={2}>{quoted ? quoted.content : 'This message is no longer available'}</Text>
                  </View>
                )}
                <Text style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}>{item.content}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>{timeOf(item.sentAt)}</Text>
              </Pressable>
              </SwipeToReply>
              {warning && (
                <TouchableOpacity onPress={() => setReportVisible(true)} accessibilityRole="button" accessibilityHint="Opens the report options">
                  <Text style={styles.warning}>{warning}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{'Say hello. Messages disappear 72 hours after they are sent.\n\nTip: tap the name at the top to add a private note, like "from the gym", so you know who this is.'}</Text>}
      />
      {replyingTo && (
        <View style={styles.replyBar} testID="reply-bar">
          <View style={styles.replyBarText}>
            <Text style={styles.quoteName}>{`Replying to ${nameOf(replyingTo) === 'You' ? 'yourself' : nameOf(replyingTo)}`}</Text>
            <Text style={styles.quoteText} numberOfLines={1}>{replyingTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => { setReplyingTo(null); focusInput(); }} accessibilityLabel="Cancel reply" testID="cancel-reply">
            <Text style={styles.replyClose}>{'\u2715'}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput ref={input} testID="message-input" style={styles.input} value={draft} onChangeText={setDraft} placeholder="Message" multiline maxLength={2000} onKeyPress={Platform.OS === 'web' ? (event) => {
            // On a computer keyboard Enter sends and Shift+Enter starts a new line.
            const key = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (key.key === 'Enter' && !key.shiftKey) { (event as unknown as { preventDefault: () => void }).preventDefault(); void handleSend(); }
          } : undefined} editable={!ending && !submitting && connection?.status === 'active'} />
        <TouchableOpacity onPress={handleSend} disabled={sending || ending || submitting || !draft.trim() || connection?.status !== 'active'} accessibilityLabel="Send message" testID="send-message"
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonOff]}>
          <Text style={styles.sendGlyph}>{sending ? '\u2026' : '\u2191'}</Text>
        </TouchableOpacity>
      </View>

      <Modal transparent visible={noteVisible} animationType="fade" onRequestClose={() => setNoteVisible(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheet, styles.noteSheet]}>
            <Text style={styles.noteTitle}>{`A note about ${otherName}`}</Text>
            <Text style={styles.noteHelp}>Only you can see this. It helps you tell people with the same name apart.</Text>
            <TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="For example: Metro, blue jacket" maxLength={40} style={styles.noteInput} testID="note-input" autoFocus />
            <TouchableOpacity style={styles.sheetRow} testID="note-save" onPress={() => {
              setNoteVisible(false);
              void saveNote(currentUserId, connectionId, noteDraft).catch((err) => setError(errorMessage(err, 'Could not save the note. Try again.')));
            }}>
              <Text style={styles.sheetRowText}>{noteDraft.trim() ? 'Save note' : 'Remove note'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => setNoteVisible(false)}>
              <Text style={styles.sheetRowMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={!!actionFor} animationType="fade" onRequestClose={() => setActionFor(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setActionFor(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} numberOfLines={2}>{actionFor?.content}</Text>
            <TouchableOpacity style={styles.sheetRow} testID="reply-action" onPress={() => { setReplyingTo(actionFor); setActionFor(null); focusInput(); }}>
              <Text style={styles.sheetRowText}>Reply</Text>
            </TouchableOpacity>
            {actionFor && actionFor.senderId !== currentUserId && (
              <TouchableOpacity style={styles.sheetRow} onPress={() => { setActionFor(null); setReportVisible(true); }}>
                <Text style={styles.sheetRowDanger}>Report</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={() => setActionFor(null)}>
              <Text style={styles.sheetRowMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  menuGlyph: { fontSize: 18, color: colors.textSecondary, fontWeight: '700' },
  list: { paddingVertical: 12, gap: 8 },
  bubble: { maxWidth: '80%', paddingTop: 8, paddingBottom: 6, paddingHorizontal: 12, borderRadius: 16, marginBottom: 4 },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.accentFill, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleTextTheirs: { fontSize: 15, lineHeight: 20, color: colors.textPrimary },
  bubbleTextMine: { fontSize: 15, lineHeight: 20, color: colors.onAccent },
  time: { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  timeMine: { color: colors.onAccent, opacity: 0.75 },
  quote: { borderLeftWidth: 3, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8, marginBottom: 6 },
  quoteTheirs: { borderLeftColor: colors.accentFill, backgroundColor: 'rgba(0,0,0,0.05)' },
  quoteMine: { borderLeftColor: colors.onAccent, backgroundColor: 'rgba(255,255,255,0.18)' },
  quoteName: { fontSize: 12, fontWeight: '600', color: colors.accentText },
  quoteText: { fontSize: 13, color: colors.textSecondary },
  quoteTextMine: { color: colors.onAccent },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderLeftWidth: 3, borderLeftColor: colors.accentFill, backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginTop: 6 },
  replyBarText: { flex: 1 },
  replyClose: { fontSize: 16, color: colors.textSecondary, padding: 4 },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 40 },
  headerName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  headerNote: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  headerText: { flex: 1 },
  back: { paddingRight: 4, paddingVertical: 2 },
  backGlyph: { fontSize: 28, color: colors.textSecondary, lineHeight: 30 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  noteSheet: { paddingHorizontal: 16, gap: 8, paddingTop: 16 },
  noteTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  noteHelp: { fontSize: 13, color: colors.textSecondary },
  noteInput: { borderWidth: 0.5, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: colors.textPrimary },
  headerSub: { fontSize: 12, color: colors.accentText, marginTop: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8 },
  input: { flex: 1, borderWidth: 0.5, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 120, color: colors.textPrimary },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  sendButtonOff: { opacity: 0.4 },
  sendGlyph: { fontSize: 18, color: colors.onAccent },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingVertical: 8, paddingHorizontal: 4 },
  sheetTitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingVertical: 10 },
  sheetRow: { paddingVertical: 14, alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border },
  sheetRowText: { fontSize: 15, color: colors.textPrimary },
  sheetRowDanger: { fontSize: 15, color: colors.danger, fontWeight: '600' },
  sheetRowMuted: { fontSize: 15, color: colors.textSecondary },
});
