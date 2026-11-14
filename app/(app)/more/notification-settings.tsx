import React, { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { FALLBACK_NOTIFICATION_GROUPS, NotificationGroup, fetchNotificationGroups } from "@/api/notifications";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { NOTIFICATION_PREFS_CACHE_KEY, NotificationPermission, getNotificationPermission, requestNotificationPermission } from "@/notifications/push";

// Same palette as Reports: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };

const PHONE_STATUS: Record<NotificationPermission, { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; tone: string; bg: string }> = {
  granted: { icon: "notifications", title: "Phone notifications are on", hint: "Alerts will pop up on this phone.", tone: colors.success, bg: colors.successSoft },
  denied: { icon: "notifications-off", title: "Phone notifications are off", hint: "Turn them on in your phone settings to get alerts here.", tone: colors.danger, bg: colors.dangerSoft },
  undetermined: { icon: "notifications-outline", title: "Phone notifications not set up", hint: "Allow notifications to get alerts on this phone.", tone: UI.teal, bg: UI.tealSoft },
  unsupported: { icon: "phone-portrait-outline", title: "Phone alerts unavailable here", hint: "They need the installed CurveLead app on a real phone, not Expo Go or the web.", tone: colors.textMuted, bg: "#f1f5f9" },
};

// push.ts reads this copy to decide whether to show on-device alerts, so the switches must be mirrored here.
function cachePrefs(prefs: Record<string, boolean>) {
  AsyncStorage.setItem(NOTIFICATION_PREFS_CACHE_KEY, JSON.stringify(prefs)).catch(() => {});
}

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
      cachePrefs(stored);
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
      cachePrefs(prefs);
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
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Notification Settings</Text>
      </View>

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
          <View style={styles.loading}><ActivityIndicator color={UI.teal} /></View>
        ) : (
          <View style={styles.list}>
            {groups.map((group) => (
              <View key={group.key} style={styles.item}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{group.label}</Text>
                    <Text style={styles.rowDesc}>{group.description}</Text>
                  </View>
                  <Switch value={isOn(group.key)} onValueChange={() => toggle(group.key)} trackColor={{ true: UI.teal, false: "#cbd5e1" }} thumbColor="#ffffff" />
                </View>
                {group.key === "followups" && isOn("followups") ? (
                  <View style={[styles.row, styles.subRow]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subTitle}>Skip lost leads</Text>
                      <Text style={styles.subDesc}>Don't remind me about follow-ups for leads already marked Lost.</Text>
                    </View>
                    <Switch value={isOn("skip_lost_lead_followups")} onValueChange={() => toggle("skip_lost_lead_followups")} trackColor={{ true: UI.teal, false: "#cbd5e1" }} thumbColor="#ffffff" />
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
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 18, fontFamily: "DMSans_700Bold" },
  content: { padding: 16, gap: 12 },
  loading: { paddingVertical: 40, alignItems: "center" },
  phoneCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, borderColor: UI.line, padding: 14 },
  phoneIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  phoneTitle: { fontSize: 14, fontWeight: "800" },
  phoneHint: { color: UI.sub, fontSize: 12, lineHeight: 17, marginTop: 2 },
  phoneAction: { color: UI.teal, fontSize: 12, fontWeight: "800", marginTop: 6 },
  sectionTitle: { color: UI.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginTop: 4 },
  list: { gap: 10 },
  item: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingHorizontal: 14, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rowTitle: { color: UI.ink, fontSize: 14, fontWeight: "700" },
  rowDesc: { color: UI.sub, fontSize: 12, lineHeight: 16, marginTop: 2 },
  subRow: { paddingLeft: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: UI.tealSoft },
  subTitle: { color: UI.ink, fontSize: 12, fontWeight: "700" },
  subDesc: { color: UI.muted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 2, marginTop: 4 },
  noteText: { flex: 1, color: UI.muted, fontSize: 11, lineHeight: 15 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: UI.bg, borderTopWidth: 1, borderTopColor: UI.line },
  cancelButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: UI.line, paddingVertical: 13, alignItems: "center", backgroundColor: "#ffffff" },
  cancelText: { color: UI.ink, fontSize: 14, fontWeight: "700" },
  saveButton: { flex: 1, backgroundColor: UI.teal, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
