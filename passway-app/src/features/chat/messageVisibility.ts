import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Message } from '../../types/models';

export const MESSAGE_VISIBLE_MS = 72 * 60 * 60 * 1000;
export function messageVisible(message: Message, now: number): boolean {
  return Number.isFinite(message.sentAt) && message.sentAt > 0 && message.sentAt + MESSAGE_VISIBLE_MS > now;
}

// Visibility is based on sentAt, never the longer safety-evidence hold. Refresh
// on expiry and foreground: backgrounded native JS timers may be suspended.
export interface MessageClock { at: number; receivedAt: number }
export function useVisibleMessages(messages: Message[], serverClock?: MessageClock): Message[] {
  const [revision, refresh] = useState(0);
  // A device's wall clock must not extend message visibility. API snapshots
  // establish server time; elapsed time thereafter comes from a monotonic clock.
  const now = serverClock ? serverClock.at + Math.max(0, performance.now() - serverClock.receivedAt) : Date.now();
  const visible = messages.filter((message) => messageVisible(message, now));
  const nextExpiry = visible.reduce((next, message) => Math.min(next, message.sentAt + MESSAGE_VISIBLE_MS), Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => refresh((value) => value + 1), Math.min(86400000, Math.max(1, nextExpiry - now)));
    return () => clearTimeout(timer);
  }, [nextExpiry, revision, serverClock?.at, serverClock?.receivedAt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh((value) => value + 1); });
    return () => subscription.remove();
  }, []);
  return visible;
}
