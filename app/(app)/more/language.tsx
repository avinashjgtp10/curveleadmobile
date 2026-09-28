import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Card, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

interface LanguageOption {
  code: string;
  name: string;
  nativeName: string;
  available: boolean;
}

const LANGUAGES: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", available: true },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", available: false },
  { code: "mr", name: "Marathi", nativeName: "मराठी", available: false },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", available: false },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", available: false },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", available: false },
];

export default function LanguageScreen() {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState("en");

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Language" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>Choose the language used across the app. More languages are on the way — only English is available today.</Text>

        <Card mode="outlined" style={styles.card}>
          <Card.Content style={styles.list}>
            {LANGUAGES.map((language, index) => {
              const active = selected === language.code;
              return (
                <View key={language.code}>
                  <Pressable
                    style={[styles.row, !language.available && styles.rowDisabled]}
                    disabled={!language.available}
                    onPress={() => setSelected(language.code)}
                  >
                    <View style={styles.rowBody}>
                      <Text style={[styles.languageName, !language.available && styles.languageNameDisabled]}>{language.name}</Text>
                      <Text style={styles.languageNative}>{language.nativeName}</Text>
                    </View>
                    {language.available ? (
                      active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : <View style={styles.radioEmpty} />
                    ) : (
                      <View style={styles.comingSoonBadge}><Text style={styles.comingSoonText}>Coming soon</Text></View>
                    )}
                  </Pressable>
                  {index < LANGUAGES.length - 1 ? <View style={styles.divider} /> : null}
                </View>
              );
            })}
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { padding: 18, gap: 14 },
  sectionDescription: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },

  card: {},
  list: { paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14 },
  rowDisabled: { opacity: 0.7 },
  rowBody: { flex: 1, marginRight: 12 },
  languageName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  languageNameDisabled: { color: colors.textSecondary },
  languageNative: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.borderSoft },
  radioEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border },
  comingSoonBadge: { backgroundColor: colors.surfaceMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  comingSoonText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800" },
});
