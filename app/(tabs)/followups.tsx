import React from "react";
import { View, Text, StyleSheet } from "react-native";

// TODO: wire to GET /leads/:id/followups aggregated across leads,
// e.g. a backend endpoint like GET /followups?dueBefore=today
export default function FollowupsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Follow-ups</Text>
      <Text style={styles.hint}>
        Wire this to an aggregated /followups endpoint (due today, overdue, upcoming) once the
        backend exposes it — the per-lead followups API already exists.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: "#0F172A" },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 8 },
  hint: { color: "#94A3B8", lineHeight: 20 },
});
