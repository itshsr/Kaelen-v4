import { CapacitorConfig } from '@capacitor/cli';

// KAELEN Android shell — this does NOT bundle the web app's code into the APK.
// It points the native WebView at the live production URL, so every push to
// GitHub -> Vercel auto-deploy is reflected in the installed app instantly,
// with zero APK rebuild required. Requires an internet connection to load.
// A new APK build is only needed for native-level changes (icon, name,
// permissions) — not for any app feature/bugfix/content change.
const config: CapacitorConfig = {
  appId: 'app.kaelen.os',
  appName: 'KAELEN',
  webDir: 'dist', // unused at runtime (server.url overrides), required by CLI
  server: {
    url: 'https://kaelen-v4.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
