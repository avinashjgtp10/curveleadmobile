import { IconEye } from "@/components/ReferenceIcons";
import { GlassBackground, CurveLeadLogo } from "@/components/Glass";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Button, SegmentedButtons, TextInput } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

type LoginMode = "password" | "otp";

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return fallback;
}

export default function LoginScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const { login, requestOtp, verifyOtp } = useAuth();
  const [mode, setMode] = useState<LoginMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function scrollToField(y: number) {
    // Wait for the keyboard resize animation before moving the field into view.
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 120);
  }

  function updateMode(nextMode: LoginMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  function updateEmail(value: string) {
    setEmail(value);
    setOtpSent(false);
    setOtp("");
    setError("");
    setNotice("");
  }

  async function handleRequestOtp() {
    if (!email.trim()) {
      setError("Enter your email to receive an OTP.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await requestOtp(email.trim());
      setOtpSent(true);
      setNotice("OTP sent to your email.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send OTP."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }
    if (mode === "otp" && !otpSent) {
      await handleRequestOtp();
      return;
    }
    if (mode === "password" && !password) {
      setError("Enter your password.");
      return;
    }
    if (mode === "otp" && otp.length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (mode === "password") await login(email.trim(), password);
      else await verifyOtp(email.trim(), otp);
      router.replace("/(app)");
    } catch (loginError) {
      setError(getErrorMessage(loginError, mode === "password" ? "Login failed." : "Invalid or expired OTP."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <GlassBackground login />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <CurveLeadLogo />
          <Text style={styles.logoText}>curvelead</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Get Started now</Text>
          <Text style={styles.subtitle}>Sign in with your password or a one-time email code.</Text>

          <View style={styles.segmented}>{(["password", "otp"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => updateMode(value)} style={{ flex: 1, paddingVertical: 10, backgroundColor: mode === value ? colors.primary : "transparent" }}><Text style={{ textAlign: "center", fontFamily: "Inter_600SemiBold", fontSize: 14, color: mode === value ? "#fff" : colors.textSecondary }}>{value === "password" ? "Password" : "Email OTP"}</Text></Pressable>)}</View>

          {error ? <View style={[styles.message, styles.errorBox]}><Text style={styles.errorText}>{error}</Text></View> : null}
          {notice ? <View style={[styles.message, styles.noticeBox]}><Text style={styles.noticeText}>{notice}</Text></View> : null}

          <TextInput
            style={styles.fieldGroup} mode="outlined" outlineStyle={{ borderRadius: 12, borderColor: colors.borderSoft }} theme={{ colors: { background: "rgba(255,255,255,0.7)" } }} placeholder="Email" accessibilityLabel="Email"
            value={email} onChangeText={updateEmail} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} autoComplete="email" disabled={loading}
            onFocus={() => scrollToField(220)}
          />

          {mode === "password" ? (
            <View style={styles.fieldGroup}>
              <TextInput
                mode="outlined" outlineStyle={{ borderRadius: 12, borderColor: colors.borderSoft }} theme={{ colors: { background: "rgba(255,255,255,0.7)" } }} placeholder="Password" accessibilityLabel="Password"
                value={password} onChangeText={(value) => { setPassword(value); setError(""); }}
                secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="current-password"
                returnKeyType="go" onSubmitEditing={handleSubmit} disabled={loading}
                onFocus={() => scrollToField(310)}
                right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : () => <IconEye />} onPress={() => setShowPassword((value) => !value)} forceTextInputFocus={false} />}
              />
              <Pressable onPress={() => router.push("/(auth)/forgot-password")} hitSlop={10} style={styles.forgotLinkWrap}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <TextInput
                mode="outlined" outlineStyle={{ borderRadius: 12, borderColor: colors.borderSoft }} theme={{ colors: { background: "rgba(255,255,255,0.7)" } }} label="One-time code" placeholder="000000" value={otp}
                onChangeText={(value) => { setOtp(value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                keyboardType="number-pad" maxLength={6} disabled={!otpSent || loading}
                returnKeyType="go" onSubmitEditing={handleSubmit}
                onFocus={() => scrollToField(310)}
                contentStyle={styles.otpInputContent}
              />
              <Pressable onPress={handleRequestOtp} disabled={loading || !email.trim()} hitSlop={10} style={styles.forgotLinkWrap}>
                <Text style={[styles.forgotLink, (loading || !email.trim()) && styles.mutedLink]}>{otpSent ? "Resend OTP" : "Send OTP"}</Text>
              </Pressable>
            </View>
          )}

          <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16 }}><Button buttonColor="transparent" mode="contained" onPress={handleSubmit} loading={loading} disabled={loading} style={styles.button} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}>
            {mode === "password" ? "Log in" : otpSent ? "Verify & Log in" : "Send Email OTP"}
          </Button></LinearGradient>

          <Text style={styles.terms}>
            By signing in to your CurveLead account, you are agreeing to accept our{" "}
            <Text style={styles.termsLink}>Terms &amp; Conditions</Text>
          </Text>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>Don&apos;t have an account? </Text>
            <Pressable onPress={() => router.push("/(auth)/signup")}><Text style={styles.signupLink}>Sign up free</Text></Pressable>
          </View>
        </View>

        <Text style={styles.footerText}>Need help? <Text style={styles.footerLink}>Chat with us</Text></Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1 },
  hero: { alignItems: "center", justifyContent: "center", paddingTop: 70, paddingBottom: 40 },
  logo: { width: 56, height: 56, borderRadius: 14, marginBottom: 10 },
  logoText: { color: "#0284c7", fontSize: 30, fontFamily: "DMSans_700Bold", letterSpacing: -0.8, marginTop: 16 },
  card: { flex: 1, backgroundColor: "rgba(255,255,255,0.80)", borderWidth: 1, borderColor: "rgba(255,255,255,0.7)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingTop: 32 },
  title: { color: colors.text, fontSize: 24, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 4 },
  segmented: { flexDirection: "row", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(240,249,255,0.6)", marginTop: 24, marginBottom: 24 },
  message: { borderRadius: 10, padding: 11, marginBottom: 16 },
  errorBox: { backgroundColor: colors.dangerSoft },
  noticeBox: { backgroundColor: colors.successSoft },
  errorText: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  noticeText: { color: colors.success, fontSize: 13, fontWeight: "600" },
  fieldGroup: { marginBottom: 17 },
  forgotLinkWrap: { alignSelf: "flex-end", marginTop: 7 },
  forgotLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  mutedLink: { color: colors.textMuted },
  otpInputContent: { textAlign: "center", fontSize: 20, fontWeight: "800", letterSpacing: 10 },
  button: { borderRadius: 16 },
  buttonContent: { height: 56 },
  buttonLabel: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  terms: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 18 },
  termsLink: { color: colors.primary, fontFamily: "Inter_500Medium" },
  signupRow: { flexDirection: "row", justifyContent: "center", marginTop: 20 },
  signupPrompt: { color: colors.textSecondary, fontSize: 13 },
  signupLink: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  footerText: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 32, paddingTop: 32, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  footerLink: { color: colors.primary, fontFamily: "Inter_500Medium" },
});
