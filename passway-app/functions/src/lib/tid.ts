import { randomInt } from 'node:crypto';
import { TID_CHARSET, TID_LENGTH } from '../constants';

export function randomTid(): string {
  return Array.from({ length: TID_LENGTH }, () => TID_CHARSET[randomInt(TID_CHARSET.length)]).join('');
}
