import React, { useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { ArrowsOut, Minus, Plus } from "phosphor-react-native";
import AppText from "@/components/ui/AppText";
import TopNav from "@/components/ui/TopNav";
import { usePaletteColors } from "@/theme/usePaletteColors";

/** Independent pan/zoom keeps a chosen part of the sheet visible as games scroll. */
function PhotoCanvas({
  uri,
  height,
}: {
  readonly uri: string;
  readonly height: number;
}) {
  const palette = usePaletteColors();
  const scale = useSharedValue(1),
    initialScale = useSharedValue(1);
  const x = useSharedValue(0),
    y = useSharedValue(0);
  const startX = useSharedValue(0),
    startY = useSharedValue(0),
    width = useSharedValue(1);
  const imageRatio = useSharedValue(1);
  const focalX = useSharedValue(0),
    focalY = useSharedValue(0);
  const bounds = (zoomScale: number) => {
    "worklet";
    const drawnWidth = Math.min(width.value, height * imageRatio.value);
    const drawnHeight = Math.min(height, width.value / imageRatio.value);
    return {
      bx: Math.max(0, (drawnWidth * zoomScale - width.value) / 2),
      by: Math.max(0, (drawnHeight * zoomScale - height) / 2),
    };
  };
  const pinch = Gesture.Pinch()
    .onStart((event) => {
      initialScale.value = scale.value;
      focalX.value = (event.focalX - width.value / 2 - x.value) / scale.value;
      focalY.value = (event.focalY - height / 2 - y.value) / scale.value;
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(8, initialScale.value * event.scale));
      const { bx, by } = bounds(scale.value);
      x.value = Math.max(
        -bx,
        Math.min(
          bx,
          event.focalX - width.value / 2 - focalX.value * scale.value,
        ),
      );
      y.value = Math.max(
        -by,
        Math.min(by, event.focalY - height / 2 - focalY.value * scale.value),
      );
    });
  const pan = Gesture.Pan()
    .maxPointers(1)
    .onTouchesDown((_event, manager) => {
      if (scale.value <= 1) manager.fail();
    })
    .minDistance(4)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((event) => {
      const { bx, by } = bounds(scale.value);
      x.value = Math.max(-bx, Math.min(bx, startX.value + event.translationX));
      y.value = Math.max(-by, Math.min(by, startY.value + event.translationY));
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const zoom = (amount: number) => {
    const current = scale.value,
      next = Math.max(1, Math.min(8, current + amount));
    const { bx, by } = bounds(next);
    x.value = withTiming(
      Math.max(-bx, Math.min(bx, (x.value * next) / current)),
      { duration: 150 },
    );
    y.value = withTiming(
      Math.max(-by, Math.min(by, (y.value * next) / current)),
      { duration: 150 },
    );
    scale.value = withTiming(next, { duration: 150 });
  };
  return (
    <View>
      <View
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
          if (width.value > 0) {
            const { bx, by } = bounds(scale.value);
            x.value = Math.max(-bx, Math.min(bx, x.value));
            y.value = Math.max(-by, Math.min(by, y.value));
          }
        }}
        style={{ height }}
        className="overflow-hidden bg-elevated"
      >
        <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
          <View style={{ width: "100%", height }}>
            <Animated.View style={[{ width: "100%", height }, style]}>
              <Animated.Image
                source={{ uri }}
                onLoad={(event) => {
                  const { width: iw, height: ih } = event.nativeEvent.source;
                  if (iw > 0 && ih > 0) imageRatio.value = iw / ih;
                }}
                accessibilityLabel="Scoresheet photo"
                resizeMode="contain"
                style={[{ width: "100%", height: "100%" }, imageStyle]}
              />
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
      <View className="flex-row items-center justify-between px-3 bg-surface">
        <AppText className="text-caption text-muted flex-1">
          Zoom, then drag to compare.
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom out photo"
          onPress={() => zoom(-1)}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <Minus size={18} color={palette.brandTeal} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reset photo zoom"
          onPress={() => zoom(1 - scale.value)}
          className="min-h-touch px-2 justify-center"
        >
          <AppText className="text-caption text-brand-teal">Reset</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Zoom in photo"
          onPress={() => zoom(1)}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <Plus size={18} color={palette.brandTeal} />
        </Pressable>
      </View>
    </View>
  );
}

export default function ScoresheetPhoto({
  uri,
  docked = false,
  compact = false,
}: {
  readonly uri: string;
  readonly docked?: boolean;
  readonly compact?: boolean;
}) {
  const { height } = useWindowDimensions();
  const [hidden, setHidden] = useState(false);
  const palette = usePaletteColors();
  const [large, setLarge] = useState(false),
    [fullScreen, setFullScreen] = useState(false);
  const paneHeight = docked
    ? Math.min(large ? 300 : 180, height * (large ? 0.36 : 0.22))
    : 180;
  return (
    <View
      testID={docked ? "scoresheet-pinned-photo" : "scoresheet-photo"}
      className="bg-surface border-b border-divider"
    >
      <View className="flex-row items-center px-3">
        <AppText className="text-caption font-semibold text-muted flex-1">
          {docked ? "Original scoresheet" : "Selected photo"}
        </AppText>
        {docked && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hidden
                ? "Show pinned scoresheet photo"
                : "Hide pinned scoresheet photo"
            }
            onPress={() => setHidden(!hidden)}
            className="min-h-touch px-2 justify-center"
          >
            <AppText className="text-caption text-brand-teal">
              {hidden ? "Show" : "Hide"}
            </AppText>
          </Pressable>
        )}
        {docked && !hidden && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setLarge(!large)}
            className="min-h-touch px-3 justify-center"
          >
            <AppText className="text-caption text-brand-teal">
              {large ? "Smaller" : "Larger"}
            </AppText>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open full-screen scoresheet photo"
          onPress={() => setFullScreen(true)}
          className="min-h-touch min-w-touch items-center justify-center"
        >
          <ArrowsOut size={18} color={palette.brandTeal} />
        </Pressable>
      </View>
      <View style={{ display: compact || hidden ? "none" : "flex" }}>
        <PhotoCanvas uri={uri} height={paneHeight} />
      </View>
      <Modal
        visible={fullScreen}
        animationType="fade"
        onRequestClose={() => setFullScreen(false)}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView className="flex-1 bg-page">
            <TopNav
              title="Scoresheet photo"
              showBack
              onBack={() => setFullScreen(false)}
            />
            <PhotoCanvas uri={uri} height={Math.max(180, height - 210)} />
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}
