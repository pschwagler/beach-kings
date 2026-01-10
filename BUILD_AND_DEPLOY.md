# Build and Deployment Guide

## Mobile App Build Configuration

### EAS Build Setup

The mobile app uses Expo Application Services (EAS) for building iOS and Android apps.

#### Prerequisites

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to Expo:
```bash
eas login
```

3. Create an EAS project:
```bash
cd apps/mobile
eas build:configure
```

This will create an `eas.json` file (already created) and link your project to EAS.

#### Building for Development

```bash
cd apps/mobile
eas build --profile development --platform ios
eas build --profile development --platform android
```

#### Building for Preview/Testing

```bash
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

#### Building for Production

```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

### iOS Build Requirements

1. **Apple Developer Account**: Required for production builds
2. **Xcode**: For local iOS development (optional, EAS can build in cloud)
3. **Certificates**: EAS handles certificate management automatically

### Android Build Requirements

1. **Google Play Console Account**: Required for production releases
2. **Keystore**: EAS can generate and manage keystores automatically
3. **Package Name**: Set in `app.json` as `com.beachleague.app`

### Environment Variables

Create `.env` files for different environments:

```bash
# apps/mobile/.env.production
EXPO_PUBLIC_API_URL=https://api.beachleaguevb.com

# apps/mobile/.env.development
EXPO_PUBLIC_API_URL=http://localhost:8000
```

### App Store Preparation

#### iOS App Store

1. **App Store Connect Setup**:
   - Create app in App Store Connect
   - Fill in app information, screenshots, description
   - Set up pricing and availability

2. **Icons and Assets**:
   - App icon: 1024x1024px (PNG)
   - Screenshots for different device sizes
   - Privacy policy URL

3. **Submit for Review**:
   ```bash
   eas submit --platform ios
   ```

#### Google Play Store

1. **Play Console Setup**:
   - Create app in Google Play Console
   - Fill in store listing, screenshots, description
   - Set up pricing and distribution

2. **Icons and Assets**:
   - App icon: 512x512px (PNG)
   - Feature graphic: 1024x500px
   - Screenshots for phones and tablets

3. **Submit for Review**:
   ```bash
   eas submit --platform android
   ```

### Over-the-Air Updates (EAS Update)

For updates that don't require app store review:

```bash
eas update --branch production --message "Bug fixes and improvements"
```

### CI/CD Integration

Example GitHub Actions workflow (`.github/workflows/mobile-build.yml`):

```yaml
name: Build Mobile App

on:
  push:
    branches: [main]
    paths:
      - 'apps/mobile/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install
      - run: npm install -g eas-cli
      - run: eas login --non-interactive
        env:
          EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      - run: eas build --platform all --non-interactive
```

## Web App Deployment

The web app deployment remains unchanged - use existing Docker Compose setup or your current deployment method.

## Backend Deployment

The backend deployment remains unchanged - use existing Docker Compose setup or your current deployment method.

