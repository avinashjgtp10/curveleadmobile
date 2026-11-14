import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import { TRANSLATED_LANGUAGES, useT } from "@/i18n/LanguageContext";

// Pale lavender page, white cards with soft borders, indigo actions.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#eceefe" };

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  letter: string;
  color: string;
  bg: string;
  available: boolean;
}

const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", letter: "A", color: "#3a35b8", bg: "#e4e6fd", available: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", letter: "अ", color: "#9a3a0a", bg: "#fdebd6", available: true },
  { code: "mr", name: "Marathi", nativeName: "मराठी", letter: "म", color: "#6b21a8", bg: "#f0e6fc", available: false },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", letter: "ગ", color: "#0f6b3a", bg: "#d9f3e4", available: false },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", letter: "அ", color: "#b3173a", bg: "#fde3e8", available: false },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", letter: "అ", color: "#0b6b5e", bg: "#d2f6ec", available: false },
];


export default function LanguageScreen() {
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage } = useT();
  const selected = language;
  const [requests, setRequests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const prefs = await fetchPreferences();
      if (prefs?.language && TRANSLATED_LANGUAGES.includes(prefs.language)) setLanguage(prefs.language);
      setRequests(prefs?.language_requests || []);
    } catch {
      // Offline or signed out: keep what we have; choices still work and sync next time.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setLanguage]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function flash(text: string) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2500);
  }

  async function choose(option: LanguageOption) {
    const language = option;
    if (language.code === selected) return;
    // The app switches language right away; saving to the account happens in the background.
    setLanguage(language.code);
    setSaving(true);
    try {
      await updatePreferences({ language: language.code });
      flash(t("Language changed to {name}.", { name: language.nativeName }));
    } catch {
      // It still works on this phone; it just wasn't stored on the account.
      flash("Couldn't save to your account. It is still set on this phone.");
    } finally { setSaving(false); }
  }

  async function toggleRequest(language: LanguageOption) {
    const previous = requests;
    const next = requests.includes(language.code) ? requests.filter((code) => code !== language.code) : [...requests, language.code];
    setRequests(next);
    try {
      await updatePreferences({ language_requests: next });
      flash(next.includes(language.code) ? t("We'll tell you when {name} is ready.", { name: language.name }) : t("Request removed."));
    } catch {
      setRequests(previous);
      flash(t("Couldn't save. Please try again."));
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <Text style={styles.headerTitle}>{t("Language")}</Text>
        {saving ? <ActivityIndicator size="small" color={UI.accent} /> : <Ionicons name="language" size={26} color={UI.accent} />}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={UI.accent} colors={[UI.accent]} />}
      >
        <Text style={styles.intro}>{t("Pick the language for the app. English and Hindi are ready today. For the others, tap \"Notify me\" and we'll let you know as soon as they launch.")}</Text>

        {message ? (
          <View style={styles.toast}>
            <Ionicons name="information-circle" size={16} color={UI.accent} />
            <Text style={styles.toastText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {LANGUAGES.map((language) => {
            const active = selected === language.code;
            const wanted = requests.includes(language.code);
            return (
              <Pressable
                key={language.code}
                style={[styles.tile, active && styles.tileActive]}
                onPress={() => language.available && choose(language)}
                disabled={!language.available}
              >
                <View style={[styles.badge, { backgroundColor: active ? "#ffffff" : language.bg }]}>
                  <Text style={[styles.badgeLetter, { color: language.color }]}>{language.letter}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.native}>{language.nativeName}</Text>
                  <Text style={styles.name}>{active ? `${language.name} \u00b7 ${loading ? t("Checking your account...") : t("Saved to your account")}` : language.name}</Text>
                </View>
                {language.available ? (
                  active ? <View style={styles.checkOn}><Ionicons name="checkmark" size={16} color="#ffffff" /></View> : <View style={styles.radio} />
                ) : (
                  <Pressable style={[styles.notify, wanted && styles.notifyOn]} onPress={() => toggleRequest(language)} hitSlop={6}>
                    <Ionicons name={wanted ? "notifications" : "notifications-outline"} size={14} color={wanted ? "#fff" : UI.accent} />
                    <Text style={[styles.notifyText, wanted && { color: "#fff" }]}>{wanted ? t("We'll notify you") : t("Notify me")}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 24, fontWeight: "800" },
  content: { paddingHorizontal: 14, paddingTop: 2, gap: 10 },

  intro: { color: UI.sub, fontSize: 13, lineHeight: 19 },
  toast: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: UI.accentSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  toastText: { flex: 1, color: UI.accent, fontSize: 11, fontWeight: "700" },

  list: { gap: 8 },
  tile: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingVertical: 9, paddingHorizontal: 12 },
  tileActive: { borderColor: UI.accent, borderWidth: 2, backgroundColor: UI.accentSoft },
  badge: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badgeLetter: { fontSize: 17, fontWeight: "900" },
  native: { color: UI.ink, fontSize: 15, fontWeight: "800" },
  name: { color: UI.sub, fontSize: 12 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#c4c8dc" },
  checkOn: { width: 24, height: 24, borderRadius: 12, backgroundColor: UI.accent, alignItems: "center", justifyContent: "center" },
  notify: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#c9ccf0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  notifyOn: { backgroundColor: UI.accent, borderColor: UI.accent },
  notifyText: { color: "#3a35b8", fontSize: 12, fontWeight: "800" },
});
