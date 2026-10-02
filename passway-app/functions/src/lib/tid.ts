import { TID_CHARSET } from '../constants';

export function randomTid(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += TID_CHARSET[Math.floor(Math.random() * TID_CHARSET.length)];
  }
  return out;
}
