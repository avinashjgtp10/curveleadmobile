import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { fetchLeads } from "@/api/leads";
import { Lead } from "@/types";

const STATUS_COLOR: Record<Lead["status"], string> = {
  new: "#60A5FA",
  contacted: "#FBBF24",
  qualified: "#34D399",
  proposal: "#A78BFA",
  won: "#4ADE80",
  lost: "#F87171",
};

export default function LeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchLeads();
      setLeads(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingTop: 60 }}
      data={leads}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      ListHeaderComponent={<Text style={styles.title}>Leads</Text>}
      ListEmptyComponent={<Text style={styles.hint}>No leads yet.</Text>}
      renderItem={({ item }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/(tabs)/leads/${item.id}`)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.phone}>{item.phone}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: STATUS_COLOR[item.status] }]}>
            <Text style={styles.pillText}>{item.status}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" },
  title: { fontSize: 26, fontWeight: "700", color: "#fff", marginBottom: 16 },
  hint: { color: "#94A3B8" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  name: { color: "#fff", fontSize: 16, fontWeight: "600" },
  phone: { color: "#94A3B8", marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText: { color: "#0F172A", fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
});
