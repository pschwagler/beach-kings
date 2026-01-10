import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Dimensions, StyleSheet } from 'react-native';
import { Users, MapPin, Calendar, Trophy, TrendingUp, Award } from 'lucide-react-native';
import { useTamaguiTheme } from '../hooks/useTamaguiTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Feature {
  icon: React.ComponentType<any>;
  text: string;
}

const FEATURES: Feature[] = [
  {
    icon: Users,
    text: 'Start your own beach volleyball league and compete with friends for the top spot',
  },
  {
    icon: MapPin,
    text: 'Discover and connect with players in your area',
  },
  {
    icon: Calendar,
    text: 'Easily schedule games and manage signups so everyone can join the fun',
  },
  {
    icon: Trophy,
    text: 'Track your competitive rating and see how you rank against other players',
  },
  {
    icon: TrendingUp,
    text: 'Watch your skills improve as you track every game and milestone',
  },
  {
    icon: Award,
    text: 'Organize tournaments and special events like King of the Beach',
  },
];

interface FeatureSlideshowProps {
  initialWait?: number; // Initial wait time in milliseconds (default: 9000)
  autoAdvanceInterval?: number; // Auto-advance interval after initial wait (default: 4000)
}

export default function FeatureSlideshow({ 
  initialWait = 9000,
  autoAdvanceInterval = 4000 
}: FeatureSlideshowProps) {
  const theme = useTamaguiTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isUserScrollingRef = useRef(false);
  const isInitialWaitRef = useRef(true);

  const startAutoAdvance = (useInitialWait: boolean) => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const waitTime = useInitialWait ? initialWait : autoAdvanceInterval;
    isInitialWaitRef.current = useInitialWait;

    intervalRef.current = setInterval(() => {
      // Don't auto-advance if user is currently scrolling
      if (isUserScrollingRef.current) {
        return;
      }

      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % FEATURES.length;
        scrollViewRef.current?.scrollTo({
          x: nextIndex * SCREEN_WIDTH,
          animated: true,
        });
        return nextIndex;
      });
      
      // After initial wait completes, switch to shorter interval
      if (useInitialWait) {
        // Clear this interval and start the shorter one
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        isInitialWaitRef.current = false;
        startAutoAdvance(false);
      }
    }, waitTime);
  };

  useEffect(() => {
    // Start with initial wait
    startAutoAdvance(true);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const handleScrollBeginDrag = () => {
    // User started scrolling - mark as user-initiated
    isUserScrollingRef.current = true;
    // Reset to initial wait when user scrolls
    startAutoAdvance(true);
  };

  const handleScrollEnd = (event: any) => {
    // Update index based on final scroll position
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
    
    // Mark scrolling as complete
    isUserScrollingRef.current = false;
  };

  const handleScroll = (event: any) => {
    // Update index during scroll for smooth dot indicator updates
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffsetX / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  const styles = StyleSheet.create({
    container: {
      width: SCREEN_WIDTH,
    },
    slide: {
      width: SCREEN_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.xl,
      paddingVertical: theme.spacing.xxl,
    },
    iconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.oceanBlue,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.spacing.lg,
    },
    text: {
      fontSize: theme.fontSize.lg,
      fontWeight: theme.fontWeight.medium,
      color: theme.colors.textPrimary,
      textAlign: 'center',
      lineHeight: 28,
      paddingHorizontal: theme.spacing.md,
    },
    dotsContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.border,
    },
    dotActive: {
      width: 24,
      backgroundColor: theme.colors.oceanBlue,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={SCREEN_WIDTH}
        snapToAlignment="center"
      >
        {FEATURES.map((feature, index) => {
          const IconComponent = feature.icon;
          return (
            <View key={index} style={styles.slide}>
              <View style={styles.iconContainer}>
                <IconComponent size={40} color={theme.colors.textWhite} />
              </View>
              <Text style={styles.text}>{feature.text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.dotsContainer}>
        {FEATURES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

