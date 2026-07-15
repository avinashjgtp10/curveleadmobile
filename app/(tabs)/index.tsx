import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { router } from "expo-router";

export default function DashboardScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] ?? "there"}</Text>
      <Text style={styles.hint}>New leads, hot follow-ups, and CPL will show here.</Text>

      {/* Placeholder stat cards — wire up to a /dashboard/summary endpoint */}
      <View style={styles.cardRow}>
        <View style={styles.card}>
          <Text style={styles.cardValue}>--</Text>
          <Text style={styles.cardLabel}>New Leads Today</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardValue}>--</Text>
          <Text style={styles.cardLabel}>Due Follow-ups</Text>
        </View>
      </View>

      <Pressable
        style={styles.logout}
        onPress={async () => {
          await logout();
          router.replace("/(auth)/login");
        }}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: "#0F172A" },
  greeting: { fontSize: 26, fontWeight: "700", color: "#fff" },
  hint: { color: "#94A3B8", marginTop: 4, marginBottom: 24 },
  cardRow: { flexDirection: "row", gap: 12 },
  card: { flex: 1, backgroundColor: "#1E293B", borderRadius: 12, padding: 16 },
  cardValue: { fontSize: 28, fontWeight: "700", color: "#fff" },
  cardLabel: { color: "#94A3B8", marginTop: 4, fontSize: 13 },
  logout: { marginTop: "auto", paddingVertical: 14, alignItems: "center" },
  logoutText: { color: "#F87171", fontWeight: "600" },
});
