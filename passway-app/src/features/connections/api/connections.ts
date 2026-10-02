import { callable } from '../../../firebase/client';
import type { GenerateTidRequest, GenerateTidResponse, RedeemTidRequest, RedeemTidResponse, RespondRequest, RespondResponse, TidRequest, ConnectionRequestBody, Empty } from '../../../types/contracts';

export const generateTid = callable<GenerateTidRequest, GenerateTidResponse>('generateTid');
export const redeemTid = callable<RedeemTidRequest, RedeemTidResponse>('redeemTid');
export const respondToRequest = callable<RespondRequest, RespondResponse>('respondToRequest');
export const deactivateTid = callable<TidRequest, Empty>('deactivateTid');
export const endConnection = callable<ConnectionRequestBody, Empty>('endConnection');
