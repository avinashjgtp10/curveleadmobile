import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { AuthShell } from "@/components/AuthShell";
import { extractResetToken, resetPassword } from "@/api/passwordReset";
import { colors } from "@/theme";

const MIN_LENGTH = 6;

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function strength(password: string) {
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 10) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  if (!password) return { score: 0, label: "", color: "#e2e8f0" };
  if (score <= 1) return { score: 1, label: "Weak", color: "#ef4444" };
  if (score === 2) return { score: 2, label: "Okay", color: "#f59e0b" };
  if (score === 3) return { score: 3, label: "Good", color: "#22c55e" };
  return { score: 4, label: "Strong", color: "#16a34a" };
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const linkToken = typeof params.token === "string" ? params.token : "";
  const [pasted, setPasted] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const token = linkToken || extractResetToken(pasted);
  const meter = strength(password);

  async function submit() {
    if (!token) { setError("Paste the reset link or code from your email."); return; }
    if (password.length < MIN_LENGTH) { setError(`Password must be at least ${MIN_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    setError("");
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (resetError) {
      setError(errorMessage(resetError, "Failed to reset your password. The link may have expired."));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="Your password was changed. You can log in with the new one now." icon="checkmark-done-circle-outline" onBack={() => router.replace("/(auth)/login")}>
        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.buttonWrap}>
          <LinearGradient colors={["#22c55e", "#0ea5e9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
            <Ionicons name="log-in-outline" size={20} color="#fff" />
            <Text style={styles.buttonLabel}>Go to log in</Text>
          </LinearGradient>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password" subtitle={linkToken ? "Choose a new password for your account." : "Paste the link or code from your reset email, then choose a new password."} icon="key-outline">
      {error ? (
        <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {!linkToken ? (
        <TextInput
          style={styles.field} mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
          placeholder="Reset link or code from your email" accessibilityLabel="Reset link or code" value={pasted}
          onChangeText={(value) => { setPasted(value); setError(""); }} autoCapitalize="none" autoCorrect={false} disabled={loading}
          left={<TextInput.Icon icon="link-variant" />}
        />
      ) : null}

      <TextInput
        style={styles.field} mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
        placeholder="New password" accessibilityLabel="New password" value={password}
        onChangeText={(value) => { setPassword(value); setError(""); }}
        secureTextEntry={!showPassword} autoCapitalize="none" disabled={loading}
        left={<TextInput.Icon icon="lock-outline" />}
        right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} onPress={() => setShowPassword((value) => !value)} forceTextInputFocus={false} />}
      />

      {password ? (
        <View style={styles.meterWrap}>
          <View style={styles.meterRow}>
            {[1, 2, 3, 4].map((step) => <View key={step} style={[styles.meterBar, { backgroundColor: step <= meter.score ? meter.color : "#e2e8f0" }]} />)}
          </View>
          <Text style={[styles.meterLabel, { color: meter.color }]}>{meter.label}</Text>
        </View>
      ) : null}

      <TextInput
        style={styles.field} mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
        placeholder="Confirm new password" accessibilityLabel="Confirm new password" value={confirm}
        onChangeText={(value) => { setConfirm(value); setError(""); }}
        secureTextEntry={!showPassword} autoCapitalize="none" returnKeyType="go" onSubmitEditing={submit} disabled={loading}
        left={<TextInput.Icon icon="lock-check-outline" />}
      />
      {confirm && password && confirm !== password ? <Text style={styles.mismatch}>Passwords don't match yet.</Text> : null}

      <Pressable onPress={submit} disabled={loading} style={[styles.buttonWrap, loading && { opacity: 0.8 }]}>
        <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
          <Text style={styles.buttonLabel}>Update password</Text>
        </LinearGradient>
      </Pressable>

      <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
        <Text style={styles.linkPlain}>Back to <Text style={styles.link}>log in</Text></Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 11, marginBottom: 14, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: "600" },
  field: { backgroundColor: "#f8fbfd", marginBottom: 12 },
  fieldOutline: { borderRadius: 14, borderColor: "#d7e6f1" },
  meterWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -4, marginBottom: 12 },
  meterRow: { flex: 1, flexDirection: "row", gap: 6 },
  meterBar: { flex: 1, height: 5, borderRadius: 3 },
  meterLabel: { fontSize: 12, fontWeight: "800", minWidth: 48, textAlign: "right" },
  mismatch: { color: colors.danger, fontSize: 12, marginTop: -6, marginBottom: 8 },
  buttonWrap: { marginTop: 6 },
  button: { height: 54, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonLabel: { color: "#ffffff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  linkWrap: { alignItems: "center", marginTop: 16 },
  link: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  linkPlain: { color: colors.textSecondary, fontSize: 13 },
});
