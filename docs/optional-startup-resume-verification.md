# Bounded optional startup resume lookup

## Confirmed cause

The account profile can be authoritatively verified while the optional active chat lookup remains pending. The previous RootNavigator awaited that lookup under the critical account startup watchdog and eventually presented an account loading error. Existing tests explicitly accepted that outcome. A controlled reproduction using the actual transpiled RootNavigator confirmed this defect on 77c6018. This does not establish the phase of the original intermittent Android 14 configuration change incident.

## Change

Gemini Argon High authored the exact RootNavigator and regression replacements. Model selection was independently verified before submission and after completion. Its response explicitly stated NOT EXECUTED. Execution reported here was performed independently in the local workspace.

Profile verification remains authoritative and fail closed. Optional active chat resume gets at most 1000 milliseconds, capped to the remaining original 20000 millisecond startup budget. A prompt result opens Chats. A stalled or rejected lookup opens Generate without a late navigation reset. Auth replacement, errors and cleanup invalidate stale state and clear timers. No App Check, account status or age requirements were relaxed.

## Independent verification

The new test file against the previous implementation: 29 tests, 25 passed and 4 failed. The same tests with the implementation: 29 passed, 0 failed. Full mobile suite: 231 passed, 0 failed. TypeScript: passed. Cases include remaining budget near the deadline, successful chat resume, stalled lookup fallback, late rejection, replacement auth and unmount timer cleanup. Existing banned, underage, deleting and authoritative profile timeout tests remain passing.

## Limits

Native same revision verification must be recorded separately. The old native and signed bundle passes apply only to their original source revision. Live backend deployment drift and preview environment parity are separate findings. No production readiness, real SMS, Play positive attestation or zero bug claim follows from these local tests.
