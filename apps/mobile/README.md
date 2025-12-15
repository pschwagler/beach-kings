# Beach League Mobile App

React Native mobile app built with Expo for iOS and Android.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
Create a `.env` file with:
```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

3. Start the development server:
```bash
npm start
```

## Building

### Development Build
```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Production Build
```bash
eas build --profile production --platform all
```

## App Store Submission

### iOS
1. Configure App Store Connect:
   - Set up your app in App Store Connect
   - Get your App Store Connect API key
   - Update `eas.json` with your credentials

2. Submit:
```bash
eas submit --platform ios
```

### Android
1. Configure Google Play Console:
   - Set up your app in Google Play Console
   - Create a service account and download the key
   - Update `eas.json` with the key path

2. Submit:
```bash
eas submit --platform android
```

## Icons and Splash Screens

Icons and splash screens are located in `assets/`:
- `icon.png` - App icon (1024x1024)
- `splash-icon.png` - Splash screen icon
- `adaptive-icon.png` - Android adaptive icon

To regenerate icons and splash screens:
```bash
npx expo install @expo/configure-splash-screen
```

## Deep Linking

The app supports deep linking with the scheme `beachleague://`

Examples:
- `beachleague://league/123` - Open league with ID 123
- `beachleague://match/456` - Open match with ID 456

## Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```



