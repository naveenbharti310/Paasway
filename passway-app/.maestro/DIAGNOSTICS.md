# Internal Android diagnostics

`eas build --platform android --profile play-diagnostics` adds native crash/ANR
reporting and a foreground JavaScript-stall sampler. Diagnostics contain screen
names and keyboard timing, not input values, phone numbers or chat text. The
collection default is off; the diagnostic profile turns it on at runtime.

Real family phone numbers still use 2Factor. Only the two preconfigured fictional
Firebase numbers use its official no-SMS test authentication, and only in this
profile. Test Lab detection prevents automated crawls from sending SMS to other
numbers. The production profile rejects the diagnostics flag.

Automated account profiles are marked `automatedTest: true` by the administrator.
Firestore rules prevent clients changing that field. The server rejects pairing
across automated/normal cohorts, both at redemption and acceptance.

The uploaded Robo script exercises onboarding, invalid-number feedback, login,
synthetic chat sending, repeated keyboard edits, code input, and settings. The
synthetic chat is pre-seeded so device tests can access the chat screen. This is
native smoke coverage, NOT proof that two physical phones completed pairing or
received messages end-to-end. Pairing is separately covered by real Firestore
transaction integration tests. Optional age steps are skipped for ready accounts.

Reports must be checked in Play Console and Crashlytics. An uploaded script or a
successful AAB build is not evidence that Google executed the tests or that an
Oppo Reno 14 freeze is resolved. Do not publish this profile publicly. Remove
fixtures and fictional-account access once this diagnostic run is complete.
