// Core data model shared across the app. Mirrors the architecture doc
// (passway_architecture_and_data_model.md) and the decisions in its
// section 7.

export type TidStatus = 'active' | 'pending' | 'connected' | 'expired' | 'deactivated';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type ConnectionStatus = 'active' | 'ended';
export type ModerationFlag = 'none' | 'scam_suspected' | 'harassment_suspected';

export interface User {
  userId: string;
  phoneHash: string;
  displayName?: string;
  pushToken?: string;
  status: 'active' | 'reported' | 'banned';
  createdAt: number;
}

export interface Tid {
  tid: string;
  generatorId: string;
  generatorName: string;
  status: TidStatus;
  geoHash: string;
  createdAt: number;
  expiresAt: number;
}

export interface ConnectionRequest {
  requestId: string;
  tid: string;
  requesterId: string;
  requesterName: string;
  generatorId: string;
  status: RequestStatus;
  createdAt: number;
  connectionId?: string;
}

export interface Connection {
  connectionId: string;
  userA: string;
  userAName: string;
  userB: string;
  userBName: string;
  originTid: string;
  status: ConnectionStatus;
  endedBy?: string;
  createdAt: number;
  endedAt?: number;
}

export interface Message {
  messageId: string;
  connectionId: string;
  senderId: string;
  content: string;
  sentAt: number;
  moderationFlag: ModerationFlag;
}

export interface Report {
  reportId: string;
  reporterId: string;
  reportedId: string;
  connectionId: string;
  reason: string;
  createdAt: number;
}

// Constants tied directly to the decisions in section 7 of the
// architecture doc. functions/src/constants.ts mirrors these for the
// Cloud Functions package, which deploys separately.
export const TID_TTL_MS = 5 * 60 * 1000;
export const GEOHASH_PRECISION = 7;
export const MESSAGE_RETENTION_HOURS = 72;
export const REPORTED_MESSAGE_RETENTION_DAYS = 30;
export const MAX_TID_GENERATIONS_PER_HOUR = 10;
export const MAX_FAILED_REDEMPTIONS_PER_HOUR = 15;
