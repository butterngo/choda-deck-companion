// Animation primitives for v2 design tokens.
//
// useLivePulse — pulse halo (0.55 → 0 opacity loop, 2.4s). Mirrors the
// `.live-dot` keyframes in docs/handoff-design/project/css/style.css.
//
// useSpin — 360° rotation loop (1.2s linear). Mirrors the `.spin` keyframes
// used by ti-refresh / ti-progress in the handoff design.

import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export function useLivePulse(): Animated.Value {
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 1680, // 70% of 2.4s — matches CSS keyframe 70% step
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.55,
          duration: 720, // remaining 30% — settle back for next pulse
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return opacity;
}

export function useSpin(): Animated.AnimatedInterpolation<string> {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
}
