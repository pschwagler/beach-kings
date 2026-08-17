# Google Sign-In setup (mobile)

The mobile app uses `expo-auth-session/providers/google` for Google Sign-In and posts the resulting ID token to `POST /api/auth/google`. The backend verifies it against the explicit first-party audience set from `GOOGLE_CLIENT_ID` plus the optional comma-separated `GOOGLE_CLIENT_IDS`. Until the env vars below are populated, the buttons render but the flow throws `OAuthNotConfiguredError` ("Google sign-in is not configured" alert).

## One-time setup in Google Cloud Console

Use the same project that owns the existing `GOOGLE_CLIENT_ID` (the web client used by backend token verification — Google verifies tokens against the audience that issued them, but a single project's clients share the user-consent screen).

Create three OAuth 2.0 Client IDs at https://console.cloud.google.com/apis/credentials → **Create Credentials → OAuth client ID**:

1. **iOS application**
   - Bundle ID: `com.beachleague.app`
   - Copy the resulting client ID into `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
   - Copy the **iOS URL scheme** (the reversed client ID, e.g. `com.googleusercontent.apps.123456-abc`) — you'll need it below
2. **Android application**
   - Package name: `com.beachleague.app`
   - SHA-1 certificate fingerprint: get it from `eas credentials` (or `keytool` for local debug builds)
   - Copy into `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
3. **Web application**
   - Authorized redirect URI: `https://auth.expo.io/@<your-expo-username>/beach-league` (only needed if you ever use the Expo proxy; safe to add anyway)
   - Copy into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

## App config

Add the iOS reversed client ID to `apps/mobile/app.json` so the OAuth redirect can be received:

```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.beachleague.app",
      "infoPlist": {
        "CFBundleURLTypes": [
          {
            "CFBundleURLSchemes": ["com.googleusercontent.apps.YOUR_REVERSED_IOS_CLIENT_ID"]
          }
        ]
      }
    }
  }
}
```

After editing `app.json`, rebuild the dev client (`eas build --profile development --platform ios`) — JS hot-reload won't pick up native config.

## Verifying

With the env vars set:

1. Restart the Metro bundler so `EXPO_PUBLIC_*` vars are re-bundled.
2. Tap "Sign Up with Google" / "Continue with Google" — Google's consent sheet should appear.
3. After consent, the ID token is posted to `POST /api/auth/google` and the app navigates to the home stack.

If the alert still says "not configured": confirm `EXPO_PUBLIC_GOOGLE_*` values are present at runtime by logging `process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` from a screen (or use `expo-constants`). Vars are baked at bundle time.

## Backend

Backend verification is wired up at `POST /api/auth/google` (`apps/backend/api/routes/auth.py`). Keep the existing primary/web value in `GOOGLE_CLIENT_ID` and list any additional iOS/Android client IDs in comma-separated `GOOGLE_CLIENT_IDS`. Only explicitly configured audiences are accepted.
