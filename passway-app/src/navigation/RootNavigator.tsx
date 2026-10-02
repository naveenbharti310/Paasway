import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase/config';
import { ensureUserDoc } from '../features/auth/api/ensureUser';
import { registerForPush } from '../services/notifications';
import PhoneAuthScreen from '../features/auth/screens/PhoneAuthScreen';
import GenerateScreen from '../features/connections/screens/GenerateScreen';
import CodeScreen from '../features/connections/screens/CodeScreen';
import EnterCodeScreen from '../features/connections/screens/EnterCodeScreen';
import RequestScreen from '../features/connections/screens/RequestScreen';
import ChatScreen from '../features/chat/screens/ChatScreen';
import EndedScreen from '../features/connections/screens/EndedScreen';
import { colors } from '../theme/colors';

import type { RootStackParamList, AuthStackParamList } from './types';

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
