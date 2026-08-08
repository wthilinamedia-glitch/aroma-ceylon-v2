# Aroma Ceylon Android Mobile UI + Push Notifications

This update keeps the Netlify/browser interface visually unchanged. Android-only styling is activated only inside the Aroma Ceylon APK through the native Android bridge/user-agent.

## What was added

- Reliable bundled Aroma Ceylon logo/icon paths for the APK.
- Android-only employee bottom navigation: Home, Messages, Attendance, Payslips, Profile.
- Compact Android employee status/summary cards while preserving the browser layout.
- Android notification permission handling and notification settings shortcut.
- Firebase Cloud Messaging (FCM) device-token registration.
- Supabase `push_devices` registry with authenticated ownership rules.
- Push delivery for:
  - Admin -> one employee private messages
  - Admin -> selected employees
  - Admin -> all-employees announcements
  - Employee -> admin messages/complaints/suggestions
  - Replies in either direction
- Notification taps open the Messages screen and attempt to open the exact thread.
- Logout disables the current account's device token before signing out.

## 1. Run the Supabase SQL

Run `13_ANDROID_PUSH_NOTIFICATIONS_SETUP.sql` in Supabase SQL Editor.

It creates the Android device-token table and secure registration/disable RPCs.

## 2. Create a Firebase project

In Firebase Console:

1. Create/open a project for Aroma Ceylon.
2. Add an **Android app**.
3. Use this Android package name exactly:

   `com.aromaceylon.business`

4. Download `google-services.json`.

Firebase documents `google-services.json` as application configuration, not a service-account secret. This project injects it through GitHub Actions instead of committing it to the repository.

## 3. Add the Firebase Android config to GitHub Actions

Open GitHub repository:

Settings -> Secrets and variables -> Actions -> New repository secret

Name:

`FIREBASE_GOOGLE_SERVICES_JSON`

Value: paste the **entire contents** of the downloaded `google-services.json` file.

Keep the existing secrets too:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The Android workflow writes the Firebase config only during the APK build.

## 4. Configure the secure Firebase server credential in Supabase

In Firebase Console:

Project settings -> Service accounts -> Generate new private key

This downloads a service-account JSON file. **Do not commit this file to GitHub and do not put it in React/Vite code.**

Add the entire JSON contents as a Supabase Edge Function secret named:

`FIREBASE_SERVICE_ACCOUNT_JSON`

## 5. Deploy the push Edge Function

Deploy the folder:

`supabase/functions/send-push`

Function name:

`send-push`

The function validates the logged-in sender against Supabase message RLS, finds only the thread's recipients, gets their registered Android tokens with the service role, and sends through Firebase Cloud Messaging HTTP v1.

## 6. Build a new APK

After `FIREBASE_GOOGLE_SERVICES_JSON` exists, run the GitHub workflow:

`Build Aroma Ceylon Android APK`

Download the `Aroma-Ceylon-Android-APK` artifact and install the new APK.

On Android 13+ the user will be asked to allow notifications after login.

## 7. End-to-end test

Recommended test:

1. Sign into the employee account in the Android APK and allow notifications.
2. Close/minimize the APK.
3. From the admin browser app, send that employee a private message.
4. The employee phone should receive an Android notification.
5. Tap it; the app should open Messages and the corresponding thread.
6. Reply from employee; an admin Android device that has logged in and registered should receive the reply notification.
7. Test an all-employees announcement.

## Notes

- The same Supabase database is shared by browser and APK.
- Browser UI appearance is not replaced by the Android bottom navigation.
- FCM depends on Google Play services on the Android device.
- Push delivery is best-effort: the message itself is saved in Supabase even if a phone is offline or a push provider temporarily fails.
- A later Play Store release should use a private release signing key and Android App Bundle (`.aab`).
