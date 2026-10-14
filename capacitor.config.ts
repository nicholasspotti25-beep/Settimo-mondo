import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.settimomondo.game',
  appName: 'Settimo Mondo',
  webDir: 'dist',
  backgroundColor: '#120d1c',
  android: {
    path: 'native/android',
    backgroundColor: '#120d1c',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    path: 'native/ios',
    backgroundColor: '#120d1c',
    contentInset: 'never',
    scrollEnabled: false,
  },
  plugins: {
    StatusBar: { overlaysWebView: true, style: 'DARK', backgroundColor: '#00000000' },
  },
};

export default config;
