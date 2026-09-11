import React, { useCallback, useState } from "react";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Platform, StatusBar as NativeStatusBar, View } from "react-native";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import * as NativeSplashScreen from "expo-splash-screen";
import { CurveLeadSplash } from "@/components/CurveLeadSplash";
import { colors } from "@/theme";
import { paperTheme } from "@/theme/paperTheme";

const navigationTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background, text: colors.text, primary: colors.primary, border: colors.borderSoft } };
void NativeSplashScreen.preventAutoHideAsync().catch(() => {});
NativeSplashScreen.setOptions({ fade: false });

function StatusBarBackground({ backgroundColor }: { backgroundColor: string }) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor }} />;
}

function StartupSplash({ onComplete }: { onComplete: () => void }) {
  const { isLoading } = useAuth();
  return <CurveLeadSplash ready={!isLoading} onComplete={onComplete} />;
}

export default function RootLayout() {
  const [splashComplete, setSplashComplete] = useState(false);
  const finishSplash = useCallback(() => setSplashComplete(true), []);
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, DMSans_700Bold });
  const backgroundColor = splashComplete ? colors.background : "#ffffff";
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor }} />;
  return (
    <ThemeProvider value={navigationTheme}><View style={{ flex: 1, backgroundColor }}><PaperProvider theme={paperTheme} settings={{ icon: (props) => <MaterialCommunityIcons name={props.name as never} color={props.color} size={props.size} /> }}>
      <AuthProvider>
        <StatusBar style="dark" hidden={false} />
        {Platform.OS === "android" && Number(Platform.Version) < 35 && <NativeStatusBar barStyle="dark-content" backgroundColor={backgroundColor} translucent hidden={false} />}
        {splashComplete ? <Stack screenOptions={{ headerShown: false, statusBarStyle: "dark", statusBarHidden: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack> : <StartupSplash onComplete={finishSplash} />}
      </AuthProvider>
    </PaperProvider><StatusBarBackground backgroundColor={backgroundColor} /></View></ThemeProvider>
  );
}
