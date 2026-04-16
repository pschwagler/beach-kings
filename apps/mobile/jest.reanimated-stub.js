/**
 * Minimal stub for react-native-reanimated in Jest.
 *
 * The official mock.js requires src/mock.ts which chains back into the full
 * reanimated source and fails with "worklets" native globals that don't
 * exist in the Jest (Node.js) environment. This stub provides only the hooks
 * and utilities used by the app so tests can run without native binaries.
 */
const React = require('react');

function useSharedValue(init) {
  const ref = React.useRef(init);
  return ref;
}

function useAnimatedStyle(factory) {
  return factory();
}

const withTiming = (toValue, _config, _callback) => {
  // Do NOT invoke callback synchronously — doing so would trigger runOnJS(onDismiss)
  // immediately, dismissing toasts before tests can assert on them.
  return toValue;
};

// withDelay wraps an animation; return the inner animation value without executing callbacks.
const withDelay = (_delay, animation) => animation;

const runOnJS = (fn) => fn;

const Animated = {
  View: require('react-native').View,
  Text: require('react-native').Text,
  Image: require('react-native').Image,
  ScrollView: require('react-native').ScrollView,
  FlatList: require('react-native').FlatList,
};

module.exports = {
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  withSpring: (toValue) => toValue,
  withRepeat: (animation) => animation,
  withSequence: (...animations) => animations[animations.length - 1],
  cancelAnimation: () => {},
  Easing: {
    linear: (t) => t,
    ease: (t) => t,
    // Higher-order combinators — return identity easing so tests run without errors.
    in: () => (t) => t,
    out: () => (t) => t,
    inOut: () => (t) => t,
    cubic: (t) => t,
    bezier: () => (t) => t,
    back: () => (t) => t,
    bounce: (t) => t,
    circle: (t) => t,
    elastic: () => (t) => t,
    exp: (t) => t,
    poly: () => (t) => t,
    quad: (t) => t,
    sin: (t) => t,
    step0: (t) => (t > 0 ? 1 : 0),
    step1: (t) => (t >= 1 ? 1 : 0),
  },
  Extrapolation: { CLAMP: 'clamp' },
  interpolate: (_value, _inputRange, outputRange) => outputRange[0],
  useAnimatedScrollHandler: () => () => {},
  useAnimatedRef: () => React.createRef(),
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedReaction: () => {},
};
