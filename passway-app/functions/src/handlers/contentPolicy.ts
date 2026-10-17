import { HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase';
import { authedCallable } from '../lib/callable';
import { assertAccountActive, userRef } from '../lib/accounts';
import { CONTENT_POLICY_VERSION, hasContentPolicyConsent } from '../lib/contentPolicy';

export const acceptContentPolicy = authedCallable(async (uid, data, caller) => {
  if (data.version !== CONTENT_POLICY_VERSION || data.accept !== true) {
    throw new HttpsError('invalid-argument', 'Read and accept the current Passway use rules.');
  }
  return db.runTransaction(async (tx) => {
    const profile = await assertAccountActive(uid, tx, caller);
    if (!hasContentPolicyConsent(profile)) {
      tx.update(userRef(uid), { contentPolicyVersion: CONTENT_POLICY_VERSION, contentPolicyAcceptedAt: Date.now() });
    }
    return { accepted: true, version: CONTENT_POLICY_VERSION };
  });
});
