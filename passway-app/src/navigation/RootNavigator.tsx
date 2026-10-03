import * as Notifications from 'expo-notifications';
import { errorMessage } from '../services/errors';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, signOut, type User } from '@react-native-firebase/auth';
import { auth } from '../firebase/client';
import { findActiveConnection } from '../features/connections/api/activeConnection';
import { ensureUserDoc, type AccountStage } from '../features/auth/api/ensureUser';
import WelcomeScreen from '../features/onboarding/screens/WelcomeScreen';
import AgeCheckScreen from '../features/onboarding/screens/AgeCheckScreen';
import UnderAgeScreen from '../features/onboarding/screens/UnderAgeScreen';
import SettingsScreen from '../features/settings/screens/SettingsScreen';
import { registerForPush } from '../services/notifications';
import PhoneAuthScreen from '../features/auth/screens/PhoneAuthScreen';
import GenerateScreen from '../features/connections/screens/GenerateScreen';
import CodeScreen from '../features/connections/screens/CodeScreen';
import EnterCodeScreen from '../features/connections/screens/EnterCodeScreen';
import RequestScreen from '../features/connections/screens/RequestScreen';
import ChatScreen from '../features/chat/screens/ChatScreen';
import ChatsScreen from '../features/chat/screens/ChatsScreen';
import EndedScreen from '../features/connections/screens/EndedScreen';
import { colors } from '../theme/colors';

import type { RootStackParamList, AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export default function RootNavigator() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [stage, setStage] = useState<AccountStage>('needs_age');
  const [resumeConnectionId, setResumeConnectionId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let version = 0;
    let pushListener: ReturnType<typeof Notifications.addPushTokenListener> | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      const currentVersion = ++version;
      pushListener?.remove();
      pushListener = undefined;
      setCheckingAuth(true);
      setSetupError(null);
      setUser(u);
      try {
        let resume: string | null = null;
        let nextStage: AccountStage = 'needs_age';
        if (u) {
          nextStage = await ensureUserDoc(u.uid);
          // Open the chats list if any conversation is still active.
          if (nextStage === 'ready') resume = await findActiveConnection(u.uid).catch(() => null);
        }
        if (!active || currentVersion !== version) return;
        setStage(nextStage);
        setResumeConnectionId(resume);
        setCheckingAuth(false);
        if (u && Platform.OS !== 'web') {
          const refreshPush = () => registerForPush(u.uid).catch(() => console.warn('Notification registration could not be completed.'));
          void refreshPush();
          pushListener = Notifications.addPushTokenListener(() => void refreshPush());
        }
      } catch (err) {
        if (!active || currentVersion !== version) return;
        setSetupError(errorMessage(err, 'Your account could not be loaded. Try again.'));
        setCheckingAuth(false);
      }
    }, (err) => {
      if (!active) return;
      setSetupError(errorMessage(err, 'Sign in could not be checked.'));
      setCheckingAuth(false);
    });
    return () => { active = false; unsubscribe(); pushListener?.remove(); };
  }, [retry]);

  if (setupError) {
    return (
      <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.danger }}>{setupError}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
          <Text style={{ color: colors.accentText }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => void signOut(auth).catch(() => setSetupError('Could not sign out. Try again.'))}>
          <Text style={{ color: colors.textPrimary }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accentFill} />
      </View>
    );
  }

  if (user && stage === 'under_minimum') return <UnderAgeScreen />;
  if (user && stage === 'needs_age') return <AgeCheckScreen onResult={(confirmed) => setStage(confirmed ? 'ready' : 'under_minimum')} />;

  return (
    <NavigationContainer>
      {user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={resumeConnectionId ? 'Chats' : 'Generate'}>
          <Stack.Screen name="Generate" component={GenerateScreen} />
          <Stack.Screen name="Code" component={CodeScreen} />
          <Stack.Screen name="EnterCode" component={EnterCodeScreen} />
          <Stack.Screen name="Request" component={RequestScreen} />
          <Stack.Screen name="Chats" component={ChatsScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Ended" component={EndedScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </Stack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
