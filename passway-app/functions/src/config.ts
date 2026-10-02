import { setGlobalOptions } from 'firebase-functions/v2';
import { defineBoolean } from 'firebase-functions/params';
import { FUNCTIONS_REGION } from './constants';

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 20, memory: '256MiB', timeoutSeconds: 60 });

// App Check is on by default. Set ENFORCE_APP_CHECK=false in functions/.env.<project>
// only for a staging project that is tested from simulators without debug tokens.
export const enforceAppCheck = defineBoolean('ENFORCE_APP_CHECK', { default: true });
