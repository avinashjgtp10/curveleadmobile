import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Pressable, PressableProps, StyleProp, ViewStyle } from "react-native";
import { glass } from "./Glass";

export function GlassPressable({ children, style, ...props }: Omit<PressableProps, "style" | "children"> & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) reduceMotion.current = value; });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", value => { reduceMotion.current = value; scale.setValue(1); });
    return () => { mounted = false; subscription.remove(); };
  }, [scale]);
  const animate = (value: number) => {
    if (reduceMotion.current) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };
  return <Animated.View style={{ transform: [{ scale }] }}><Pressable {...props} accessibilityRole="button" onPressIn={event => { void animate(0.98); props.onPressIn?.(event); }} onPressOut={event => { void animate(1); props.onPressOut?.(event); }} style={({ pressed }) => [glass, style, pressed && { backgroundColor: "rgba(255,255,255,0.9)" }]}>{children}</Pressable></Animated.View>;
}
