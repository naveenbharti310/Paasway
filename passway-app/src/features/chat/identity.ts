import type { Connection } from '../../types/models';

// Each chat gets its own colour, so two people with the same name look different.
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

export function chatColor(connectionId: string): string {
  let hash = 0;
  for (const char of connectionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function otherPerson(connection: Connection, uid: string): { id: string; name: string } {
  return connection.userA === uid
    ? { id: connection.userB, name: connection.userBName }
    : { id: connection.userA, name: connection.userAName };
}
