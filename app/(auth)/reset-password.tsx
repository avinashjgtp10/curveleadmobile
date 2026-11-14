import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { AUTH_NAVY, AuthShell, authStyles as styles } from "@/components/AuthShell";
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
  const [showConfirm, setShowConfirm] = useState(false);
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
      <AuthShell title="Password updated" subtitle="Your password was changed. You can log in with the new one now." onBack={() => router.replace("/(auth)/login")}>
        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.button}>
          <Text style={styles.buttonLabel}>Go to log in</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create new password" subtitle={linkToken ? "Your new password must be different from your old one." : "Paste the link or code from your reset email, then choose a new password."}>
      {error ? (
        <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {!linkToken ? (
        <>
          <Text style={styles.label}>Reset link or code</Text>
          <TextInput
            style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={AUTH_NAVY}
            placeholder="Paste the link or code from your email" accessibilityLabel="Reset link or code" value={pasted}
            onChangeText={(value) => { setPasted(value); setError(""); }} autoCapitalize="none" autoCorrect={false} disabled={loading}
            left={<TextInput.Icon icon="link-variant" />}
          />
        </>
      ) : null}

      <Text style={styles.label}>New password</Text>
      <TextInput
        style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={AUTH_NAVY}
        placeholder="Enter new password" accessibilityLabel="New password" value={password}
        onChangeText={(value) => { setPassword(value); setError(""); }}
        secureTextEntry={!showPassword} autoCapitalize="none" disabled={loading}
        left={<TextInput.Icon icon="lock-outline" />}
        right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} onPress={() => setShowPassword((value) => !value)} forceTextInputFocus={false} />}
      />

      {password ? (
        <View style={localStyles.meterWrap}>
          <View style={localStyles.meterRow}>
            {[1, 2, 3, 4].map((step) => <View key={step} style={[localStyles.meterBar, { backgroundColor: step <= meter.score ? meter.color : "#e2e8f0" }]} />)}
          </View>
          <Text style={[localStyles.meterLabel, { color: meter.color }]}>{meter.label}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Confirm password</Text>
      <TextInput
        style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={AUTH_NAVY}
        placeholder="Re-enter new password" accessibilityLabel="Confirm new password" value={confirm}
        onChangeText={(value) => { setConfirm(value); setError(""); }}
        secureTextEntry={!showConfirm} autoCapitalize="none" returnKeyType="go" onSubmitEditing={submit} disabled={loading}
        left={<TextInput.Icon icon="lock-outline" />}
        right={<TextInput.Icon icon={showConfirm ? "eye-off-outline" : "eye-outline"} onPress={() => setShowConfirm((value) => !value)} forceTextInputFocus={false} />}
      />
      {confirm && password && confirm !== password
        ? <Text style={localStyles.mismatch}>Passwords don't match yet.</Text>
        : <Text style={localStyles.hint}>Use at least {MIN_LENGTH} characters with a mix of letters and numbers.</Text>}

      <Pressable onPress={submit} disabled={loading} style={[styles.button, { marginTop: 14 }, loading && { opacity: 0.8 }]}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
        <Text style={styles.buttonLabel}>Reset password</Text>
        {!loading ? <Ionicons name="arrow-forward" size={16} color="#fff" /> : null}
      </Pressable>

      <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
        <Text style={styles.linkPlain}>Back to <Text style={styles.link}>Log in</Text></Text>
      </Pressable>
    </AuthShell>
  );
}

const localStyles = StyleSheet.create({
  meterWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -6, marginBottom: 12 },
  meterRow: { flex: 1, flexDirection: "row", gap: 6 },
  meterBar: { flex: 1, height: 4, borderRadius: 2 },
  meterLabel: { fontSize: 12, fontWeight: "800", minWidth: 48, textAlign: "right" },
  mismatch: { color: colors.danger, fontSize: 11, marginTop: -6 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: -6 },
});
