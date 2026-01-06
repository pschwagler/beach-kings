export default {
  expo: {
    name: 'Beach League',
    slug: 'beach-league',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: 'beachleague',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#4a90a4',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.beachleague.app',
    },
    android: {
      package: 'com.beachleague.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#4a90a4',
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-notifications',
        {
          icon: './assets/icon.png',
          color: '#4a90a4',
        },
      ],
    ],
    extra: {
      router: {
        origin: false,
      },
      eas: {
        projectId: '',
      },
    },
  },
};





