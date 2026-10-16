import { callable } from '../../../firebase/client';
import type { GenerateTidRequest, GenerateTidResponse, RedeemTidRequest, RedeemTidResponse, RespondRequest, RespondResponse, TidRequest, ConnectionRequestBody, Empty } from '../../../types/contracts';

import { connectionClock } from '../clock';
const generate = callable<GenerateTidRequest, GenerateTidResponse>('generateTid');
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
