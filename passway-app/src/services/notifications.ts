import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { db } from '../firebase/client';

export async function registerForPush(uid: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!projectId) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Connections', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await updateDoc(doc(db, 'users', uid), { pushToken: token });
}
