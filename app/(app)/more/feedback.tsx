import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { FeedbackType, sendFeedback } from "@/api/feedback";
import { useKeyboardHeight } from "@/hooks/useKeyboardHeight";

// Pale lavender page, white cards with soft borders, indigo actions.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#e8e9fb", red: "#b3173a" };

const MAX_MESSAGE = 1000;

const TYPES: { key: FeedbackType; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; placeholder: string }[] = [
  { key: "idea", label: "Idea", hint: "Suggest a feature", icon: "bulb-outline", color: "#9a4a0a", bg: "#fdf0c4", placeholder: "What would make CurveLead better for you?" },
  { key: "bug", label: "Bug", hint: "Report a problem", icon: "bug-outline", color: "#b3173a", bg: "#fde3e8", placeholder: "What went wrong, and what were you doing when it happened?" },
  { key: "other", label: "Other", hint: "Anything else", icon: "chatbox-ellipses-outline", color: "#3a35b8", bg: "#e4e6fd", placeholder: "Tell us what's on your mind." },
];

const RATING_LABELS = ["", "Not good", "Could be better", "It's okay", "Good", "Love it!"];

function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  const serverMessage = error.response?.data?.error;
  if (typeof serverMessage === "string" && serverMessage.trim().length > 8) return serverMessage;
  if (status) return `${fallback} (error ${status})`;
  return error.request ? "No connection. Check your internet and try again." : fallback;
}

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { user } = useAuth();
  const [type, setType] = useState<FeedbackType>("idea");
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const current = TYPES.find((item) => item.key === type) || TYPES[0];

  async function handleSubmit() {
    if (!message.trim()) { setError("Tell us what's on your mind first."); return; }
    setError("");
    setSending(true);
    try {
      await sendFeedback({ type, message: message.trim(), rating, name: user?.name, email: user?.email });
      setSent(true);
      setMessage("");
      setRating(0);
    } catch (sendError) {
      const reason = errorMessage(sendError, "Couldn't send your feedback. Please try again.");
      setError(reason);
      // The ticket service is unavailable, so offer to send the same feedback by email instead.
      const body = `${message.trim()}${rating ? `

App rating: ${rating}/5` : ""}

${user?.name || ""} ${user?.email || ""}`.trim();
      const url = `mailto:support@curvelead.com?subject=${encodeURIComponent(`${current.label}: CurveLead app feedback`)}&body=${encodeURIComponent(body)}`;
      Alert.alert("Couldn't save feedback", "Our server isn't accepting it right now. Send it to the team by email instead?", [
        { text: "Not now", style: "cancel" },
        { text: "Send email", onPress: () => Linking.openURL(url).catch(() => Alert.alert("No email app", "Write to us at support@curvelead.com")) },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingBottom: keyboardHeight }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <Text style={styles.headerTitle}>Submit Feedback</Text>
      </View>

      {sent ? (
        <View style={styles.successState}>
          <LinearGradient colors={["#22c55e", "#4b45e0"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.successIcon}>
            <Ionicons name="checkmark" size={46} color="#fff" />
          </LinearGradient>
          <Text style={styles.successTitle}>Thanks for the feedback!</Text>
          <Text style={styles.successText}>It's with the CurveLead team now. We read every message, and you can follow it under Help & Support, My tickets.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => setSent(false)}>
            <Text style={styles.secondaryText}>Send another</Text>
          </Pressable>
          <Pressable style={styles.linkButton} onPress={() => router.back()}>
            <Text style={styles.linkText}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
          <Text style={styles.intro}>Your ideas and bug reports go straight to the CurveLead team.</Text>

          <Text style={styles.label}>What's this about?</Text>
          <View style={styles.typeRow}>
            {TYPES.map((item) => {
              const active = type === item.key;
              return (
                <Pressable key={item.key} style={[styles.typeTile, active && { borderColor: item.color, backgroundColor: item.bg }]} onPress={() => setType(item.key)}>
                  <View style={[styles.typeIcon, { backgroundColor: active ? "#ffffff" : item.bg }]}><Ionicons name={item.icon} size={18} color={item.color} /></View>
                  <Text style={[styles.typeLabel, active && { color: item.color }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>How are you finding CurveLead? <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.ratingCard}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setRating(rating === value ? 0 : value)} hitSlop={6}>
                  <Ionicons name={value <= rating ? "star" : "star-outline"} size={28} color={value <= rating ? "#e8a317" : "#b9bdd6"} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingText}>{rating ? RATING_LABELS[rating] : "Tap a star"}</Text>
          </View>

          <Text style={styles.label}>Your message</Text>
          <View style={[styles.inputBox, !!error && styles.inputError]}>
            <RNTextInput
              value={message} onChangeText={(value) => { setMessage(value.slice(0, MAX_MESSAGE)); if (error) setError(""); }}
              placeholder={current.placeholder} placeholderTextColor={UI.muted} multiline textAlignVertical="top" style={styles.inputText}
            />
          </View>
          <View style={styles.counterRow}>
            {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
            <Text style={styles.counter}>{message.length} / {MAX_MESSAGE}</Text>
          </View>

          <Pressable onPress={handleSubmit} disabled={sending} style={[styles.submitButton, sending && { opacity: 0.6 }]} accessibilityRole="button">
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="paper-plane-outline" size={18} color="#fff" />}
            <Text style={styles.submitText}>Send feedback</Text>
          </Pressable>
        </ScrollView>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 24, fontWeight: "800" },
  content: { paddingHorizontal: 14, paddingTop: 2, gap: 2 },
  intro: { color: UI.sub, fontSize: 13, lineHeight: 19, marginBottom: 2 },

  label: { color: UI.ink, fontSize: 14, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  optional: { color: UI.sub, fontSize: 12, fontWeight: "600" },

  typeRow: { flexDirection: "row", gap: 10 },
  typeTile: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 16, borderWidth: 2, borderColor: UI.line, backgroundColor: "#ffffff" },
  typeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  typeLabel: { color: UI.ink, fontSize: 14, fontWeight: "800" },

  ratingCard: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1, borderColor: UI.line, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  starRow: { flexDirection: "row", gap: 8 },
  ratingText: { color: UI.sub, fontSize: 13, fontWeight: "700" },

  inputBox: { minHeight: 120, borderRadius: 16, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 6 },
  inputError: { borderColor: UI.red },
  inputText: { color: UI.ink, fontSize: 14, minHeight: 106, paddingVertical: 8 },
  counterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  counter: { color: UI.sub, fontSize: 11 },
  errorText: { flex: 1, color: UI.red, fontSize: 12, fontWeight: "700" },

  submitButton: { height: 48, borderRadius: 14, backgroundColor: UI.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  successState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  successIcon: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { color: UI.ink, fontSize: 20, fontWeight: "900", textAlign: "center" },
  successText: { color: UI.sub, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  secondaryButton: { marginTop: 24, alignSelf: "stretch", alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: UI.accentSoft },
  secondaryText: { color: UI.accent, fontSize: 15, fontWeight: "800" },
  linkButton: { marginTop: 8, paddingVertical: 10 },
  linkText: { color: UI.sub, fontSize: 14, fontWeight: "700" },
});
