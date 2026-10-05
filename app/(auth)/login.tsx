import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Image, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

type LoginMode = "password" | "otp";

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return fallback;
}

function FieldError({ message }: { message: string }) {
  return (
    <View style={styles.fieldError} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export default function LoginScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
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
  // Inline messages are set only when the button is pressed, and a field's message clears as soon as
  // that field is edited. Nothing is checked while typing.
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "", otp: "" });

  function clearFieldError(field: "email" | "password" | "otp") {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: "" } : current));
  }

  function problemWith(field: "email" | "password" | "otp") {
    if (field === "email") {
      if (!email.trim()) return "Enter your email address.";
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "That doesn't look like an email address.";
      return "";
    }
    if (field === "password") return password ? "" : "Enter your password.";
    return otp.length === 6 ? "" : "Enter the 6-digit code from your email.";
  }

  const emailProblem = fieldErrors.email;
  const passwordProblem = mode === "password" ? fieldErrors.password : "";
  const otpProblem = mode === "otp" ? fieldErrors.otp : "";

  function scrollToField(y: number) {
    // Wait for the keyboard resize animation before moving the field into view.
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 120);
  }

  function updateMode(nextMode: LoginMode) {
    setMode(nextMode);
    setFieldErrors({ email: "", password: "", otp: "" });
    setError("");
    setNotice("");
  }

  function updateEmail(value: string) {
    setEmail(value);
    clearFieldError("email");
    setOtpSent(false);
    setOtp("");
    setError("");
    setNotice("");
  }

  async function handleRequestOtp() {
    const emailMessage = problemWith("email");
    setFieldErrors((current) => ({ ...current, email: emailMessage }));
    if (emailMessage) {
      setError(emailMessage);
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
    if (mode === "otp" && !otpSent) {
      await handleRequestOtp();
      return;
    }
    const found = {
      email: problemWith("email"),
      password: mode === "password" ? problemWith("password") : "",
      otp: mode === "otp" ? problemWith("otp") : "",
    };
    setFieldErrors(found);
    const problems = [found.email, found.password, found.otp].filter(Boolean);
    if (problems.length) {
      // One direct message at the top of the card: the first thing to fix.
      setError(problems[0]);
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

  const buttonText = mode === "password" ? "Log in" : otpSent ? "Verify & Log in" : "Send Email OTP";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <LinearGradient colors={["#bae6fd", "#e0f2fe", "#f8fcff"]} style={styles.backdrop} />
      <View style={styles.circleOne} />
      <View style={styles.circleTwo} />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/curvelead-logo-mark.png")} style={styles.logoMark} />
          </View>
          <Text style={styles.logoText}>curvelead</Text>
          <Text style={styles.tagline}>Turn every lead into a customer</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in with your password or a one-time email code.</Text>

          <View style={styles.segmented}>
            {(["password", "otp"] as const).map((value) => {
              const active = mode === value;
              return (
                <Pressable
                  key={value} accessibilityRole="tab" accessibilityState={{ selected: active }}
                  onPress={() => updateMode(value)} style={[styles.segmentButton, active && styles.segmentActive]}
                >
                  <Ionicons name={value === "password" ? "lock-closed-outline" : "mail-outline"} size={14} color={active ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value === "password" ? "Password" : "Email OTP"}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? <View style={[styles.message, styles.errorBox]}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
          {notice ? <View style={[styles.message, styles.noticeBox]}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text style={styles.noticeText}>{notice}</Text></View> : null}

          <Text style={styles.label}>Email address <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
            placeholder="you@company.com" accessibilityLabel="Email address" error={!!emailProblem}
            value={email} onChangeText={updateEmail} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} autoComplete="email" disabled={loading}
            left={<TextInput.Icon icon="email-outline" />}
            onFocus={() => scrollToField(220)}
          />
          {emailProblem ? <FieldError message={emailProblem} /> : null}

          {mode === "password" ? (
            <View>
              <Text style={styles.label}>Password <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
                placeholder="Enter your password" accessibilityLabel="Password" error={!!passwordProblem}
                value={password} onChangeText={(value) => { setPassword(value); clearFieldError("password"); setError(""); }}
                secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="current-password"
                returnKeyType="go" onSubmitEditing={handleSubmit} disabled={loading}
                left={<TextInput.Icon icon="lock-outline" />}
                right={<TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} onPress={() => setShowPassword((value) => !value)} forceTextInputFocus={false} />}
                onFocus={() => scrollToField(310)}
              />
              {passwordProblem ? <FieldError message={passwordProblem} /> : null}
              <Pressable onPress={() => router.push("/(auth)/forgot-password")} hitSlop={10} style={styles.forgotLinkWrap}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </Pressable>
            </View>
          ) : (
            <View>
              <Text style={styles.label}>One-time code <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
                placeholder="000000" accessibilityLabel="One-time code" error={!!otpProblem} value={otp}
                onChangeText={(value) => { setOtp(value.replace(/\D/g, "").slice(0, 6)); clearFieldError("otp"); setError(""); }}
                keyboardType="number-pad" maxLength={6} disabled={!otpSent || loading}
                returnKeyType="go" onSubmitEditing={handleSubmit}
                onFocus={() => scrollToField(310)}
                contentStyle={styles.otpInputContent}
              />
              {otpProblem ? <FieldError message={otpProblem} /> : !otpSent ? <Text style={styles.helper}>Tap "Send OTP" and we'll email you a 6-digit code.</Text> : null}
              <Pressable onPress={handleRequestOtp} disabled={loading || !email.trim()} hitSlop={10} style={styles.forgotLinkWrap}>
                <Text style={[styles.forgotLink, (loading || !email.trim()) && styles.mutedLink]}>{otpSent ? "Resend OTP" : "Send OTP"}</Text>
              </Pressable>
            </View>
          )}

          <Pressable onPress={handleSubmit} disabled={loading} style={[styles.buttonWrap, loading && { opacity: 0.8 }]}>
            <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
              {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="arrow-forward-circle" size={18} color="#fff" />}
              <Text style={styles.buttonLabel}>{buttonText}</Text>
            </LinearGradient>
          </Pressable>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>New to CurveLead? </Text>
            <Pressable onPress={() => router.push("/(auth)/signup")}><Text style={styles.signupLink}>Sign up free</Text></Pressable>
          </View>
        </View>

        <Text style={styles.terms}>
          By signing in you agree to our{" "}
          <Text style={styles.termsLink} onPress={() => router.push("/(auth)/terms")} accessibilityRole="link">Terms &amp; Conditions</Text>
        </Text>
        <Pressable onPress={() => Linking.openURL("mailto:support@curvelead.com").catch(() => {})} hitSlop={10} accessibilityRole="link">
          <Text style={styles.footerText}>Need help? <Text style={styles.footerLink}>Chat with us</Text></Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fcff" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  circleOne: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(14,165,233,0.12)", top: -70, right: -60 },
  circleTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(79,70,229,0.08)", top: 120, left: -60 },
  content: { flexGrow: 1, paddingBottom: 30 },
  hero: { alignItems: "center", justifyContent: "center", paddingTop: 54, paddingBottom: 18 },
  logoWrap: { width: 68, height: 68, borderRadius: 20, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "#0ea5e9", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  logoMark: { width: 50, height: 50, borderRadius: 13 },
  logoText: { color: "#0369a1", fontSize: 24, fontFamily: "DMSans_700Bold", letterSpacing: -0.6, marginTop: 10 },
  tagline: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  card: { marginHorizontal: 20, backgroundColor: "#ffffff", borderRadius: 22, padding: 16, shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  title: { color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  segmented: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 12, padding: 3, marginTop: 14, marginBottom: 12 },
  segmentButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 9 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  segmentTextActive: { color: colors.primary },
  message: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 8, marginBottom: 10 },
  errorBox: { backgroundColor: colors.dangerSoft },
  noticeBox: { backgroundColor: colors.successSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  noticeText: { flex: 1, color: colors.success, fontSize: 12, fontWeight: "600" },
  label: { color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  required: { color: colors.danger, fontFamily: "Inter_700Bold" },
  field: { backgroundColor: "#f8fbfd", marginBottom: 8, fontSize: 14 },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -4, marginBottom: 8 },
  fieldErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontFamily: "Inter_500Medium" },
  helper: { color: colors.textMuted, fontSize: 12, marginTop: -6, marginBottom: 6 },
  fieldOutline: { borderRadius: 12, borderColor: "#d7e6f1" },
  forgotLinkWrap: { alignSelf: "flex-end", marginTop: -2, marginBottom: 6 },
  forgotLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  mutedLink: { color: colors.textMuted },
  otpInputContent: { textAlign: "center", fontSize: 18, fontWeight: "800", letterSpacing: 8 },
  buttonWrap: { marginTop: 4 },
  button: { height: 46, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  signupRow: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
  signupPrompt: { color: colors.textSecondary, fontSize: 12 },
  signupLink: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  terms: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 22, paddingHorizontal: 30 },
  termsLink: { color: colors.primary, fontFamily: "Inter_700Bold", textDecorationLine: "underline" },
  footerText: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 14 },
  footerLink: { color: colors.primary, fontFamily: "Inter_700Bold" },
});
