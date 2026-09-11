import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo, Animated, Easing, Image, StyleSheet, View, useWindowDimensions,
} from "react-native";
import * as NativeSplashScreen from "expo-splash-screen";
const LOGO = require("../../assets/curvelead-splash-logo.png");
export const SPLASH_TIMING = { wave: 1800, hold: 800, exit: 650, textFade: 600, wordmarkDelay: 900, taglineDelay: 1050 } as const;
const ease = Easing.bezier(0.25, 0.1, 0.25, 1);

type Props = { ready: boolean; onComplete: () => void };
export function CurveLeadSplash({ ready, onComplete }: Props) {
  const { width, height } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.1, (width - 32) / 260), Math.max(0.1, (height - 32) / 298));
  const logoSize = 200 * scale;
  const [layoutReady, setLayoutReady] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const [entryComplete, setEntryComplete] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const wordmark = useRef(new Animated.Value(0)).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const exitPosition = useRef(new Animated.Value(0)).current;
  const exitOpacity = useRef(new Animated.Value(1)).current;
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      value => { if (mounted) setReduceMotion(value); },
      () => { if (mounted) setReduceMotion(false); },
    );
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!layoutReady || !imageReady || reduceMotion === null) return;
    let cancelled = false;
    const entry = Animated.sequence([
      Animated.parallel([
        Animated.timing(reveal, { toValue: 1, duration: SPLASH_TIMING.wave, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
        Animated.timing(wordmark, { toValue: 1, delay: SPLASH_TIMING.wordmarkDelay, duration: SPLASH_TIMING.textFade, easing: ease, useNativeDriver: true }),
        Animated.timing(tagline, { toValue: 1, delay: SPLASH_TIMING.taglineDelay, duration: SPLASH_TIMING.textFade, easing: ease, useNativeDriver: true }),
      ]),
      Animated.delay(SPLASH_TIMING.hold),
    ]);
    void (async () => {
      try { await NativeSplashScreen.hideAsync(); } catch { }
      if (cancelled) return;
      entry.start(({ finished }) => { if (finished && !cancelled) setEntryComplete(true); });
    })();
    return () => { cancelled = true; entry.stop(); };
  }, [layoutReady, imageReady, reduceMotion, reveal, wordmark, tagline]);

  useEffect(() => {
    if (!entryComplete || !ready) return;
    let cancelled = false;
    const exit = Animated.parallel([
      Animated.timing(exitPosition, { toValue: 1, duration: SPLASH_TIMING.exit, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: true }),
      Animated.timing(exitOpacity, { toValue: 0, duration: SPLASH_TIMING.exit / 2, easing: ease, useNativeDriver: true }),
    ]);
    exit.start(({ finished }) => { if (finished && !cancelled) completeRef.current(); });
    return () => { cancelled = true; exit.stop(); };
  }, [entryComplete, ready, exitPosition, exitOpacity]);

  const textMotion = (progress: Animated.Value) => ({
    opacity: progress,
    transform: [{ translateY: reduceMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [8 * scale, 0] }) }],
  });

  return (
    <View style={styles.screen} onLayout={() => setLayoutReady(true)} testID="curvelead-splash" accessible accessibilityLabel="CURVELEAD. Create Your Leads">
      <Animated.View style={{ alignItems: "center", opacity: exitOpacity, transform: [{ translateX: reduceMotion ? 0 : exitPosition.interpolate({ inputRange: [0, 1], outputRange: [0, width * 1.1] }) }] }}>
        <View style={{ width: logoSize, height: logoSize }}>
          <Image source={LOGO} resizeMode="contain" fadeDuration={0} accessible={false} style={{ width: logoSize, height: logoSize, opacity: 0.15 }} />
          <Animated.View collapsable={false} style={[styles.revealClip, {
            width: logoSize, height: logoSize,
            opacity: reduceMotion ? reveal : 1,
            transform: [{ translateX: reduceMotion ? 0 : reveal.interpolate({ inputRange: [0, 1], outputRange: [-logoSize, 0] }) }],
          }]}>
            <Animated.Image source={LOGO} resizeMode="contain" fadeDuration={0} accessible={false}
              onLoad={() => setImageReady(true)} onError={() => setImageReady(true)}
              style={{ width: logoSize, height: logoSize, transform: [{ translateX: reduceMotion ? 0 : reveal.interpolate({ inputRange: [0, 1], outputRange: [logoSize, 0] }) }] }} />
          </Animated.View>
        </View>
        <Animated.Text allowFontScaling={false} style={[styles.wordmark, {
          fontSize: 28 * scale, lineHeight: 42 * scale, letterSpacing: 5.04 * scale, marginTop: 24 * scale,
        }, textMotion(wordmark)]}>CURVELEAD</Animated.Text>
        <Animated.Text allowFontScaling={false} style={[styles.tagline, {
          fontSize: 13 * scale, lineHeight: 19.5 * scale, letterSpacing: 1.04 * scale, marginTop: 12 * scale,
        }, textMotion(tagline)]}>Create Your Leads</Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  revealClip: { position: "absolute", left: 0, top: 0, overflow: "hidden" },
  wordmark: { fontFamily: "Inter_800ExtraBold", color: "#0B1F4B", includeFontPadding: false, textAlign: "center" },
  tagline: { fontFamily: "Inter_400Regular", color: "#94a3b8", includeFontPadding: false, textAlign: "center" },
});
