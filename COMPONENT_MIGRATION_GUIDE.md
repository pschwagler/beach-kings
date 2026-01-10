# Component Migration Guide

This guide helps migrate Next.js components to React Native components for the mobile app.

## Migration Checklist

### 1. HTML to React Native Element Mapping

| HTML Element | React Native Component |
|-------------|------------------------|
| `div` | `View` |
| `span` | `Text` |
| `p` | `Text` |
| `button` | `Pressable` or `TouchableOpacity` |
| `input` | `TextInput` |
| `img` | `Image` |
| `ul/ol` | `FlatList` or `ScrollView` with `View` children |
| `li` | `View` with `Text` |
| `a` | `Link` (from expo-router) or `Pressable` |
| `form` | `View` |
| `select` | `Picker` or custom dropdown |
| `textarea` | `TextInput` with `multiline` |

### 2. Styling Conversion

**From CSS:**
```css
.container {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background-color: #f4e4c1;
}
```

**To StyleSheet:**
```typescript
const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding: 16,
    backgroundColor: '#f4e4c1',
  },
});
```

### 3. Event Handlers

**From HTML:**
```jsx
<button onClick={handleClick}>Click me</button>
```

**To React Native:**
```tsx
<Pressable onPress={handleClick}>
  <Text>Click me</Text>
</Pressable>
```

### 4. Navigation

**From Next.js:**
```jsx
import { useRouter } from 'next/navigation';
const router = useRouter();
router.push('/league/123');
```

**To Expo Router:**
```tsx
import { useRouter } from 'expo-router';
const router = useRouter();
router.push('/league/123');
```

### 5. Using Shared Packages

Import from shared packages:
```tsx
import { formatDate, formatDateTimeWithTimezone } from '@beach-kings/shared';
import { api } from '@beach-kings/api-client';
```

### 6. Using Theme

```tsx
import { theme } from '../theme';
const { colors, spacing, typography } = theme;

const styles = StyleSheet.create({
  title: {
    ...typography.h1,
    color: colors.oceanBlue,
    marginBottom: spacing.md,
  },
});
```

### 7. Platform-Specific Code

```tsx
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  container: {
    padding: Platform.OS === 'ios' ? 20 : 16,
  },
});
```

## Component Migration Priority

1. **Core Components** (Start here):
   - Auth components (AuthModal, VerificationCodeInput)
   - Basic UI components (Button, Input, Card)
   - Navigation components

2. **Feature Components**:
   - League components
   - Match components
   - Player components
   - Rankings components

3. **Complex Components**:
   - Forms (MatchForm, LeagueForm)
   - Data tables (RankingsTable, MatchHistoryTable)
   - Modals and drawers

## Example Migration

### Before (Next.js):
```jsx
export function PlayerCard({ player }) {
  return (
    <div className="player-card">
      <img src={player.avatar} alt={player.name} />
      <h3>{player.name}</h3>
      <p>ELO: {player.elo}</p>
      <button onClick={() => viewProfile(player.id)}>
        View Profile
      </button>
    </div>
  );
}
```

### After (React Native):
```tsx
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { theme } from '../theme';

export function PlayerCard({ player }: { player: any }) {
  const { colors, spacing } = theme;
  
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundLight }]}>
      <Image source={{ uri: player.avatar }} style={styles.avatar} />
      <Text style={[styles.name, { color: colors.textPrimary }]}>
        {player.name}
      </Text>
      <Text style={[styles.elo, { color: colors.textSecondary }]}>
        ELO: {player.elo}
      </Text>
      <Pressable
        onPress={() => viewProfile(player.id)}
        style={[styles.button, { backgroundColor: colors.oceanBlue }]}
      >
        <Text style={[styles.buttonText, { color: colors.textWhite }]}>
          View Profile
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 8,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  elo: {
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
```

## Resources

- [React Native Documentation](https://reactnative.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [React Native Web](https://necolas.github.io/react-native-web/) (for web compatibility)

