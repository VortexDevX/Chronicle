# Chronicle Android app

Chronicle Android is a small native shell for the existing responsive web app. It uses the same Vercel deployment, MongoDB data, account cookie, and cron endpoint. No second application server is required.

## What is included

- Hardened same-origin WebView with external links opened in the browser
- Existing Chronicle UI, account, library, updates, shelves, analytics, and settings
- Native offline/retry screen, edge-to-edge system bars, download handoff, and WebView back navigation
- Restored WebView history/current page after Android recreates the activity; last trusted Chronicle route is the fallback after process eviction
- Android 13+ notification prompt on first trusted app screen, with a Settings retry path
- Firebase Installation ID registration after an authenticated user grants notification permission
- Push taps open Chronicle's `/updates` page
- Per-installation device identity and logout cleanup
- Independent Android delivery cursor, so Telegram success or failure cannot suppress Android push

## Build debug APK

Prerequisites: Android SDK 36 and Android Studio's JDK 17 runtime. Do not use system Java 25.

```powershell
cd android-app
./gradlew.bat assembleDebug
```

APK output: `android-app/app/build/outputs/apk/debug/app-debug.apk`.

The default web URL is `https://chroniclex.vercel.app`. Override it for a different HTTPS deployment:

```powershell
./gradlew.bat assembleDebug -PCHRONICLE_BASE_URL=https://your-chronicle.example
```

## Enable push notifications

1. Create an Android app in Firebase with package name `com.vortexdevx.chronicle`.
2. Download `google-services.json` into `android-app/app/google-services.json`. This file is ignored by Git.
3. In Firebase/Google Cloud, create a service account allowed to send Firebase Cloud Messaging messages.
4. Add these secrets to the existing Chronicle deployment:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

5. Rebuild the APK and redeploy Chronicle.

Android 13 and newer show a runtime notification permission dialog. Android 12 and
older do not have this dialog; notifications are enabled by default unless disabled
in system settings. If permission was denied, turn Android push on again in Chronicle
Settings to open the app notification settings.

No Firebase Admin package or extra server is needed. Chronicle exchanges the service-account assertion for a short-lived Google access token and calls FCM HTTP v1 from the existing cron route.

## Release

Create a private upload keystore, configure signing outside Git, then build `bundleRelease`. Publish through Play Console internal testing before wider rollout. Never commit a keystore, `google-services.json`, or Firebase private key.
