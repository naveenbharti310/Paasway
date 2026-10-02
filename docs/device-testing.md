# Device testing

Passway depends on phone sign in, location, App Check and notifications, so the full flow has to be checked on real phones. This page covers the automated flows and a manual checklist for two people.

## Free setup that is already running

1. Every Android build is made on Expo's free plan with the `preview` profile. Expo gives a link and a QR code to install the APK on any Android phone.
2. Builds are tested on real phones in Firebase Test Lab using its free daily quota (5 real phone runs and 10 virtual phone runs).
3. `passway-app/.maestro/robo-script.json` drives Test Lab through the welcome pages and sign in with a test number. Robo directives then fill the age boxes (`age-day` 15, `age-month` 06, `age-year` 1995) and the name field (`name-input`), and Robo explores the rest of the app on its own. The age boxes are typed by directives rather than the script because Test Lab draws its progress banner over the middle of the screen while a script runs.

To run it again after a new build, upload the APK and the script to the Test Lab bucket and start a run from the Test Lab page in the Firebase console, choosing Robo test and the script file.

iPhones need a paid Apple developer account, so there is no iOS build yet.

## Setup for a paid project

1. Finish the Firebase setup in the [app README](../passway-app/README.md), including App Check debug tokens for each test phone.
2. Add test phone numbers in Firebase under Authentication, Sign in method, Phone.

| Number | Code | Used by |
| --- | --- | --- |
| +91 99999 00001 | 123456 | Maestro flows and phone A |
| +91 99999 00002 | 123456 | Phone B |

3. Build and install a development client on both phones:

```sh
cd passway-app
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
npm start
```

4. Deploy to a staging project, not production.

## Automated flows

The flows in `passway-app/.maestro/flows/` use [Maestro](https://maestro.mobile.dev). Install it on your computer, connect a phone with USB debugging or start an emulator, open the development build once, then run:

```sh
cd passway-app
maestro test .maestro/flows/01_onboarding_and_sign_in.yaml
maestro test .maestro/flows/02_age_check.yaml
maestro test .maestro/flows/03_generate_code.yaml
maestro test .maestro/flows/04_settings_and_delete.yaml
```

| Flow | Checks |
| --- | --- |
| 01 | Welcome pages, phone sign in with a test number |
| 02 | A valid date of birth opens the main screen |
| 03 | Location permission and a four character code appear |
| 04 | Settings opens, name saves, account deletion returns to the welcome screen |

Run them in order. Flow 04 deletes the test account, so flow 01 starts fresh next time.

## Manual checklist with two phones

Stand next to each other for steps 1 to 10.

| Step | Phone A | Phone B | Expected |
| --- | --- | --- | --- |
| 1 | Install and open | Install and open | Welcome pages, then sign in |
| 2 | Sign in with number 1 | Sign in with number 2 | Code arrives or test code works |
| 3 | Enter an under 18 date | | Under 18 screen. Sign out and sign in again, the screen stays |
| 4 | Delete that account, sign in again | Enter an adult date | Phone A is still blocked until the 18th birthday. Use a third test number for A from here |
| 5 | Generate a code | | Location prompt, code shown, countdown runs |
| 6 | | Enter the code | Request appears on A |
| 7 | Accept | | Both open the chat |
| 8 | Send "hi" | Reply | Both see messages. With the app in the background, a notification says only that a message arrived |
| 9 | | Send "send me the OTP you got, urgent" | A sees a warning under the message. Tapping it opens report |
| 10 | Close and reopen the app | | The chat opens again |
| 11 | Block | | Chat ends on both. A new code from B cannot be used by A |
| 12 | Move at least 500 m apart, generate a code | Enter it | Rejected with the same message as a wrong code |
| 13 | Turn off location permission, generate | | Clear message asking for location |
| 14 | Turn on airplane mode, send | | Clear error, no crash |
| 15 | Settings, Delete account | | Returns to welcome. The other person's chat shows as ended |

Record the phone model, OS version and build number for each run. Any crash or wrong message is a release blocker.

## Store review notes

1. Apple and Google both need account deletion inside the app. It is in Settings.
2. Give reviewers a test phone number and code in the review notes, since they cannot receive real SMS for your project.
3. The 18 and over rule should match the age rating you choose in both stores.
