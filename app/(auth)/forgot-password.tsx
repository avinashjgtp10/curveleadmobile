import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AUTH_NAVY, AuthShell, authStyles as styles } from "@/components/AuthShell";
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
      <AuthShell title="Check your email" subtitle={`If an account exists for ${sentTo}, we've sent a link to reset your password.`} onBack={() => { setSentTo(""); setError(""); }}>
        <View style={localStyles.tips}>
          <View style={localStyles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={localStyles.tipText}>Open the email and tap the reset link.</Text></View>
          <View style={localStyles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={localStyles.tipText}>Can't see it? Check your spam folder.</Text></View>
          <View style={localStyles.tipRow}><Ionicons name="checkmark-circle" size={18} color={colors.success} /><Text style={localStyles.tipText}>If the link opens in a browser, copy it and paste it on the next screen.</Text></View>
        </View>

        <Pressable onPress={() => router.push("/(auth)/reset-password")} style={styles.button}>
          <Text style={styles.buttonLabel}>I have my reset link</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>

        {error ? (
          <View style={[styles.errorBox, { marginTop: 12 }]}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
        ) : null}

        <Pressable onPress={send} disabled={cooldown > 0 || loading} style={styles.linkWrap} hitSlop={8}>
          {loading ? <ActivityIndicator size="small" color={AUTH_NAVY} /> : (
            <Text style={[styles.link, cooldown > 0 && styles.linkMuted]}>{cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}</Text>
          )}
        </Pressable>
        <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
          <Text style={styles.linkPlain}>Back to <Text style={styles.link}>Log in</Text></Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Forgot password?" subtitle="Enter your email and we'll send you a link to set a new password.">
      {error ? (
        <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      <Text style={styles.label}>Email address</Text>
      <TextInput
        style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={AUTH_NAVY}
        placeholder="you@company.com" accessibilityLabel="Email" value={email}
        onChangeText={(value) => { setEmail(value); setError(""); }}
        keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email"
        returnKeyType="send" onSubmitEditing={send} disabled={loading}
        left={<TextInput.Icon icon="email-outline" />}
      />

      <Pressable onPress={send} disabled={loading} style={[styles.button, loading && { opacity: 0.8 }]}>
        {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
        <Text style={styles.buttonLabel}>Send reset link</Text>
        {!loading ? <Ionicons name="arrow-forward" size={16} color="#fff" /> : null}
      </Pressable>

      <Pressable onPress={() => router.replace("/(auth)/login")} style={styles.linkWrap} hitSlop={8}>
        <Text style={styles.linkPlain}>Remembered it? <Text style={styles.link}>Log in</Text></Text>
      </Pressable>
    </AuthShell>
  );
}

const localStyles = StyleSheet.create({
  tips: { gap: 10, backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#dbe3f1", padding: 14, marginBottom: 14 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  tipText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
