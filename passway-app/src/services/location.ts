import * as Location from 'expo-location';
import { withDeadline } from './withDeadline';

// Both generating and redeeming a code need a location fix, since the
// proximity check on the server is the main defense against someone
// guessing codes from far away. Balanced accuracy is enough, this is
// deliberately not asking for precise GPS.
export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location access is required to use Passway.');
  }
  const position = await withDeadline(() => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 15_000);
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}
