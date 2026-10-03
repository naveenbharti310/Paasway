import type { Connection } from '../../types/models';

// Each chat gets its own colour, so two people with the same name look different.
const COLORS = ['#7AA7FF', '#5FD3A5', '#F2C46D', '#FF8A80', '#B79CFF', '#FF8FC7', '#5ED6D0', '#FFAA6B', '#9AA5FF', '#B5E07A'];

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
