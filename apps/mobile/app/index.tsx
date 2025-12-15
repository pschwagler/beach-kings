import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { useTamaguiTheme } from '../src/hooks/useTamaguiTheme';
import FeatureSlideshow from '../src/components/FeatureSlideshow';

export default function LandingPage() {
  const theme = useTamaguiTheme();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, router]);

  const handleSignUp = () => {
    router.push('/signup');
  };

  const handleSignIn = () => {
    router.push('/login');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
    },
    logoSection: {
      alignItems: 'center',
      paddingTop: theme.spacing.xxl,
      paddingBottom: theme.spacing.lg,
    },
    logoImage: {
      width: 200,
      height: 60,
      resizeMode: 'contain',
    },
    logoText: {
      fontSize: theme.fontSize['4xl'],
      fontWeight: theme.fontWeight.bold,
      color: theme.colors.primaryDark,
      marginTop: theme.spacing.md,
    },
    slideshowSection: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonsSection: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    signUpButton: {
      backgroundColor: theme.colors.oceanBlue,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signUpButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.textWhite,
    },
    signInButton: {
      backgroundColor: 'transparent',
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.xl,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signInButtonText: {
      fontSize: theme.fontSize.base,
      fontWeight: theme.fontWeight.semibold,
      color: theme.colors.primary,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.logoText}>Beach League</Text>
        </View>

        {/* Slideshow Section */}
        <View style={styles.slideshowSection}>
          <FeatureSlideshow autoAdvanceInterval={4000} />
        </View>

        {/* Buttons Section */}
        <View style={styles.buttonsSection}>
          <Pressable style={styles.signUpButton} onPress={handleSignUp}>
            <Text style={styles.signUpButtonText}>Sign Up</Text>
          </Pressable>
          <Pressable style={styles.signInButton} onPress={handleSignIn}>
            <Text style={styles.signInButtonText}>Log In</Text>
          </Pressable>
        </View>
      </View>

    </SafeAreaView>
  );
}
