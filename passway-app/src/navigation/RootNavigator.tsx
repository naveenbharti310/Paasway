import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { ensureUserDoc } from '../api/ensureUser';
import { registerForPush } from '../api/registerForPush';
import PhoneAuthScreen from '../screens/PhoneAuthScreen';
import GenerateScreen from '../screens/GenerateScreen';
import CodeScreen from '../screens/CodeScreen';
import EnterCodeScreen from '../screens/EnterCodeScreen';
import RequestScreen from '../screens/RequestScreen';
import ChatScreen from '../screens/ChatScreen';
import EndedScreen from '../screens/EndedScreen';
import { colors } from '../theme/colors';

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

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export default function RootNavigator() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
      if (u) {
        // Best effort, a failure here should never block the person
        // from using the app.
        ensureUserDoc(u.uid)
          .then(() => registerForPush(u.uid))
          .catch(() => {});
      }
    });
    return unsubscribe;
  }, []);

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accentFill} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Generate" component={GenerateScreen} />
          <Stack.Screen name="Code" component={CodeScreen} />
          <Stack.Screen name="EnterCode" component={EnterCodeScreen} />
          <Stack.Screen name="Request" component={RequestScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Ended" component={EndedScreen} />
        </Stack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
