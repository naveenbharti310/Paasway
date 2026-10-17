import * as Notifications from 'expo-notifications';
import { errorMessage } from '../services/errors';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity, Platform } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthStateChanged, signOut, type User } from '@react-native-firebase/auth';
import { auth } from '../firebase/client';
import { findActiveConnection } from '../features/connections/api/activeConnection';
import { ensureUserDoc, type AccountStage } from '../features/auth/api/ensureUser';
import DeletionRecoveryScreen from '../features/account/DeletionRecoveryScreen';
import WelcomeScreen from '../features/onboarding/screens/WelcomeScreen';
import AgeCheckScreen from '../features/onboarding/screens/AgeCheckScreen';
import UnderAgeScreen from '../features/onboarding/screens/UnderAgeScreen';
import SettingsScreen from '../features/settings/screens/SettingsScreen';
import { registerForPush, refreshPushToken } from '../services/notifications';
import PhoneAuthScreen from '../features/auth/screens/PhoneAuthScreen';
import GenerateScreen from '../features/connections/screens/GenerateScreen';
import CodeScreen from '../features/connections/screens/CodeScreen';
import EnterCodeScreen from '../features/connections/screens/EnterCodeScreen';
import RequestScreen from '../features/connections/screens/RequestScreen';
import ChatScreen from '../features/chat/screens/ChatScreen';
import ChatsScreen from '../features/chat/screens/ChatsScreen';
import EndedScreen from '../features/connections/screens/EndedScreen';
import { colors } from '../theme/colors';
import { hasSeenWelcome, welcomeSeenNow } from '../services/onboarding';
import useReducedMotion from '../hooks/useReducedMotion';
import { diagnosticScreen, diagnosticsEnabled } from '../services/diagnostics';

import type { RootStackParamList, AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const navTheme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, border: colors.hairline, primary: colors.gold, text: colors.textPrimary } };
const screenOptions = { headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' as const };
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export default function RootNavigator() {
  const reducedMotion = useReducedMotion();
  const motionScreenOptions = { ...screenOptions, animation: reducedMotion ? 'none' as const : screenOptions.animation };
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [stage, setStage] = useState<AccountStage>('needs_age');
  const [ageConfirm, setAgeConfirm] = useState<{ onResult: (confirmed: boolean) => void }>({ onResult: () => {} });
  const [resumeConnectionId, setResumeConnectionId] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [welcomeSeen, setWelcomeSeen] = useState(false);

  useEffect(() => {
    type StartupPhase =
      | 'auth_wait'
      | 'welcome_check'
      | 'ensure_user_doc'
      | 'find_active_connection'
      | 'complete'
      | 'load_error'
      | 'auth_error';
    let active = true;
    let version = 0;
    let pushListener: ReturnType<typeof Notifications.addPushTokenListener> | undefined;
    let timedOut = false;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let phase: StartupPhase = 'auth_wait';
    const setPhase = (next: StartupPhase) => {
      phase = next;
      if (diagnosticsEnabled) console.info(`[startup-phase] ${next}`);
    };
    const clearDeadline = () => { if (deadline !== undefined) clearTimeout(deadline); deadline = undefined; };
    const armDeadline = () => {
      clearDeadline();
      deadline = setTimeout(() => {
        if (!active) return;
        timedOut = true;
        ++version; // Late network results must not replace the recovery screen.
        clearDeadline();
        pushListener?.remove();
        pushListener = undefined;
        if (diagnosticsEnabled) console.warn(`[startup-watchdog] ${phase}`);
        setSetupError('Loading your account took too long. Check your connection and try again.');
        setCheckingAuth(false);
      }, 20_000);
    };
    const loadUser = async (u: User | null) => {
      if (!active || timedOut) return;
      const currentVersion = ++version;
      if (deadline === undefined) armDeadline();
      pushListener?.remove();
      pushListener = undefined;
      setCheckingAuth(true);
      setSetupError(null);
      setUser(u);
      try {
        let resume: string | null = null;
        let nextStage: AccountStage = 'needs_age';
        // Signed out: skip the welcome pages if this phone has already seen them.
        if (!u) {
          setPhase('welcome_check');
          const seen = await hasSeenWelcome();
          if (active && currentVersion === version) setWelcomeSeen(seen);
        }
        if (u) {
          setPhase('ensure_user_doc');
          nextStage = await ensureUserDoc(u.uid);
          if (!active || timedOut || currentVersion !== version) return;
          // Open the chats list if any conversation is still active.
          if (nextStage === 'ready') {
            setPhase('find_active_connection');
            resume = await findActiveConnection(u.uid).catch(() => null);
          }
        }
        if (!active || timedOut || currentVersion !== version) return;
        clearDeadline();
        setPhase('complete');
        if (u && nextStage === 'needs_age') {
          setAgeConfirm({
            onResult: (confirmed) => {
              if (!active || timedOut || currentVersion !== version) return;
              if (!confirmed) {
                ++version;
                setStage('under_minimum');
                return;
              }
              return loadUser(u);
            },
          });
        }
        setStage(nextStage);
        setResumeConnectionId(resume);
        setCheckingAuth(false);
        if (u && nextStage === 'ready' && Platform.OS !== 'web') {
          const refreshPush = () => registerForPush(u.uid).catch(() => console.warn('Notification registration could not be completed.'));
          void refreshPush();
          pushListener = Notifications.addPushTokenListener((token) => {
            void refreshPushToken(u.uid, token).catch(() => console.warn('Notification token refresh could not be completed.'));
          });
        }
      } catch (err) {
        if (!active || timedOut || currentVersion !== version) return;
        clearDeadline();
        setPhase('load_error');
        setSetupError(errorMessage(err, 'Your account could not be loaded. Try again.'));
        setCheckingAuth(false);
      }
    };
    // Covers both a missing native auth callback and stalled setup requests.
    setPhase('auth_wait');
    armDeadline();
    const unsubscribe = onAuthStateChanged(auth, loadUser, (err) => {
      if (!active || timedOut) return;
      ++version;
      clearDeadline();
      setPhase('auth_error');
      setSetupError(errorMessage(err, 'Sign in could not be checked.'));
      setCheckingAuth(false);
    });
    return () => { active = false; ++version; clearDeadline(); unsubscribe(); pushListener?.remove(); };
  }, [retry]);

  if (setupError) {
    return (
      <View testID="startup-error" style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 16, backgroundColor: colors.bg }}>
        <Text style={{ color: colors.danger }}>{setupError}</Text>
        <TouchableOpacity testID="startup-retry" accessibilityRole="button" onPress={() => setRetry((value) => value + 1)}>
          <Text style={{ color: colors.accentText }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="startup-signout" accessibilityRole="button" onPress={() => void signOut(auth).then(() => setRetry((value) => value + 1)).catch(() => setSetupError('Could not sign out. Try again.'))}>
          <Text style={{ color: colors.textPrimary }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (checkingAuth) {
    return (
      <View testID="startup-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator accessibilityLabel="Loading Passway" color={colors.accentFill} />
      </View>
    );
  }

  if (user && stage === 'deleting') return <DeletionRecoveryScreen />;
  if (user && stage === 'under_minimum') return <UnderAgeScreen />;
  if (user && stage === 'needs_age') return <AgeCheckScreen onResult={ageConfirm.onResult} />;

  return (
    <NavigationContainer theme={navTheme} onReady={() => diagnosticScreen(user ? (resumeConnectionId ? 'Chats' : 'Generate') : (welcomeSeen ? 'PhoneAuth' : 'Welcome'))}
      onStateChange={(state) => { const route = state?.routes[state.index ?? 0]; if (route) diagnosticScreen(route.name); }}>
      {user ? (
        <Stack.Navigator key="app" screenOptions={motionScreenOptions} initialRouteName={resumeConnectionId ? 'Chats' : 'Generate'}>
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
        <AuthStack.Navigator key="auth" screenOptions={motionScreenOptions} initialRouteName={welcomeSeen || welcomeSeenNow() ? 'PhoneAuth' : 'Welcome'}>
          <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
          <AuthStack.Screen name="PhoneAuth" component={PhoneAuthScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
