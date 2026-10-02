import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Generate: undefined;
  Code: { tid: string; expiresAt: number };
  EnterCode: undefined;
  Request: { requestId: string; requesterName: string; requestedAt: number; tidCreatedAt: number; expiresAt: number };
  Chat: { connectionId: string };
  Ended: { reported?: boolean } | undefined;
};

export type AuthStackParamList = {
  PhoneAuth: undefined;
};

export type RootNavigationProp = NativeStackNavigationProp<RootStackParamList>;
