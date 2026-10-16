import { collection, doc } from '@react-native-firebase/firestore';
import { db } from '../../../firebase/client';
import { callable } from '../../../firebase/client';
import type { GenerateTidRequest, GenerateTidResponse, RedeemTidRequest, RedeemTidResponse, RespondRequest, RespondResponse, TidRequest, ConnectionRequestBody, Empty } from '../../../types/contracts';

import { connectionClock } from '../clock';
const generate = callable<GenerateTidRequest, GenerateTidResponse>('generateTid');
// Random local intent ID; allocation creates no Firestore document.
export const newRedemptionId = () => doc(collection(db, 'redemptionIds')).id;
const redeem = callable<RedeemTidRequest, RedeemTidResponse>('redeemTid');
export async function generateTid(data: GenerateTidRequest) {
  const startedAt = performance.now();
  const result = await generate(data);
  return { ...result, clock: connectionClock(result.createdAt, startedAt) };
}
export async function redeemTid(data: RedeemTidRequest) {
  const startedAt = performance.now();
  const result = await redeem(data);
  return { ...result, clock: connectionClock(result.servedAt, startedAt) };
}
export const respondToRequest = callable<RespondRequest, RespondResponse>('respondToRequest');
export const deactivateTid = callable<TidRequest, Empty>('deactivateTid');
export const endConnection = callable<ConnectionRequestBody, Empty>('endConnection');
