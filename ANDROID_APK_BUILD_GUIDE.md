# Aroma Ceylon Android Test APK

This project includes a lightweight Android WebView wrapper and a GitHub Actions workflow that builds an installable debug APK from the same React/Vite source used by Netlify.

## What this test APK supports

- Supabase login and role-based data
- English / Sinhala interface
- Attendance, payroll, products, shops, sales, invoices and reports
- File selection for bills, product images and message attachments
- Standard HTTP/HTTPS PDF downloads
- Android back navigation

## Before running the workflow

Add these two GitHub repository secrets under **Settings → Secrets and variables → Actions**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Use the same values already configured in Netlify.

## Build the APK

1. Upload this project's files to the GitHub repository.
2. Open the repository's **Actions** tab.
3. Select **Build Aroma Ceylon Android APK**.
4. Choose **Run workflow**.
5. After the run is green, open it and download the **Aroma-Ceylon-Android-APK** artifact.
6. Extract the artifact ZIP and install `Aroma-Ceylon-Android-Test.apk` on an Android device.

Android may ask you to allow installation from the browser or file manager used to open the APK.

## Important

This is a debug test APK, not the final Play Store release. The final release will need a private signing key, an Android App Bundle (`.aab`), privacy-policy/store assets, push notifications through Firebase Cloud Messaging, and device testing.
