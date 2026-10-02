import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Registers this device for push notifications and saves the resulting
// Expo push token on the user's doc. redeemTid on the server reads it
// from there to notify the generator the moment someone enters their
// code, see functions/src/push.ts.
export async function registerForPush(uid: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  await updateDoc(doc(db, 'users', uid), { pushToken: token });
}
