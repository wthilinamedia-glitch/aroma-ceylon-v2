# Android Permanent Signing — Final Polish Check 15

This project now builds a **release APK signed with one permanent Aroma Ceylon key**.
The signing key is intentionally NOT committed to GitHub.

## GitHub repository secrets required

Add these under **Settings → Secrets and variables → Actions → New repository secret**:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Keep the existing secrets too:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `FIREBASE_GOOGLE_SERVICES_JSON`

Use the values supplied separately with the Aroma Ceylon release-keystore backup.

## Important migration note

The APK already installed before this change was signed with a temporary/debug key. Android will therefore require **one final uninstall** before installing the first permanently signed build (`versionCode 5`).

After `versionCode 5` is installed, future APKs signed with the same permanent key and a higher `versionCode` can be installed directly over the existing app without uninstalling it.

## Never lose the key

Back up the supplied `.jks` file and its passwords in a secure place. If the permanent signing key is lost, Android will not accept future updates over an installed Aroma Ceylon app signed with this key.
