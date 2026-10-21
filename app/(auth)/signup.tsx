import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { ActivityIndicator, TextInput } from "react-native-paper";
import axios from "axios";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors } from "@/theme";

const BUSINESS_TYPES: { id: string; icon: string; name: string; desc: string }[] = [
  { id: "lead_management", icon: "🎯", name: "Lead Management", desc: "Agencies, freelancers, sales" },
  { id: "real_estate", icon: "🏠", name: "Real Estate", desc: "Agents, brokers" },
  { id: "salon", icon: "💇", name: "Salon / Spa", desc: "Beauty businesses" },
  { id: "gym", icon: "💪", name: "Gym / Fitness", desc: "Studios, trainers" },
  { id: "clinic", icon: "🏥", name: "Clinic / Doctor", desc: "Medical practices" },
  { id: "other", icon: "✨", name: "Other", desc: "Any lead-based business" },
];

type FieldKey = "businessName" | "name" | "email" | "phone" | "password";
type FieldErrors = Partial<Record<FieldKey, string>>;

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.error === "string") return error.response.data.error;
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

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signup } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState({ businessType: "", businessName: "", name: "", email: "", phone: "", password: "" });

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError("");
  }

  function goBack() {
    if (step === 2) { setStep(1); setError(""); return; }
    if (router.canGoBack()) router.back(); else router.replace("/(auth)/login");
  }

  async function handleSubmit() {
    const errors: FieldErrors = {};
    if (!form.businessName.trim()) errors.businessName = "Business name is required";
    if (!form.name.trim()) errors.name = "Your name is required";
    if (!form.email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address";
    if (form.phone.trim() && form.phone.replace(/\D/g, "").length < 3) errors.phone = "Enter a valid phone number (at least 3 digits)";
    if (!form.password) errors.password = "Password is required";
    else if (form.password.length < 6) errors.password = "Password must be at least 6 characters";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true); setError("");
    try {
      await signup({
        businessType: form.businessType, businessName: form.businessName.trim(), name: form.name.trim(),
        email: form.email.trim(), phone: form.phone.trim() || undefined, password: form.password,
      });
      router.replace("/(app)");
    } catch (signupError) {
      setError(getErrorMessage(signupError, "Signup failed."));
    } finally { setLoading(false); }
  }

  const textField = (field: FieldKey, label: string, props: Partial<React.ComponentProps<typeof TextInput>> = {}, required = false) => (
    <View>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <TextInput
        style={styles.field} dense mode="outlined" outlineStyle={styles.fieldOutline} activeOutlineColor={colors.primary}
        accessibilityLabel={label} error={!!fieldErrors[field]} value={form[field]}
        onChangeText={(value) => updateField(field, value)} disabled={loading} {...props}
      />
      {fieldErrors[field] ? <FieldError message={fieldErrors[field] as string} /> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <LinearGradient colors={["#bae6fd", "#e0f2fe", "#f8fcff"]} style={styles.backdrop} />
      <View style={styles.circleOne} />
      <View style={styles.circleTwo} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={goBack} hitSlop={10} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/curvelead-logo-mark.png")} style={styles.logoMark} />
          </View>
          <Text style={styles.logoText}>curvelead</Text>
        </View>

        <View style={styles.steps}>
          <View style={[styles.stepDot, styles.stepDotActive]}>
            {step > 1 ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={styles.stepDotTextActive}>1</Text>}
          </View>
          <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
          <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]}>
            <Text style={step >= 2 ? styles.stepDotTextActive : styles.stepDotText}>2</Text>
          </View>
        </View>

        <View style={styles.card}>
          {error ? <View style={styles.errorBox}><Ionicons name="alert-circle" size={16} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}

          {step === 1 ? (
            <>
              <Text style={styles.title}>Welcome to CurveLead</Text>
              <Text style={styles.subtitle}>Let&apos;s set up your business</Text>

              <View style={styles.typeList}>
                {BUSINESS_TYPES.map((item) => {
                  const active = form.businessType === item.id;
                  return (
                    <Pressable
                      key={item.id} onPress={() => updateField("businessType", item.id)}
                      accessibilityRole="radio" accessibilityState={{ selected: active }}
                      style={[styles.typeCard, active && styles.typeCardActive]}
                    >
                      <Text style={styles.typeIcon}>{item.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.typeName}>{item.name}</Text>
                        <Text style={styles.typeDesc}>{item.desc}</Text>
                      </View>
                      {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              <Pressable onPress={() => setStep(2)} disabled={!form.businessType} style={[styles.buttonWrap, !form.businessType && { opacity: 0.45 }]}>
                <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
                  <Text style={styles.buttonLabel}>Continue</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </LinearGradient>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Create your business account</Text>
              <Text style={styles.subtitle}>14-day free trial. No credit card required.</Text>

              <View style={{ marginTop: 14 }}>
                {textField("businessName", "Business Name", { autoCapitalize: "words" }, true)}
                {textField("name", "Your Name", { autoCapitalize: "words", autoComplete: "name" }, true)}
                {textField("email", "Email", { keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false, autoComplete: "email" }, true)}
                {textField("phone", "Phone", { keyboardType: "phone-pad", autoComplete: "tel" })}
                {textField("password", "Password", {
                  secureTextEntry: !showPassword, autoCapitalize: "none", autoComplete: "new-password",
                  returnKeyType: "go", onSubmitEditing: handleSubmit,
                  right: <TextInput.Icon icon={showPassword ? "eye-off-outline" : "eye-outline"} onPress={() => setShowPassword((value) => !value)} forceTextInputFocus={false} />,
                }, true)}
              </View>

              <Pressable onPress={handleSubmit} disabled={loading} style={[styles.buttonWrap, loading && { opacity: 0.8 }]}>
                <LinearGradient colors={["#38bdf8", "#0ea5e9", "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.button}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : null}
                  <Text style={styles.buttonLabel}>{loading ? "Creating..." : "Create Business Account"}</Text>
                  {!loading ? <Ionicons name="arrow-forward" size={18} color="#fff" /> : null}
                </LinearGradient>
              </Pressable>
            </>
          )}

          <View style={styles.signinRow}>
            <Text style={styles.signinPrompt}>Already have an account? </Text>
            <Pressable onPress={() => router.replace("/(auth)/login")}><Text style={styles.signinLink}>Sign in</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fcff" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, height: 380 },
  circleOne: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(14,165,233,0.12)", top: -70, right: -60 },
  circleTwo: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(79,70,229,0.08)", top: 120, left: -60 },
  content: { flexGrow: 1 },
  backButton: { marginLeft: 16, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  hero: { alignItems: "center", paddingTop: 4, paddingBottom: 12 },
  logoWrap: { width: 60, height: 60, borderRadius: 18, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", shadowColor: "#0ea5e9", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  logoMark: { width: 44, height: 44, borderRadius: 12 },
  logoText: { color: "#0369a1", fontSize: 22, fontFamily: "DMSans_700Bold", letterSpacing: -0.6, marginTop: 8 },

  steps: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 14 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#e5e7eb", alignItems: "center", justifyContent: "center" },
  stepDotActive: { backgroundColor: "#0ea5e9" },
  stepDotText: { color: "#9ca3af", fontSize: 12, fontWeight: "800" },
  stepDotTextActive: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  stepLine: { width: 44, height: 2, backgroundColor: "#e5e7eb" },
  stepLineActive: { backgroundColor: "#0ea5e9" },

  card: { marginHorizontal: 20, backgroundColor: "#ffffff", borderRadius: 22, padding: 16, shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  title: { color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginTop: 2 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, padding: 8, marginBottom: 10, backgroundColor: colors.dangerSoft },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  typeList: { gap: 10, marginTop: 14 },
  typeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: "#e5e7eb", backgroundColor: "#ffffff" },
  typeCardActive: { borderColor: "#0ea5e9", backgroundColor: "#f0f9ff" },
  typeIcon: { fontSize: 24 },
  typeName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  typeDesc: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },

  label: { color: colors.text, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  required: { color: colors.danger, fontFamily: "Inter_700Bold" },
  field: { backgroundColor: "#f8fbfd", marginBottom: 8, fontSize: 14 },
  fieldOutline: { borderRadius: 12, borderColor: "#d7e6f1" },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -4, marginBottom: 8 },
  fieldErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontFamily: "Inter_500Medium" },

  buttonWrap: { marginTop: 14 },
  button: { height: 48, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonLabel: { color: "#ffffff", fontSize: 15, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },
  signinRow: { flexDirection: "row", justifyContent: "center", marginTop: 16 },
  signinPrompt: { color: colors.textSecondary, fontSize: 12 },
  signinLink: { color: colors.primary, fontSize: 12, fontWeight: "800" },
});
