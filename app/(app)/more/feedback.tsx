import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Appbar, Button, Card, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

type FeedbackType = "idea" | "bug" | "other";

const TYPES: { key: FeedbackType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "idea", label: "Idea", icon: "bulb-outline" },
  { key: "bug", label: "Bug report", icon: "bug-outline" },
  { key: "other", label: "Other", icon: "chatbubble-ellipses-outline" },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<FeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  function handleSubmit() {
    if (!message.trim()) { setError("Tell us what's on your mind first."); return; }
    setError("");
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setSent(true);
      setMessage("");
    }, 500);
  }

  if (sent) {
    return (
      <View style={styles.screen}>
        <Appbar.Header style={styles.header} elevated={false}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Submit Feedback" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <View style={styles.successState}>
          <View style={styles.successIcon}><Ionicons name="checkmark-circle" size={44} color={colors.success} /></View>
          <Text style={styles.successTitle}>Thanks for the feedback!</Text>
          <Text style={styles.successText}>The CurveLead team will take a look. We read every message.</Text>
          <Button mode="contained" onPress={() => setSent(false)} style={styles.successButton}>Send another</Button>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Submit Feedback" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionDescription}>Share ideas and report issues directly with the CurveLead team.</Text>

        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text style={styles.label}>What's this about?</Text>
            <View style={styles.typeRow}>
              {TYPES.map((item) => {
                const active = type === item.key;
                return (
                  <Pressable key={item.key} style={[styles.typeChip, active && styles.typeChipActive]} onPress={() => setType(item.key)}>
                    <Ionicons name={item.icon} size={15} color={active ? colors.surface : colors.textSecondary} />
                    <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.label}>Your message</Text>
            <TextInput
              mode="outlined" value={message} onChangeText={setMessage}
              placeholder={type === "bug" ? "What went wrong, and what were you doing when it happened?" : "What would make CurveLead better for you?"}
              multiline numberOfLines={6} style={styles.textarea}
            />

            <Button mode="contained" onPress={handleSubmit} loading={sending} disabled={sending} style={styles.submitButton} contentStyle={styles.submitButtonContent}>
              Send Feedback
            </Button>
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
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 8 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  typeChipTextActive: { color: colors.surface },

  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginTop: 12, borderRadius: 8, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },

  textarea: { marginTop: 14, minHeight: 120 },
  submitButton: { marginTop: 16, borderRadius: 10 },
  submitButtonContent: { height: 48 },

  successState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  successIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center", marginBottom: 18 },
  successTitle: { color: colors.text, fontSize: 17, fontWeight: "800", textAlign: "center" },
  successText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  successButton: { marginTop: 22, borderRadius: 10, alignSelf: "stretch" },
});
