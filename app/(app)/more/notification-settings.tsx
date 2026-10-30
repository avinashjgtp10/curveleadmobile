import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { FALLBACK_NOTIFICATION_GROUPS, NotificationGroup, fetchNotificationGroups } from "@/api/notifications";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import { NotificationPermission, getNotificationPermission, requestNotificationPermission } from "@/notifications/push";

const PHONE_STATUS: Record<NotificationPermission, { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; tone: string; bg: string }> = {
  granted: { icon: "notifications", title: "Phone notifications are on", hint: "Alerts will pop up on this phone.", tone: colors.success, bg: colors.successSoft },
  denied: { icon: "notifications-off", title: "Phone notifications are off", hint: "Turn them on in your phone settings to get alerts here.", tone: colors.danger, bg: colors.dangerSoft },
  undetermined: { icon: "notifications-outline", title: "Phone notifications not set up", hint: "Allow notifications to get alerts on this phone.", tone: colors.primary, bg: colors.primarySoft },
  unsupported: { icon: "phone-portrait-outline", title: "Phone alerts unavailable here", hint: "They need the installed CurveLead app on a real phone, not Expo Go or the web.", tone: colors.textMuted, bg: "#f1f5f9" },
};

export default function NotificationSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [groups, setGroups] = useState<NotificationGroup[]>(FALLBACK_NOTIFICATION_GROUPS);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  // When the saved settings couldn't be loaded, saving would overwrite them with only what was toggled here.
  const [loadFailed, setLoadFailed] = useState(false);

  const refreshPermission = useCallback(async () => setPermission(await getNotificationPermission()), []);

  useEffect(() => {
    refreshPermission();
    // Coming back from the phone's settings app: pick up whatever the person changed there.
    const sub = AppState.addEventListener("change", (state) => { if (state === "active") refreshPermission(); });
    return () => sub.remove();
  }, [refreshPermission]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedGroups, preferences] = await Promise.all([
        fetchNotificationGroups().catch(() => FALLBACK_NOTIFICATION_GROUPS),
        fetchPreferences(),
      ]);
      setGroups(loadedGroups);
      const stored = preferences?.notification_prefs || {};
      setPrefs(stored);
      setSaved(stored);
      setLoadFailed(false);
    } catch {
      // The switches still show (everything on) but saving is blocked until the real settings load.
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const isOn = (key: string) => prefs[key] !== false;
  const toggle = (key: string) => setPrefs((current) => ({ ...current, [key]: current[key] === false }));
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  async function save() {
    setSaving(true);
    try {
      await updatePreferences({ notification_prefs: prefs });
      setSaved(prefs);
      Alert.alert("Saved", "Your notification settings were updated.");
    } catch {
      Alert.alert("Couldn't save", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function turnOnPhone() {
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result);
      // The OS won't show its prompt again once declined, so send them to the settings app instead.
      if (result === "denied") await Linking.openSettings();
    } finally {
      setBusy(false);
    }
  }

  const phone = PHONE_STATUS[permission || "unsupported"];

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <View style={styles.titleRow}>
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
          <Text style={styles.headerTitle}>Notification Settings</Text>
        </View>
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]} showsVerticalScrollIndicator={false}>
        {permission !== null ? (
          <View style={[styles.phoneCard, { backgroundColor: phone.bg }]}>
            <View style={styles.phoneIcon}><Ionicons name={phone.icon} size={20} color={phone.tone} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.phoneTitle, { color: phone.tone }]}>{phone.title}</Text>
              <Text style={styles.phoneHint}>{phone.hint}</Text>
              {permission === "undetermined" ? (
                <Pressable onPress={turnOnPhone} disabled={busy} hitSlop={6}>
                  <Text style={styles.phoneAction}>{busy ? "Please wait..." : "Allow notifications"}</Text>
                </Pressable>
              ) : null}
              {permission === "denied" || permission === "granted" ? (
                <Pressable onPress={() => Linking.openSettings()} hitSlop={6}>
                  <Text style={styles.phoneAction}>{permission === "denied" ? "Open phone settings" : "Sound & vibration in phone settings"}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>NOTIFY ME ABOUT</Text>

        {loadFailed && !loading ? (
          <Pressable onPress={loadSettings} style={styles.loadError}>
            <Text style={styles.loadErrorText}>Couldn't load your saved settings. Tap to retry. You can't save until they load.</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <View style={styles.list}>
            {groups.map((group, index) => (
              <View key={group.key} style={[styles.item, index < groups.length - 1 && styles.itemDivider]}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{group.label}</Text>
                    <Text style={styles.rowDesc}>{group.description}</Text>
                  </View>
                  <Switch value={isOn(group.key)} onValueChange={() => toggle(group.key)} trackColor={{ true: "#22c55e", false: "#cbd5e1" }} thumbColor="#ffffff" />
                </View>
                {group.key === "followups" && isOn("followups") ? (
                  <View style={[styles.row, styles.subRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subTitle}>Skip lost leads</Text>
                      <Text style={styles.subDesc}>Don't remind me about follow-ups for leads already marked Lost.</Text>
                    </View>
                    <Switch value={isOn("skip_lost_lead_followups")} onValueChange={() => toggle("skip_lost_lead_followups")} trackColor={{ true: "#22c55e", false: "#cbd5e1" }} thumbColor="#ffffff" />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="notifications-off-outline" size={13} color={colors.textMuted} />
          <Text style={styles.noteText}>Turning something off only affects your own account. It won't stop your teammates' notifications.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.cancelButton} onPress={() => (dirty ? setPrefs(saved) : router.back())}>
          <Text style={styles.cancelText}>{dirty ? "Reset" : "Cancel"}</Text>
        </Pressable>
        <Pressable style={[styles.saveButton, (!dirty || saving || loading || loadFailed) && styles.saveDisabled]} onPress={save} disabled={!dirty || saving || loading || loadFailed}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadError: { backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 10 },
  loadErrorText: { color: colors.danger, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  content: { padding: 12, gap: 10 },
  loading: { paddingVertical: 40, alignItems: "center" },
  phoneCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, padding: 12 },
  phoneIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  phoneTitle: { fontSize: 14, fontWeight: "800" },
  phoneHint: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 2 },
  phoneAction: { color: colors.primary, fontSize: 12, fontWeight: "800", marginTop: 6 },
  sectionTitle: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginTop: 4 },
  list: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", paddingHorizontal: 14 },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  item: { paddingVertical: 4 },
  itemDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowDesc: { color: colors.textSecondary, fontSize: 12, lineHeight: 16, marginTop: 2 },
  subRow: { paddingLeft: 14, paddingTop: 0 },
  subTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  subDesc: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 2, marginTop: 4 },
  noteText: { flex: 1, color: colors.textMuted, fontSize: 11, lineHeight: 15 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingTop: 12, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e2eef7" },
  cancelButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", paddingVertical: 13, alignItems: "center", backgroundColor: "#ffffff" },
  cancelText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  saveButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
