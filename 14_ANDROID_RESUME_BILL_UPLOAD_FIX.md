# Android Final Polish — Resume + Bill Photo Upload Fix

Base used for this patch: the latest `aroma-ceylon-v2-main.zip` supplied after the GitHub manual edits.

## Preserved from the latest GitHub source

This patch does **not** replace the project with the older Android package. The latest source remains the base, including later edits such as password recovery / Forgot password, payslip push invocation, Android pending view/payroll handling, the current GitHub Actions workflow, and the other files present in the uploaded `main` branch ZIP.

## Check 10 fix added

- The active Aroma Ceylon section is remembered for the current in-app session.
- Returning from the Android photo picker can restore the same section instead of dropping back to Home.
- An Add Expense draft preserves expense name, category, amount, date and note across a WebView reload.
- The Android wrapper temporarily caches the selected image in app cache.
- If the normal WebView file-input callback is lost during recreation/reload, the web app can restore the selected bill through the Android JavaScript bridge.
- The temporary cached bill is deleted after successful restoration.
- Sign out clears the saved resume view and expense draft.

## Version

- Web package: `3.2.1`
- Android: `1.2-test`
- Android versionCode: `3`

## Files intentionally changed

- `src/App.tsx`
- `src/androidBridge.ts`
- `android/app/src/main/java/com/aromaceylon/business/MainActivity.java`
- `android/app/build.gradle`
- `package.json`
- this documentation file

The existing `.github/workflows/build-android-apk.yml` from the uploaded latest GitHub ZIP is preserved unchanged.

## Check 10 retest

1. Open Add Expense.
2. Enter a sample expense name, amount and note.
3. Tap Bill photo and choose a 3–8 MB image.
4. Confirm the app returns to Add Expense instead of Home.
5. Confirm the typed fields are still present.
6. Confirm the selected image name/size appears.
7. Submit the expense.
8. Open the saved expense and verify the bill image can be viewed.


## Check 10.1 follow-up
- Keep the native cached image until the expense submission completes instead of clearing it immediately after React restores it.
- Call Android bridge chunk reads with the native bridge as the receiver.
- Retry pending-image restore briefly after the picker returns.
- Replace the browser-owned file-input text with a React-controlled selected-photo status so the UI reflects restored images correctly.
