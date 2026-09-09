import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { Platform, StatusBar as NativeStatusBar, View } from "react-native";
import { DefaultTheme, ThemeProvider } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { AuthProvider } from "@/contexts/AuthContext";
import { colors } from "@/theme";
import { paperTheme } from "@/theme/paperTheme";

const navigationTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background, card: colors.background, text: colors.text, primary: colors.primary, border: colors.borderSoft } };

function StatusBarBackground() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.background }} />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, DMSans_700Bold });
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider value={navigationTheme}><View style={{ flex: 1, backgroundColor: colors.background }}><PaperProvider theme={paperTheme} settings={{ icon: (props) => <MaterialCommunityIcons name={props.name as never} color={props.color} size={props.size} /> }}>
      <AuthProvider>
        <StatusBar style="dark" hidden={false} />
        {Platform.OS === "android" && Number(Platform.Version) < 35 && <NativeStatusBar barStyle="dark-content" backgroundColor={colors.background} translucent hidden={false} />}
        <Stack screenOptions={{ headerShown: false, statusBarStyle: "dark", statusBarHidden: false, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </PaperProvider><StatusBarBackground /></View></ThemeProvider>
  );
}
