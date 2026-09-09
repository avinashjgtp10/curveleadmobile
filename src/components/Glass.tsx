import React, { useId } from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, LinearGradient as SvgGradient, Stop, Rect, Circle, Text as SvgText } from "react-native-svg";

export const gradients = {
  sky: ["#38bdf8", "#3b82f6"], violet: ["#a78bfa", "#a855f7"],
  emerald: ["#34d399", "#14b8a6"], amber: ["#fbbf24", "#f97316"],
  pink: ["#e879f9", "#ec4899"], indigo: ["#818cf8", "#3b82f6"], orange: ["#fb923c", "#f59e0b"],
  teal: ["#2dd4bf", "#0ea5e9"], slate: ["#94a3b8", "#64748b"],
} as const;
export type GradientName = keyof typeof gradients;

export function GradientNumber({ value, tone = "sky" }: { value: string; tone?: GradientName }) {
  const id = `number-${useId().replace(/:/g, "")}`;
  return <View accessible accessibilityLabel={value} style={{ height: 36, marginTop: 4 }}><Svg width="100%" height={36} accessible={false}>
    <Defs><SvgGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={gradients[tone][0]} /><Stop offset="1" stopColor={gradients[tone][1]} /></SvgGradient></Defs>
    <SvgText x={0} y={29} fontSize={Math.max(18, Math.min(30, 210 / Math.max(1, value.length)))} fontFamily="Inter_700Bold" fill={`url(#${id})`}>{value}</SvgText>
  </Svg></View>;
}

export function GlassBackground({ login = false }: { login?: boolean }) {
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <LinearGradient colors={login ? ["#e0f2fe", "#bae6fd", "#f0f9ff"] : ["#f0f9ff", "#e0f2fe", "#f8faff"]} locations={[0, login ? 0.4 : 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 0.34, y: 1 }} style={StyleSheet.absoluteFill} />
    {!login && <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}><Defs>
      <RadialGradient id="sky"><Stop offset="0" stopColor="#38bdf8" stopOpacity="0.3"/><Stop offset="1" stopColor="#38bdf8" stopOpacity="0"/></RadialGradient>
      <RadialGradient id="violet"><Stop offset="0" stopColor="#818cf8" stopOpacity="0.2"/><Stop offset="1" stopColor="#818cf8" stopOpacity="0"/></RadialGradient>
    </Defs><Rect x="55%" y="-80" width="288" height="288" fill="url(#sky)"/><Rect x="-64" y="40%" width="224" height="224" fill="url(#violet)"/></Svg>}
  </View>;
}

export function GradientIcon({ children, tone = "sky", size = 40, style }: ViewProps & { tone?: GradientName; size?: number }) {
  return <LinearGradient colors={gradients[tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ width: size, height: size, borderRadius: size === 56 ? 16 : 12, alignItems: "center", justifyContent: "center", boxShadow: "0 4px 6px rgba(15,23,42,0.10)" }, style]}>{children}</LinearGradient>;
}

export function CurveLeadLogo() {
  return <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 64, height: 64, borderRadius: 16, alignItems: "center", justifyContent: "center" }}>
    <Svg width={32} height={32} viewBox="0 0 40 40">{Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 - row }, (_, col) => <Circle key={`${row}-${col}`} cx={8 + col * 7 + row * 3.5} cy={8 + row * 7} r={2.2} fill="white" opacity={0.85 - row * 0.1}/>))}</Svg>
  </LinearGradient>;
}

export const glass = {
  backgroundColor: "rgba(255,255,255,0.70)", borderWidth: 1,
  borderColor: "rgba(255,255,255,0.60)", borderRadius: 16,
  boxShadow: "0 10px 15px -3px rgba(186,230,253,0.25), 0 4px 6px -4px rgba(186,230,253,0.25)",
} as const;
