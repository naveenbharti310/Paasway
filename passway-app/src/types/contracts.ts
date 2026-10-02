// Request and response shapes for the Cloud Functions in functions/src/handlers.
import type { ModerationFlag } from './models';

export interface Coordinates { lat: number; lng: number }

export interface GenerateTidRequest extends Coordinates { displayName: string }
export interface GenerateTidResponse { tid: string; createdAt: number; expiresAt: number }

export interface RedeemTidRequest extends Coordinates { tid: string; displayName: string }
export interface RedeemTidResponse { requestId: string; expiresAt: number }

export interface RespondRequest { requestId: string; accept: boolean }
export interface RespondResponse { connectionId?: string }

export interface TidRequest { tid: string }
export interface ConnectionRequestBody { connectionId: string }

export interface SendMessageRequest { connectionId: string; content: string }
export interface SendMessageResponse { flag: ModerationFlag; earlyContactShare: boolean }

export interface FileReportRequest { connectionId: string; reportedId: string; reason: string }
export interface FileReportResponse { reportId: string }

export type Empty = Record<string, never>;
