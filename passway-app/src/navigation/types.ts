export type RootStackParamList = {
  Generate: undefined;
  Code: { tid: string; expiresAt: number };
  EnterCode: undefined;
  Request: { requestId: string; requesterName: string; requestedAt: number; tidCreatedAt: number };
  Chat: { connectionId: string };
  Ended: { reported?: boolean } | undefined;
};

export type AuthStackParamList = {
  PhoneAuth: undefined;
};
