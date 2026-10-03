import type { Connection } from '../../types/models';

// Each chat gets its own colour, so two people with the same name look different.
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];

export function chatColor(connectionId: string): string {
  let hash = 0;
  for (const char of connectionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function clock(time: Date): string {
  const h = time.getHours();
  return `${h % 12 || 12}:${String(time.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Met today, 4:12 pm" helps tell apart two people with the same name,
// since you remember when you met them.
export function metLabel(createdAt: number, now = new Date()): string {
  const met = new Date(createdAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = met.getTime() >= startOfToday ? 'today'
    : met.getTime() >= startOfToday - 86400000 ? 'yesterday'
      : `${met.getDate()} ${MONTHS[met.getMonth()]}`;
  return `Met ${day}, ${clock(met)}`;
}

export function otherPerson(connection: Connection, uid: string): { id: string; name: string } {
  return connection.userA === uid
    ? { id: connection.userB, name: connection.userBName }
    : { id: connection.userA, name: connection.userAName };
}
