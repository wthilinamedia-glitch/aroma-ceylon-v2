# Aroma Ceylon Android PDF Download Fix

Based on the latest passed Android build line with permanent signing.

Changes:
- Android versionCode 9 / versionName 1.2.6-test.
- Adds a native Android `downloadUrl` bridge backed by DownloadManager.
- Payslip, invoice, delivery note, receipt and credit-note downloads now call the native Android downloader inside the APK.
- Browser/Netlify behavior remains the existing anchor-download fallback.
- Permanent release signing workflow remains in place.

Upload the project contents to the existing GitHub repository root, commit, let the release workflow finish, then over-install the new release APK without uninstalling the current app.
