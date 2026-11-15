import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { fetchGmbConnection, fetchGmbLocations, gmbAddressText, GmbLocation } from "@/api/gmb";
import { colors } from "@/theme";
import { SettingsPage, StatusPill, uiStyles } from "@/components/settingsUi";

// The locations come from the connected Google Business Profile (read-only, same source as the website).
export default function LocationsScreen() {
  const [locations, setLocations] = useState<GmbLocation[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const status = await fetchGmbConnection();
      setConnected(status.connected);
      setLocations(status.connected ? await fetchGmbLocations() : []);
    } catch (e) {
      // A rejected Google token is not a CurveLead sign-out: ask them to reconnect Google instead.
      setError(axios.isAxiosError(e) && e.response?.status === 401 ? "Google needs to be reconnected." : "Couldn't load your locations. Please try again.");
    }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SettingsPage title="Locations">
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Pressable onPress={load}><Text style={styles.error}>{error} Tap to retry.</Text></Pressable> : null}
      {!loading && !error && !connected ? <Text style={uiStyles.hint}>Connect your Google Business Profile to see your locations here.</Text> : null}
      {!loading && !error && connected && !locations.length ? <Text style={uiStyles.hint}>No business locations found for this Google account.</Text> : null}

      {locations.length ? (
        <View style={styles.list}>
          {locations.map((loc, index) => (
            <View key={loc.id} style={[styles.row, index > 0 && styles.divider]}>
              <View style={styles.icon}><Ionicons name="location-outline" size={16} color="#0369a1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{loc.name}</Text>
                {gmbAddressText(loc) ? <Text style={styles.address}>{gmbAddressText(loc)}</Text> : null}
              </View>
              {index === 0 ? <StatusPill label="Default" tone="good" /> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Pressable onPress={() => router.push("/(app)/more/gmb")} accessibilityRole="button" style={styles.addBtn}>
        <Text style={styles.addText}>{connected ? "Manage in Google Business" : "+ Connect Google Business"}</Text>
      </Pressable>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  icon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  name: { color: colors.text, fontSize: 12, fontWeight: "800" },
  address: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  addBtn: { height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  addText: { color: "#0369a1", fontSize: 13, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 12, textAlign: "center" },
});
