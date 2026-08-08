# Aroma Ceylon Android Test APK

The project contains a lightweight native Android WebView shell around the same React/Vite business app used by Netlify. Android-only styling is activated only inside the APK, so the browser UI remains visually unchanged.

## Current Android features

- Supabase authentication and shared live business data
- English / Sinhala interface
- Android-specific employee bottom navigation
- Attendance, payroll, products, shops, sales, invoices, messages and reports
- Bill/photo/document file selection
- PDF downloads
- Android back navigation
- Firebase Cloud Messaging push-notification support
- Notification tap -> Messages/thread deep link

## GitHub repository secrets

Required for the normal app build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Required to enable Android push notifications:

- `FIREBASE_GOOGLE_SERVICES_JSON`

See `ANDROID_MOBILE_PUSH_SETUP_GUIDE.md` for Firebase and Supabase Edge Function setup.

## Build the APK

1. Upload the project files to GitHub.
2. Open **Actions**.
3. Open **Build Aroma Ceylon Android APK**.
4. Run it on `main`.
5. When green, download the **Aroma-Ceylon-Android-APK** artifact.
6. Extract and install `Aroma-Ceylon-Android-Test.apk`.

This is a debug test APK, not the final Play Store release.
