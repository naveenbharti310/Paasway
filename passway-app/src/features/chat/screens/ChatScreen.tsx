import { errorMessage } from '../../../services/errors';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Pressable, FlatList, StyleSheet, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, doc, limitToLast } from '@react-native-firebase/firestore';
import { db, auth } from '../../../firebase/client';
import { sendMessage } from '../api/messages';
import { endConnection } from '../../connections/api/connections';
import { fileReport, blockUser } from '../../safety/api/reports';
import { colors } from '../../../theme/colors';
import useReducedMotion from '../../../hooks/useReducedMotion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList, RootNavigationProp, EndOutcome } from '../../../navigation/types';
import { Message, Connection } from '../../../types/models';
import SwipeToReply from '../components/SwipeToReply';
import Avatar from '../../../components/Avatar';
import Icon from '../../../components/Icon';
import { tap } from '../../../services/haptics';
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

// "Today", "Yesterday" or a weekday, shown once above each day's messages.
function dayOf(sentAt: number): string {
  const d = new Date(sentAt);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (sentAt >= start) return 'Today';
  if (sentAt >= start - 86400000) return 'Yesterday';
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
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
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
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
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const notes = useNotes(auth.currentUser?.uid ?? '');
  const note = notes[connectionId];
  const navigatedAway = useRef(false);
  const list = useRef<FlatList<Message>>(null);
  const nearBottom = useRef(true);
  const onMessageSize = useCallback(() => { if (nearBottom.current) list.current?.scrollToEnd({ animated: false }); }, []);
  const messageKey = useCallback((item: Message) => item.messageId, []);
  const input = useRef<TextInput>(null);
  // Closing the options sheet can hand focus back to the message that was
  // pressed, so the message box is focused again just after it closes.
  const focusInput = useCallback(() => setTimeout(() => input.current?.focus(), 200), []);
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

  const byId = useMemo(() => new Map(messages.map((m) => [m.messageId, m])), [messages]);
  const nameOf = useCallback((m: Message) => (m.senderId === currentUserId ? 'You' : otherName || 'Them'), [currentUserId, otherName]);

  const renderMessage = useCallback(({ item, index }: { item: Message; index: number }) => {
          const mine = item.senderId === currentUserId;
          const newDay = index === 0 || new Date(messages[index - 1].sentAt).toDateString() !== new Date(item.sentAt).toDateString();
          const warning = !mine ? WARNINGS[item.moderationFlag] : undefined;
          const quoted = item.replyTo ? byId.get(item.replyTo) : undefined;
          return (
            <View style={mine ? styles.rowMine : styles.rowTheirs}>
              {newDay && <View style={styles.dayWrap}><Text style={styles.day} accessibilityRole="header">{dayOf(item.sentAt)}</Text></View>}
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
        }, [messages, currentUserId, otherName, byId, nameOf, focusInput]);

  function leaveChat(outcome: EndOutcome = 'ended') {
    if (navigatedAway.current) return;
    navigatedAway.current = true;
    navigation.replace('Ended', { outcome });
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || ending || submitting || connection?.status !== 'active') return;
    tap();
    setSending(true);
    setError(null);
    try {
      nearBottom.current = true;
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Chats' }] })} accessibilityRole="button" accessibilityLabel="Back to chats" testID="chat-back" style={styles.back}>
          <Icon name="back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Avatar name={otherName} seed={connectionId} size={40} />
        <TouchableOpacity style={styles.headerText} onPress={() => { setNoteDraft(note ?? ''); setNoteError(null); setNoteVisible(true); }} accessibilityRole="button" accessibilityLabel={`${otherName}${note ? `, ${note}` : ''}. Edit private note`} testID="chat-title">
          <Text style={styles.headerName} numberOfLines={1}>{otherName || 'Loading'}</Text>
          <Text style={note ? styles.headerNote : styles.headerSub} numberOfLines={1} testID="chat-note">{note || 'Your number stays private'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuVisible(true)} accessibilityRole="button" accessibilityLabel="Chat options" testID="chat-options" style={styles.menuButton}>
          <View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View>
        </TouchableOpacity>
      </View>
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {safetyNotice && <Text style={styles.notice}>Take your time before sharing contact details or moving to another app.</Text>}
      <FlatList
        ref={list}
        data={messages}
        onContentSizeChange={onMessageSize}
        onScroll={(event) => { const e = event.nativeEvent; nearBottom.current = e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 120; }}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={16}
        maxToRenderPerBatch={12}
        windowSize={9}
        keyExtractor={messageKey}
        contentContainerStyle={styles.list}
        renderItem={renderMessage}
        ListEmptyComponent={(
          <View style={styles.emptyWrap}>
            <Avatar name={otherName} seed={connectionId} size={72} />
            <Text style={styles.emptyName}>{otherName}</Text>
            <Text style={styles.empty}>{'Say hello. Messages disappear 72 hours after they are sent.'}</Text>
            <Text style={styles.emptyTip}>Tap the name at the top to add a private note only you can see.</Text>
          </View>
        )}
      />
      {replyingTo && (
        <View style={styles.replyBar} testID="reply-bar">
          <View style={styles.replyBarText}>
            <Text style={styles.quoteName}>{`Replying to ${nameOf(replyingTo) === 'You' ? 'yourself' : nameOf(replyingTo)}`}</Text>
            <Text style={styles.quoteText} numberOfLines={1}>{replyingTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => { setReplyingTo(null); focusInput(); }} accessibilityLabel="Cancel reply" testID="cancel-reply">
            <View style={styles.replyClose}><Icon name="close" size={18} color={colors.textSecondary} /></View>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput ref={input} testID="message-input" style={styles.input} value={draft} onChangeText={setDraft} accessibilityLabel="Message" maxFontSizeMultiplier={1.5} placeholder="Message" placeholderTextColor={colors.textMuted} selectionColor={colors.gold} multiline maxLength={2000} onKeyPress={Platform.OS === 'web' ? (event) => {
            // On a computer keyboard Enter sends and Shift+Enter starts a new line.
            const key = event.nativeEvent as unknown as { key: string; shiftKey?: boolean };
            if (key.key === 'Enter' && !key.shiftKey) { (event as unknown as { preventDefault: () => void }).preventDefault(); void handleSend(); }
          } : undefined} editable={!ending && !submitting && connection?.status === 'active'} />
        <TouchableOpacity onPress={handleSend} disabled={sending || ending || submitting || !draft.trim() || connection?.status !== 'active'} accessibilityLabel="Send message" testID="send-message"
          style={[styles.sendButton, !draft.trim() && !sending && styles.sendButtonOff]}>
          {sending ? <ActivityIndicator color={colors.onAccent} size="small" /> : <Icon name="send" size={22} strokeWidth={2.25} color={!draft.trim() ? colors.textMuted : colors.onAccent} />}
        </TouchableOpacity>
      </View>

      <Modal transparent visible={noteVisible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setNoteVisible(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined} keyboardVerticalOffset={Platform.OS === 'android' ? insets.top : 0}>
          <View style={[styles.sheet, styles.noteSheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
            <View style={styles.grabber} />
            <Text style={styles.noteTitle}>{`A note about ${otherName}`}</Text>
            <Text style={styles.noteHelp}>Only you can see this. It helps you tell people with the same name apart.</Text>
            <TextInput value={noteDraft} onChangeText={setNoteDraft} placeholder="For example: Metro, blue jacket" placeholderTextColor={colors.textMuted} selectionColor={colors.gold} maxLength={40} style={styles.noteInput} testID="note-input" autoFocus autoCapitalize="sentences" returnKeyType="done" accessibilityLabel={`Private note about ${otherName}`} />
            {noteError && <Text accessibilityRole="alert" style={styles.noteError}>{noteError}</Text>}
            {/* Save is only offered when something changed. Remove only when a note exists. */}
            <TouchableOpacity style={[styles.sheetRow, (noteDraft.trim() === (note ?? '') || (!noteDraft.trim() && !note)) && styles.sheetRowOff]} testID="note-save" disabled={savingNote || noteDraft.trim() === (note ?? '') || (!noteDraft.trim() && !note)} onPress={async () => {
              // Wait for the save to finish so the note is never lost if the app closes straight away.
              setSavingNote(true);
              setNoteError(null);
              try {
                await saveNote(currentUserId, connectionId, noteDraft);
                setNoteVisible(false);
              } catch (err) {
                setNoteError(errorMessage(err, 'Could not save the note. Try again.'));
              } finally {
                setSavingNote(false);
              }
            }}>
              {savingNote ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={styles.sheetRowText}>{!noteDraft.trim() && note ? 'Remove note' : 'Save note'}</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={() => setNoteVisible(false)}>
              <Text style={styles.sheetRowMuted}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={!!actionFor} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setActionFor(null)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setActionFor(null)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
            <View style={styles.grabber} />
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

      <Modal transparent visible={menuVisible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
            <View style={styles.grabber} />
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

      <Modal transparent visible={reportVisible} animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={() => setReportVisible(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => !submitting && setReportVisible(false)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom + 16) }]}>
            <View style={styles.grabber} />
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
  warning: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, maxWidth: 280, marginTop: 4, lineHeight: 17, backgroundColor: colors.dangerBg, padding: 10, borderRadius: 12, overflow: 'hidden' },
  container: { flex: 1, backgroundColor: colors.bg },
  error: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger, paddingVertical: 8, paddingHorizontal: 16 },
  notice: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.gold, backgroundColor: colors.accentBg, marginHorizontal: 16, marginTop: 8, padding: 12, borderRadius: 12, overflow: 'hidden', lineHeight: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  menuButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.textPrimary },
  list: { paddingVertical: 24, paddingHorizontal: 20, gap: 8, flexGrow: 1 },
  bubble: { maxWidth: '82%', paddingTop: 12, paddingBottom: 10, paddingHorizontal: 16, borderRadius: 24, marginBottom: 2 },
  bubbleTheirs: { backgroundColor: colors.surfaceRaised, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  bubbleMine: { backgroundColor: colors.accentFill, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  bubbleTextTheirs: { fontFamily: 'Passway-Regular', fontSize: 16, lineHeight: 22, color: colors.textPrimary },
  bubbleTextMine: { fontFamily: 'Passway-Regular', fontSize: 16, lineHeight: 22, color: colors.onAccent },
  time: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 3 },
  timeMine: { color: '#5F492B' },
  quote: { borderLeftWidth: 3, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  quoteTheirs: { borderLeftColor: colors.gold, backgroundColor: 'rgba(255,255,255,0.06)' },
  quoteMine: { borderLeftColor: '#000000', backgroundColor: 'rgba(0,0,0,0.07)' },
  quoteName: { fontFamily: 'Passway-Bold', fontSize: 14, color: colors.gold },
  quoteText: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 19 },
  quoteTextMine: { color: colors.onAccent },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderLeftWidth: 3, borderLeftColor: colors.gold, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 12, marginTop: 6 },
  replyBarText: { flex: 1 },
  replyClose: { fontFamily: 'Passway-Regular', fontSize: 16, color: colors.textSecondary, padding: 6 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 24 },
  emptyName: { fontFamily: 'Passway-Bold', fontSize: 22, color: colors.textPrimary, marginTop: 4 },
  empty: { fontFamily: 'Passway-Regular', fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  emptyTip: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
  headerName: { fontFamily: 'Passway-Bold', fontSize: 17, color: colors.textPrimary },
  headerNote: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary, marginTop: 2 },
  headerSub: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.gold, marginTop: 2 },
  headerText: { flex: 1, minHeight: 44, justifyContent: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backGlyph: { fontFamily: 'Passway-Regular', fontSize: 30, color: colors.textPrimary, lineHeight: 32, marginTop: -3 },
  noteSheet: { paddingHorizontal: 20, gap: 10 },
  noteTitle: { fontFamily: 'Passway-Bold', fontSize: 20, color: colors.textPrimary, marginTop: 4 },
  noteError: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.danger },
  noteHelp: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  noteInput: { borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 14, minHeight: 50, fontFamily: 'Passway-Regular', fontSize: 16, color: colors.textPrimary, marginVertical: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.fieldBorder, borderRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, fontFamily: 'Passway-Regular', fontSize: 16, maxHeight: 140, color: colors.textPrimary },
  sendButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentFill, alignItems: 'center', justifyContent: 'center' },
  sendButtonOff: { backgroundColor: colors.surfaceRaised },
  sendGlyph: { fontFamily: 'Passway-Bold', fontSize: 20, color: colors.onAccent },
  sendGlyphOff: { color: colors.textMuted },
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 8, paddingBottom: 28, paddingHorizontal: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, width: '100%', maxWidth: 480, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { fontFamily: 'Passway-Regular', fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 10, paddingHorizontal: 16, lineHeight: 18 },
  sheetRow: { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sheetRowText: { fontFamily: 'Passway-Medium', fontSize: 16, color: colors.textPrimary },
  sheetRowDanger: { fontFamily: 'Passway-SemiBold', fontSize: 16, color: colors.danger },
  sheetRowMuted: { fontFamily: 'Passway-Regular', fontSize: 16, color: colors.textSecondary },
  sheetRowOff: { opacity: 0.4 },
  dayWrap: { alignSelf: 'stretch', alignItems: 'center', marginVertical: 10 },
  day: { fontFamily: 'Passway-SemiBold', fontSize: 14, color: colors.textSecondary, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, overflow: 'hidden' },
});
