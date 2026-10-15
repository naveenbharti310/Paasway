import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { Message } from '../../types/models';

export const MESSAGE_VISIBLE_MS = 72 * 60 * 60 * 1000;
export function messageVisible(message: Message, now: number): boolean {
  return Number.isFinite(message.sentAt) && message.sentAt > 0 && message.sentAt + MESSAGE_VISIBLE_MS > now;
}

// Visibility is based on sentAt, never the longer safety-evidence hold. Refresh
// on expiry and foreground: backgrounded native JS timers may be suspended.
export function useVisibleMessages(messages: Message[]): Message[] {
  const [clock, setClock] = useState(() => Date.now());
  const now = Math.max(clock, Date.now());
  const visible = messages.filter((message) => messageVisible(message, now));
  const nextExpiry = visible.reduce((next, message) => Math.min(next, message.sentAt + MESSAGE_VISIBLE_MS), Infinity);
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(86400000, Math.max(1, nextExpiry - Date.now())));
    return () => clearTimeout(timer);
  }, [nextExpiry, clock]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') setClock(Date.now()); });
    return () => subscription.remove();
  }, []);
  return visible;
}
