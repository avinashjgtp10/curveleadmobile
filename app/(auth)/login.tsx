import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Image, KeyboardAvoidingView, Linking, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput as RNTextInput, View,
} from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

type LoginMode = "password" | "otp";

// The server answers "Route not found" (404) when it doesn't have the email-OTP routes, which isn't something the person did wrong.
const OTP_UNAVAILABLE = "Email OTP isn't available right now. Please log in with your password instead.";
function otpUnavailable(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/** Milliseconds the server wants us to wait after a 429 (0 when the error isn't a rate limit). */
function lockoutMs(error: unknown) {
  if (!axios.isAxiosError(error) || error.response?.status !== 429) return 0;
  const retryAfter = Number(error.response.headers?.["retry-after"]);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  const text = String(error.response.data?.error ?? "");
  const minutes = text.match(/(\d+)\s*minute/i);
  const seconds = text.match(/(\d+)\s*second/i);
  if (minutes) return Number(minutes[1]) * 60_000;
  if (seconds) return Number(seconds[1]) * 1000;
  return 60_000;
}

function formatWait(ms: number) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") {
    return error.response.data.error;
  }
  return fallback;
}

// The official four-colour Google "G".
function GoogleLogo({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityElementsHidden importantForAccessibility="no">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
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
  const otpInputRef = useRef<RNTextInput>(null);
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

  // After the server refuses with 429, the button counts down instead of inviting more attempts that would only extend the wait.
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const lockRemaining = Math.max(0, lockedUntil - now);
  useEffect(() => {
    if (!lockedUntil) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(0);
        setError("");
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  function applyLockout(error: unknown) {
    const wait = lockoutMs(error);
    if (wait > 0) {
      setNow(Date.now());
      setLockedUntil(Date.now() + wait);
    }
  }

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
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (requestError) {
      applyLockout(requestError);
      setError(otpUnavailable(requestError) ? OTP_UNAVAILABLE : getErrorMessage(requestError, "Could not send OTP."));
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (lockRemaining > 0) return;
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
      applyLockout(loginError);
      setError(mode === "otp" && otpUnavailable(loginError) ? OTP_UNAVAILABLE : getErrorMessage(loginError, mode === "password" ? "Login failed." : "Invalid or expired OTP."));
    } finally {
      setLoading(false);
    }
  }

  function comingSoon(provider: string) {
    setError("");
    setNotice(`${provider} sign-in is coming soon. Please use your email for now.`);
  }

  const buttonText = mode === "password" ? "Log in" : otpSent ? "Verify & Log in" : "Send Email OTP";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={styles.shape} pointerEvents="none" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View style={styles.logoTile}>
            <Image source={require("../../assets/curvelead-logo-mark.png")} style={styles.logoMark} />
          </View>
          <Text style={styles.logoText}>curvelead</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>{mode === "password" ? "Sign in to your Curvelead account" : "Sign in with a one-time code sent to your email."}</Text>

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
            style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={NAVY}
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
                style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={NAVY}
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
              <View style={styles.otpLabelRow}>
                <Text style={styles.label}>One-time code <Text style={styles.required}>*</Text></Text>
                <Pressable onPress={handleRequestOtp} disabled={loading || !email.trim() || lockRemaining > 0} hitSlop={10}>
                  <Text style={[styles.forgotLink, (loading || !email.trim()) && styles.mutedLink]}>{otpSent ? "Resend OTP" : "Send OTP"}</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => otpInputRef.current?.focus()} style={styles.otpRow} accessibilityLabel="One-time code">
                {Array.from({ length: 6 }).map((_, i) => (
                  <View key={i} style={[styles.otpBox, otp.length === i && otpSent && styles.otpBoxActive, !!otpProblem && styles.otpBoxError]}>
                    <Text style={styles.otpDigit}>{otp[i] ?? ""}</Text>
                  </View>
                ))}
                <RNTextInput
                  ref={otpInputRef} value={otp} editable={otpSent && !loading}
                  onChangeText={(value) => { setOtp(value.replace(/\D/g, "").slice(0, 6)); clearFieldError("otp"); setError(""); }}
                  keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="sms-otp"
                  returnKeyType="go" onSubmitEditing={handleSubmit} onFocus={() => scrollToField(310)}
                  style={styles.otpHidden}
                />
              </Pressable>
              {otpProblem ? <FieldError message={otpProblem} /> : <Text style={styles.helper}>Tap "Send OTP" and we'll email you a 6-digit code.</Text>}
            </View>
          )}

          <Pressable onPress={handleSubmit} disabled={loading || lockRemaining > 0} style={[styles.button, (loading || lockRemaining > 0) && { opacity: 0.6 }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
            <Text style={styles.buttonLabel}>{lockRemaining > 0 ? `Try again in ${formatWait(lockRemaining)}` : buttonText}</Text>
            {!loading && lockRemaining === 0 ?<Ionicons name="arrow-forward" size={16} color="#fff" /> : null}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.socialRow}>
            <Pressable style={styles.socialButton} onPress={() => comingSoon("Google")} accessibilityRole="button" accessibilityLabel="Continue with Google">
              <GoogleLogo size={18} />
              <Text style={styles.socialText}>Google</Text>
            </Pressable>
            <Pressable style={styles.socialButton} onPress={() => comingSoon("Apple")} accessibilityRole="button" accessibilityLabel="Continue with Apple">
              <Ionicons name="logo-apple" size={18} color="#0f172a" />
              <Text style={styles.socialText}>Apple</Text>
            </Pressable>
          </View>

          <View style={styles.signupRow}>
            <Text style={styles.signupPrompt}>New to Curvelead? </Text>
            <Pressable onPress={() => Linking.openURL("https://curvelead.com/signup").catch(() => setError("Couldn't open the sign-up page. Please try again."))} accessibilityRole="link"><Text style={styles.signupLink}>Sign up free</Text></Pressable>
          </View>
        </View>

        <Text style={styles.terms}>
          By continuing you agree to our{" "}
          <Text style={styles.termsLink} onPress={() => Linking.openURL("https://curvelead.com/terms-of-service").catch(() => {})} accessibilityRole="link">Terms &amp; Conditions</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const NAVY = "#1d4ed8";
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#eef1fa" },
  shape: { position: "absolute", top: 0, right: 0, width: 190, height: 150, backgroundColor: "#dfe7fb", borderBottomLeftRadius: 90 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  logoTile: { width: 34, height: 34, borderRadius: 9, backgroundColor: "#12286b", alignItems: "center", justifyContent: "center" },
  logoMark: { width: 22, height: 22, borderRadius: 6 },
  logoText: { color: "#0f172a", fontSize: 20, fontFamily: "DMSans_700Bold", letterSpacing: -0.5 },
  card: { backgroundColor: "transparent" },
  title: { color: "#0f172a", fontSize: 24, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4, marginBottom: 18 },
  segmented: { flexDirection: "row", gap: 8, marginBottom: 14 },
  segmentButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 10, backgroundColor: "#e6eaf5", borderWidth: 1, borderColor: "transparent" },
  segmentActive: { borderColor: "#c7d2ea", backgroundColor: "#ffffff" },
  segmentText: { color: colors.textSecondary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  segmentTextActive: { color: "#0f172a" },
  message: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 8, marginBottom: 10 },
  errorBox: { backgroundColor: colors.dangerSoft },
  noticeBox: { backgroundColor: colors.successSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  noticeText: { flex: 1, color: colors.success, fontSize: 12, fontWeight: "600" },
  label: { color: "#0f172a", fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 5 },
  required: { color: colors.danger, fontFamily: "Inter_700Bold" },
  field: { backgroundColor: "#ffffff", marginBottom: 12, fontSize: 14 },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -6, marginBottom: 8 },
  fieldErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontFamily: "Inter_500Medium" },
  helper: { color: colors.textMuted, fontSize: 12, marginTop: -6, marginBottom: 6 },
  fieldOutline: { borderRadius: 10, borderColor: "#dbe3f1" },
  forgotLinkWrap: { alignSelf: "flex-end", marginBottom: 12 },
  forgotLink: { color: NAVY, fontSize: 12, fontWeight: "700" },
  mutedLink: { color: colors.textMuted },
  otpLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  otpRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  otpBox: { width: 44, height: 46, borderRadius: 10, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe3f1", alignItems: "center", justifyContent: "center" },
  otpBoxActive: { borderColor: NAVY, borderWidth: 1.5 },
  otpBoxError: { borderColor: colors.danger },
  otpDigit: { color: "#0f172a", fontSize: 18, fontFamily: "Inter_700Bold" },
  otpHidden: { position: "absolute", width: "100%", height: "100%", opacity: 0 },
  otpInputContent: { textAlign: "center", fontSize: 18, fontWeight: "800", letterSpacing: 8 },
  button: { height: 46, borderRadius: 10, backgroundColor: NAVY, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontFamily: "Inter_700Bold" },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#dbe3f1" },
  dividerText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_500Medium" },
  socialRow: { flexDirection: "row", gap: 10 },
  socialButton: { flex: 1, height: 42, borderRadius: 10, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dbe3f1", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  socialText: { color: "#0f172a", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  signupRow: { flexDirection: "row", justifyContent: "center", marginTop: 18 },
  signupPrompt: { color: colors.textSecondary, fontSize: 12 },
  signupLink: { color: NAVY, fontSize: 12, fontWeight: "800" },
  terms: { color: colors.textMuted, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 28, paddingHorizontal: 20 },
  termsLink: { color: NAVY, fontFamily: "Inter_700Bold" },
});
