import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { fetchPreferences, updatePreferences } from "@/api/preferences";
import { TRANSLATED_LANGUAGES, useT } from "@/i18n/LanguageContext";

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
  { code: "en", name: "English", nativeName: "English", letter: "A", color: "#0ea5e9", bg: "#e0f2fe", available: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", letter: "अ", color: "#f97316", bg: "#ffedd5", available: true },
  { code: "mr", name: "Marathi", nativeName: "मराठी", letter: "म", color: "#8b5cf6", bg: "#ede9fe", available: false },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", letter: "ગ", color: "#16a34a", bg: "#dcfce7", available: false },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", letter: "அ", color: "#e11d48", bg: "#ffe4e6", available: false },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", letter: "అ", color: "#0d9488", bg: "#ccfbf1", available: false },
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

  const current = LANGUAGES.find((language) => language.code === selected) || LANGUAGES[0];

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t("Language")} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="language" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{t("Your language")}</Text>
            <Text style={styles.heroTitle}>{current.nativeName}</Text>
            <Text style={styles.heroSub}>{loading ? t("Checking your account...") : t("Saved to your account")}</Text>
          </View>
          {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
          <View style={styles.heroCircle} />
        </LinearGradient>

        <Text style={styles.intro}>{t("Pick the language for the app. English and Hindi are ready today. For the others, tap \"Notify me\" and we'll let you know as soon as they launch.")}</Text>

        {message ? (
          <View style={styles.toast}>
            <Ionicons name="information-circle" size={16} color={colors.primary} />
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
                style={[styles.tile, active && { borderColor: language.color, backgroundColor: language.bg }]}
                onPress={() => language.available && choose(language)}
                disabled={!language.available}
              >
                <View style={[styles.badge, { backgroundColor: active ? "#ffffff" : language.bg }]}>
                  <Text style={[styles.badgeLetter, { color: language.color }]}>{language.letter}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.native}>{language.nativeName}</Text>
                  <Text style={styles.name}>{language.name}</Text>
                </View>
                {language.available ? (
                  active ? <Ionicons name="checkmark-circle" size={22} color={language.color} /> : <View style={styles.radio} />
                ) : (
                  <Pressable style={[styles.notify, wanted && styles.notifyOn]} onPress={() => toggleRequest(language)} hitSlop={6}>
                    <Ionicons name={wanted ? "notifications" : "notifications-outline"} size={12} color={wanted ? "#fff" : colors.primary} />
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
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  content: { padding: 12, gap: 10 },

  hero: { borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, overflow: "hidden" },
  heroIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  heroLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 1 },
  heroCircle: { position: "absolute", width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.1)", right: -20, top: -26 },

  intro: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  toast: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#e0f2fe", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  toastText: { flex: 1, color: colors.primary, fontSize: 11, fontWeight: "700" },

  list: { gap: 8 },
  tile: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1.5, borderColor: "#e2eef7", paddingVertical: 9, paddingHorizontal: 12 },
  badge: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  badgeLetter: { fontSize: 16, fontWeight: "900" },
  native: { color: colors.text, fontSize: 15, fontWeight: "800" },
  name: { color: colors.textMuted, fontSize: 11 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#cbd5e1" },
  notify: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  notifyOn: { backgroundColor: colors.primary },
  notifyText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
});
