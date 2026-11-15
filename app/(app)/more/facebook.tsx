import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useFocusEffect } from "expo-router";
import axios from "axios";
import { fetchFacebookSyncStatus, fetchIntegrationSettings, updateIntegrationSettings } from "@/api/integrations";
import { ButtonRow, Card, LabeledInput, SettingsPage, StatusPill, uiStyles } from "@/components/settingsUi";

export default function FacebookIdScreen() {
  const [connected, setConnected] = useState(false);
  const [pageId, setPageId] = useState("");
  const [pageName, setPageName] = useState("");
  const [adAccount, setAdAccount] = useState("");
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [settings, sync] = await Promise.all([fetchIntegrationSettings(), fetchFacebookSyncStatus()]);
    const isConnected = !!sync.configured;
    setConnected(isConnected);
    setPageId(settings.meta_page_id || "");
    setPageName(settings.meta_page_name || "");
    setAdAccount(settings.meta_ad_account_id || "");
    setLastSynced(sync.last_synced_at);
    return isConnected;
  }, []);
  useFocusEffect(useCallback(() => { load().catch(() => {}); }, [load]));

  async function check() {
    setBusy(true);
    try {
      const isConnected = await load();
      Alert.alert("Connection", isConnected ? "Your Facebook page is connected." : "Facebook isn't fully connected yet. The page also needs to be connected with Facebook login on the CurveLead website.");
    } catch { Alert.alert("Couldn't check", "Please try again."); }
    finally { setBusy(false); }
  }

  // Saves the two IDs the backend stores in the workspace's integration settings (PUT /integrations/settings).
  async function save() {
    const page = pageId.trim(), account = adAccount.trim();
    if (page && !/^\d+$/.test(page)) { Alert.alert("Check the page ID", "A Facebook page ID is numbers only."); return; }
    setBusy(true);
    try {
      await updateIntegrationSettings({ meta_page_id: page, meta_ad_account_id: account });
      await load();
      Alert.alert("Saved", "Facebook details updated.");
    } catch (e) {
      Alert.alert("Couldn't save", axios.isAxiosError(e) && typeof e.response?.data?.error === "string" ? e.response.data.error : "Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <SettingsPage title="Facebook ID">
      <Card>
        <View style={styles.head}>
          <Text style={uiStyles.cardTitle}>Connection</Text>
          <StatusPill label={connected ? "Connected" : "Not connected"} tone={connected ? "good" : "warn"} />
        </View>
        <Text style={uiStyles.hint}>New leads from your Facebook and Instagram ads arrive here.</Text>
        <LabeledInput label="Facebook page ID" value={pageId} onChangeText={setPageId} keyboardType="number-pad" placeholder="Page ID" />
        {pageName ? <Text style={uiStyles.hint}>Page: {pageName}</Text> : null}
        <LabeledInput label="Ad account ID" value={adAccount} onChangeText={setAdAccount} autoCapitalize="none" placeholder="act_1234567890" />
        {lastSynced ? <Text style={uiStyles.hint}>Last synced {new Date(lastSynced).toLocaleString()}</Text> : null}
      </Card>
      <ButtonRow secondaryLabel="Check connection" onSecondary={check} primaryLabel="Save" onPrimary={save} busy={busy} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
