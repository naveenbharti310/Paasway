import { randomInt } from 'node:crypto';
import { TID_CHARSET } from '../constants';

export function randomTid(): string {
  return Array.from({ length: 4 }, () => TID_CHARSET[randomInt(TID_CHARSET.length)]).join('');
}
