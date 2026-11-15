import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { fetchGmbConnection, fetchGmbLocations, refreshGmb } from "@/api/gmb";
import { fetchGoogleAdsIntegrations } from "@/api/integrations";
import { colors } from "@/theme";
import { ButtonRow, Card, SettingsPage, StatusPill, uiStyles } from "@/components/settingsUi";

function ReadOnlyField({ label, value, empty }: { label: string; value: string; empty: string }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.field}><Text style={[styles.value, !value && { color: colors.textMuted }]}>{value || empty}</Text></View>
    </View>
  );
}

export default function GoogleIdScreen() {
  const [adsName, setAdsName] = useState("");
  const [adsActive, setAdsActive] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [profileConnected, setProfileConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [integrations, gmb] = await Promise.all([fetchGoogleAdsIntegrations(), fetchGmbConnection()]);
    const active = integrations.find((item) => item.is_active);
    setAdsActive(!!active);
    setAdsName(active?.name || integrations[0]?.name || "");
    setProfileConnected(gmb.connected);
    let locationId = "";
    if (gmb.connected) locationId = (await fetchGmbLocations().catch(() => []))[0]?.id || "";
    setProfileId(locationId);
    return !!active || gmb.connected;
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  async function check() {
    setBusy(true);
    try {
      if (profileConnected) await refreshGmb().catch(() => {});
      const ok = await load();
      Alert.alert("Connection", ok ? "Google is connected." : "Google isn't connected yet.");
    } catch { Alert.alert("Couldn't check", "Please try again."); }
    finally { setBusy(false); }
  }

  const verified = adsActive || profileConnected;
  return (
    <SettingsPage title="Google ID">
      <Card>
        <View style={styles.head}>
          <Text style={uiStyles.cardTitle}>Connection</Text>
          <StatusPill label={verified ? "Verified" : "Not verified"} tone={verified ? "good" : "warn"} />
        </View>
        <Text style={uiStyles.hint}>Your Google lead forms and business listing.</Text>
        <ReadOnlyField label="Google Ads lead form" value={adsName} empty={adsActive ? "Connected" : "Not set"} />
        <ReadOnlyField label="Google Business Profile ID" value={profileId} empty={profileConnected ? "Connected" : "Not set"} />
      </Card>
      <ButtonRow secondaryLabel="Check connection" onSecondary={check} primaryLabel="Manage" onPrimary={() => router.push("/(app)/more/gmb")} busy={busy} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  field: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 12, justifyContent: "center" },
  value: { color: colors.text, fontSize: 13 },
});
