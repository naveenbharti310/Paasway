import * as Location from 'expo-location';
import { withDeadline } from './withDeadline';

let permissionRequest: ReturnType<typeof Location.requestForegroundPermissionsAsync> | undefined;
function requestPermissionOnce() {
  if (!permissionRequest) {
    permissionRequest = Location.requestForegroundPermissionsAsync().finally(() => { permissionRequest = undefined; });
  }
  return permissionRequest;
}

// Both generating and redeeming a code need a location fix, since the
// proximity check on the server is the main defense against someone
// guessing codes from far away. Balanced accuracy is enough, this is
// deliberately not asking for precise GPS.
export async function getCurrentLocation(): Promise<{ lat: number; lng: number }> {
  return withDeadline(async (signal) => {
    // Recheck the OS every time: permissions can be revoked in Settings. Do not
    // launch Android permission activities when a grant already exists.
    let permission = await Location.getForegroundPermissionsAsync();
    if (signal.aborted) throw new Error('Location request expired. Try again.');
    if (permission.status !== 'granted' && permission.canAskAgain !== false) {
      permission = await requestPermissionOnce();
    }
    // A late OS dialog response must not resume GPS work after the UI deadline.
    if (signal.aborted) throw new Error('Location request expired. Try again.');
    if (permission.status !== 'granted') {
      throw new Error('Location access is required to use Passway.');
    }
    // Positions are deliberately not cached: the server proximity check needs
    // a fresh fix for each generation/redemption attempt.
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  }, 15_000);
}
