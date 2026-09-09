import { Redirect } from "expo-router";
import { View, Image, StyleSheet } from "react-native";
import { ActivityIndicator } from "react-native-paper";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

export default function SplashScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Image source={require("../assets/icon.png")} style={styles.logo} />
        <ActivityIndicator color={colors.primary} size="large" style={styles.spinner} />
      </View>
    );
  }

  return <Redirect href={user ? "/(app)" : "/(auth)/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  logo: { width: 96, height: 96, borderRadius: 20, marginBottom: 24 },
  spinner: { marginTop: 8 },
});
