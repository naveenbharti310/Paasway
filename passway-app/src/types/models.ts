export type TidStatus = 'active' | 'pending' | 'connected' | 'expired' | 'deactivated';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type ConnectionStatus = 'active' | 'ended';
export type ModerationFlag = 'none' | 'scam_suspected' | 'harassment_suspected';

export interface User {
  userId: string;
  displayName?: string;
  pushToken?: string;
  status: 'active' | 'reported' | 'banned' | 'deleting';
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
  generatorName: string;
  tidCreatedAt: number;
  expiresAt: number;
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
  status: ConnectionStatus;
  endedBy?: string;
  createdAt: number;
  endedAt?: number;
  reportedAt?: number;
  reportedBy?: string;
  blockedBy?: string;
  endReason?: 'idle';
  lastActivityAt?: number;
  lastMessageId?: string;
}

export interface Message {
  messageId: string;
  connectionId: string;
  senderId: string;
  content: string;
  sentAt: number;
  moderationFlag: ModerationFlag;
  replyTo?: string;
}

export interface Report {
  reportId: string;
  reporterId: string;
  reportedId: string;
  connectionId: string;
  reason: string;
  createdAt: number;
}

