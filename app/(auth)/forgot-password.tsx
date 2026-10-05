import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AuthShell } from "@/components/AuthShell";
import { requestPasswordReset } from "@/api/passwordReset";
import { colors } from "@/theme";

const RESEND_SECONDS = 30;

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function send() {
    const address = email.trim();
    if (!address) { setError("Enter the email you signed up with."); return; }
    if (!/^\S+@\S+\.\S+$/.test(address)) { setError("That doesn't look like an email address."); return; }
    setLoading(true);
    setError("");
    try {
      await requestPasswordReset(address);
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    } catch (sendError) {
      setError(errorMessage(sendError, "Failed to send the reset link."));
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email" subtitle={`If an account exists for ${sentTo}, we've sent a link to reset your password.`} icon="mail-open-outline" onBack={() => setSentTo("")}>
        <View style={styles.tips}>
          <View style={styles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={styles.tipText}>Open the email and tap the reset link.</Text></View>
          <View style={styles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={styles.tipText}>Can't see it? Check your spam folder.</Text></View>
          <View style={styles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={styles.tipText}>If the link opens in a browser, copy it and paste it on the next screen.</Text></View>
        </View>

        <Pressable onPress={() => router.push("/(auth)/reset-password")} style={styles.buttonWrap}>
          <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
            <Ionicons name="key" size={19} color="#fff" />
            <Text style={styles.buttonLabel}>I have my reset link</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={send} disabled={cooldown > 0 || loading} style={styles.linkWrap} hitSlop={8}>
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : (
            <Text style={[styles.link, cooldown > 0 && styles.linkMuted]}>{cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}</Text>
          )}
        </Pressable>
        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
          <Text style={styles.linkPlain}>Back to log in</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password?" subtitle="Enter your email and we'll send you a link to set a new password." icon="lock-open-outline">
      {error ? (
        <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      <TextInput
        style={styles.field} mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
        placeholder="Email address" accessibilityLabel="Email" value={email}
        onChangeText={(value) => { setEmail(value); setError(""); }}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        returnKeyType="send" onSubmitEditing={send} disabled={loading}
        left={<TextInput.Icon icon="email-outline" />}
      />

      <Pressable onPress={send} disabled={loading} style={[styles.buttonWrap, loading && { opacity: 0.8 }]}>
        <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
          <Text style={styles.buttonLabel}>Send reset link</Text>
        </LinearGradient>
      </Pressable>

      <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
        <Text style={styles.linkPlain}>Remembered it? <Text style={styles.link}>Log in</Text></Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 11, marginBottom: 14, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: "600" },
  field: { backgroundColor: "#f8fbfd", marginBottom: 14 },
  fieldOutline: { borderRadius: 14, borderColor: "#d7e6f1" },
  buttonWrap: { marginTop: 4 },
  button: { height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonLabel: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  linkWrap: { alignItems: "center", marginTop: 16 },
  link: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  linkMuted: { color: colors.textMuted },
  linkPlain: { color: colors.textSecondary, fontSize: 13 },
  tips: { gap: 10, backgroundColor: "#f0f9ff", borderRadius: 16, padding: 14, marginBottom: 18 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
