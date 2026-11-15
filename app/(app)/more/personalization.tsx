import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import { useT } from "@/i18n/LanguageContext";
import { colors } from "@/theme";

const THEMES = [{ key: "light", label: "Light" }, { key: "dark", label: "Dark" }, { key: "system", label: "System" }];
const TEXT_SIZES = [{ key: "small", label: "Small" }, { key: "medium", label: "Medium" }, { key: "large", label: "Large" }];
const LANGUAGES = [{ key: "en", label: "English" }, { key: "hi", label: "हिन्दी (Hindi)" }];
const START_SCREENS = [{ key: "dashboard", label: "Dashboard" }, { key: "leads", label: "Leads" }, { key: "tasks", label: "Tasks" }];

type Option = { key: string; label: string };

function Segmented({ options, value, onChange }: { options: Option[]; value: string; onChange: (key: string) => void }) {
  return (
    <View style={styles.segmentRow}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable key={option.key} onPress={() => onChange(option.key)} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Select({ options, value, onChange }: { options: Option[]; value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.key === value) ?? options[0];
  return (
    <View>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" style={styles.select}>
        <Text style={styles.selectText}>{current.label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.text} />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable key={option.key} onPress={() => { onChange(option.key); setOpen(false); }} style={styles.optionRow}>
              <Text style={[styles.selectText, option.key === value && styles.optionActive]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function PersonalizationScreen() {
  const insets = useSafeAreaInsets();
  const { language, setLanguage } = useT();
  const [theme, setTheme] = useState("system");
  const [textSize, setTextSize] = useState("medium");
  const [lang, setLang] = useState(language);
  const [startScreen, setStartScreen] = useState("dashboard");
  const [compact, setCompact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetchPreferences().then((prefs) => {
      if (typeof prefs.theme === "string") setTheme(prefs.theme);
      if (typeof prefs.text_size === "string") setTextSize(prefs.text_size);
      if (typeof prefs.start_screen === "string") setStartScreen(prefs.start_screen);
      if (typeof prefs.compact_lists === "boolean") setCompact(prefs.compact_lists);
      if (typeof prefs.language === "string") setLang(prefs.language);
    }).catch(() => setLoadFailed(true)).finally(() => setLoading(false));
  }, []);

  async function save() {
    if (loading) return; // saving before the stored choices arrive would overwrite them with the defaults
    if (loadFailed) { setMessage("Your saved choices didn't load, so saving now would replace them. Go back and reopen this screen."); return; }
    setSaving(true); setMessage("");
    setLanguage(lang); // takes effect on this phone straight away
    try {
      await updatePreferences({ theme, text_size: textSize, start_screen: startScreen, compact_lists: compact, language: lang });
      setMessage("Saved.");
    } catch {
      setMessage("Couldn't save to your account. Language is still set on this phone.");
    } finally { setSaving(false); }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Personalization" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]} showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} /> : null}
        <View style={styles.card}>
          <Text style={styles.label}>Theme</Text>
          <Segmented options={THEMES} value={theme} onChange={setTheme} />

          <Text style={styles.label}>Text size</Text>
          <Segmented options={TEXT_SIZES} value={textSize} onChange={setTextSize} />

          <Text style={styles.label}>Language</Text>
          <Select options={LANGUAGES} value={lang} onChange={setLang} />

          <Text style={styles.label}>Open the app on</Text>
          <Select options={START_SCREENS} value={startScreen} onChange={setStartScreen} />

          <View style={styles.switchRow}>
            <Text style={styles.label}>Compact lists</Text>
            <Switch value={compact} onValueChange={setCompact} trackColor={{ true: colors.primary, false: "#8a9ab0" }} thumbColor="#fff" />
          </View>
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable onPress={save} disabled={saving} accessibilityRole="button" style={[styles.saveButton, saving && { opacity: 0.7 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f1f5fb" },
  header: { backgroundColor: "#f1f5fb" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.borderSoft, padding: 14 },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 8 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segment: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  segmentText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: colors.primaryPressed, fontWeight: "700" },
  select: { height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: colors.text, fontSize: 13 },
  options: { marginTop: 4, borderRadius: 10, borderWidth: 1, borderColor: colors.borderSoft, overflow: "hidden" },
  optionRow: { paddingHorizontal: 12, height: 40, justifyContent: "center" },
  optionActive: { color: colors.primaryPressed, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  message: { color: colors.textSecondary, fontSize: 12, textAlign: "center" },
  saveButton: { height: 50, borderRadius: 25, backgroundColor: "#0369a1", alignItems: "center", justifyContent: "center" },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
