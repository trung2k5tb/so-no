# Sổ Nợ — Android / Google Play build

This folder is an Android Studio project wrapping the existing Sổ Nợ web app.

## Build for Google Play
1. Open this folder in Android Studio.
2. Let Android Studio install/sync Android SDK 35 and Gradle/Android Gradle Plugin dependencies.
3. Set the Supabase URL and publishable key in `app/src/main/assets/www/config.js`.
4. Run the app on a physical Android phone and test login, debt creation, language switching, chat image upload, and chat location.
5. For Play Console, use **Build > Generate Signed App Bundle / APK > Android App Bundle** and create a release keystore.
6. Upload the resulting `.aab` to Google Play Console.

## Package
`com.sono.app`

## Important
- The Android wrapper requests precise/coarse location permission so chat location can use the device GPS.
- The web app still controls Supabase authentication/database and the rest of the UI.
- Do not put a Supabase service-role key in the app.
