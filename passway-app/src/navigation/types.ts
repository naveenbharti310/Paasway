import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type EndOutcome = 'ended' | 'reported' | 'blocked' | 'idle';

export type RootStackParamList = {
  Generate: undefined;
  Code: { tid: string; createdAt: number; expiresAt: number };
  EnterCode: undefined;
  Request: { requestId: string; requesterName: string; requestedAt: number; tidCreatedAt: number; expiresAt: number };
  Chats: undefined;
  Chat: { connectionId: string };
  Ended: { outcome?: EndOutcome } | undefined;
  Settings: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  PhoneAuth: undefined;
};

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
