import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { doc, updateDoc } from '@react-native-firebase/firestore';
import { db } from '../firebase/client';
import { createPushRegistration } from './pushRegistration';

const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
const registration = createPushRegistration<Notifications.DevicePushToken>({
  async prepare() {
    if (Platform.OS === 'web' || !projectId) return false;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Connections', importance: Notifications.AndroidImportance.DEFAULT });
    }
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status === 'granted') return true;
    if (!permission.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).status === 'granted';
  },
  async hasPermission() {
    return Platform.OS !== 'web' && !!projectId && (await Notifications.getPermissionsAsync()).status === 'granted';
  },
  async getExpoToken(devicePushToken) {
    return (await Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) })).data;
  },
  async save(uid, pushToken) { await updateDoc(doc(db, 'users', uid), { pushToken }); },
});

export const registerForPush = registration.register;
export const refreshPushToken = registration.refresh;
