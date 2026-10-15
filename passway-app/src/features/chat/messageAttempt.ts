import type { SendMessageRequest } from '../../types/contracts';

// Keep the same key when a response is lost. Editing content, changing chat or
// changing the reply target creates a distinct intent. No message is persisted.
export function createMessageRetryState(newId: () => string) {
  let pending: SendMessageRequest | undefined;
  return {
    forMessage(connectionId: string, content: string, replyTo?: string): SendMessageRequest {
      if (!pending || pending.connectionId !== connectionId || pending.content !== content || pending.replyTo !== replyTo) {
        pending = { connectionId, content, clientMessageId: newId(), ...(replyTo ? { replyTo } : {}) };
      }
      return { ...pending };
    },
    delivered(key: string | undefined) { if (pending?.clientMessageId === key) pending = undefined; },
  };
}
