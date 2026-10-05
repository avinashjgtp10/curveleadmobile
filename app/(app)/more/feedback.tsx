import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Appbar, Text } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { FeedbackType, sendFeedback } from "@/api/feedback";

const MAX_MESSAGE = 1000;

const TYPES: { key: FeedbackType; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; placeholder: string }[] = [
  { key: "idea", label: "Idea", hint: "Suggest a feature", icon: "bulb", color: "#d97706", bg: "#fef3c7", placeholder: "What would make CurveLead better for you?" },
  { key: "bug", label: "Bug", hint: "Report a problem", icon: "bug", color: "#dc2626", bg: "#fee2e2", placeholder: "What went wrong, and what were you doing when it happened?" },
  { key: "other", label: "Other", hint: "Anything else", icon: "chatbubble-ellipses", color: "#4f46e5", bg: "#e0e7ff", placeholder: "Tell us what's on your mind." },
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
      await sendFeedback({ type, message, rating });
      setSent(true);
      setMessage("");
      setRating(0);
    } catch (sendError) {
      setError(errorMessage(sendError, "Couldn't send your feedback. Please try again."));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Submit Feedback" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {sent ? (
        <View style={styles.successState}>
          <LinearGradient colors={["#22c55e", "#0ea5e9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.successIcon}>
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
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 130 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LinearGradient colors={["#f59e0b", "#ec4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="heart" size={24} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>We'd love to hear from you</Text>
              <Text style={styles.heroSub}>Your ideas and bug reports go straight to the CurveLead team.</Text>
            </View>
            <View style={styles.heroCircle} />
          </LinearGradient>

          <Text style={styles.label}>What's this about?</Text>
          <View style={styles.typeRow}>
            {TYPES.map((item) => {
              const active = type === item.key;
              return (
                <Pressable key={item.key} style={[styles.typeTile, active && { borderColor: item.color, backgroundColor: item.bg }]} onPress={() => setType(item.key)}>
                  <View style={[styles.typeIcon, { backgroundColor: active ? "#ffffff" : item.bg }]}><Ionicons name={item.icon} size={20} color={item.color} /></View>
                  <Text style={[styles.typeLabel, active && { color: item.color }]}>{item.label}</Text>
                  <Text style={styles.typeHint} numberOfLines={1}>{item.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>How are you finding CurveLead? <Text style={styles.optional}>(optional)</Text></Text>
          <View style={styles.ratingCard}>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((value) => (
                <Pressable key={value} onPress={() => setRating(rating === value ? 0 : value)} hitSlop={6}>
                  <Ionicons name={value <= rating ? "star" : "star-outline"} size={34} color={value <= rating ? "#f59e0b" : "#cbd5e1"} />
                </Pressable>
              ))}
            </View>
            <Text style={styles.ratingText}>{rating ? RATING_LABELS[rating] : "Tap a star"}</Text>
          </View>

          <Text style={styles.label}>Your message</Text>
          <View style={[styles.inputBox, !!error && styles.inputError]}>
            <RNTextInput
              value={message} onChangeText={(value) => { setMessage(value.slice(0, MAX_MESSAGE)); if (error) setError(""); }}
              placeholder={current.placeholder} placeholderTextColor={colors.textMuted} multiline textAlignVertical="top" style={styles.inputText}
            />
          </View>
          <View style={styles.counterRow}>
            {error ? <Text style={styles.errorText}>{error}</Text> : <View />}
            <Text style={styles.counter}>{message.length} / {MAX_MESSAGE}</Text>
          </View>

          <Pressable onPress={handleSubmit} disabled={sending} style={sending && { opacity: 0.6 }}>
            <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submitButton}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color="#fff" />}
              <Text style={styles.submitText}>Send feedback</Text>
            </LinearGradient>
          </Pressable>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  content: { padding: 14, gap: 4 },

  hero: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden", marginBottom: 8 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.92)", fontSize: 12, lineHeight: 17, marginTop: 3 },
  heroCircle: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.12)", right: -30, top: -36 },

  label: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  optional: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },

  typeRow: { flexDirection: "row", gap: 10 },
  typeTile: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 14, paddingHorizontal: 6, borderRadius: 18, borderWidth: 2, borderColor: "#e2eef7", backgroundColor: "#ffffff" },
  typeIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  typeLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  typeHint: { color: colors.textMuted, fontSize: 11 },

  ratingCard: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: "#e2eef7", paddingVertical: 14, alignItems: "center", gap: 6 },
  starRow: { flexDirection: "row", gap: 8 },
  ratingText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },

  inputBox: { minHeight: 150, borderRadius: 16, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#ffffff", paddingHorizontal: 14, paddingVertical: 6 },
  inputError: { borderColor: colors.danger },
  inputText: { color: colors.text, fontSize: 14, minHeight: 136, paddingVertical: 8 },
  counterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  counter: { color: colors.textMuted, fontSize: 11 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },

  submitButton: { marginTop: 14, height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  successState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  successIcon: { width: 90, height: 90, borderRadius: 45, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { color: colors.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  successText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  secondaryButton: { marginTop: 24, alignSelf: "stretch", alignItems: "center", paddingVertical: 14, borderRadius: 16, backgroundColor: colors.primarySoft },
  secondaryText: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  linkButton: { marginTop: 8, paddingVertical: 10 },
  linkText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
});
