import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import { glass } from "@/components/Glass";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { apiClient } from "@/api/client";

const INDUSTRIES = ["CRM & Sales Software", "Real Estate", "EdTech", "FinTech", "HealthTech", "E-Commerce", "Salon & Spa", "Retail", "SaaS", "Other"];
const GEOGRAPHIES = ["India", "United States", "United Kingdom", "UAE", "Singapore", "Global"];
const CUSTOMERS = ["SMBs", "Enterprises", "Startups", "Local customers", "Students", "Consumers"];

interface AnalysisResult {
  summary?: string;
  competitors?: string[];
  opportunities?: string[];
  positioning?: string[];
}

async function generateMarketAnalysis(input: {
  business_name: string;
  industry: string;
  product_service: string;
  target_geography: string;
  target_customers: string;
}) {
  const { data } = await apiClient.post<AnalysisResult>("/ai/market-analysis", input, { timeout: 60000 });
  return data;
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {children}{required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

function SelectField({ label, value, options, onChange, required = false, error }: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldBlock}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <Pressable style={[styles.selectBox, open && styles.selectBoxOpen, error && styles.fieldErrorBorder]} onPress={() => setOpen((current) => !current)}>
        <Text style={[styles.selectText, !value && styles.placeholderText]} numberOfLines={1}>{value || `Select ${label.toLowerCase()}...`}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.dropdownList}>
          <ScrollView nestedScrollEnabled persistentScrollbar showsVerticalScrollIndicator style={styles.dropdownScroll}>
            <Pressable style={styles.dropdownOption} onPress={() => { onChange(""); setOpen(false); }}>
              <Text style={styles.dropdownPlaceholder}>Select {label.toLowerCase()}...</Text>
            </Pressable>
            {options.map((option) => (
              <Pressable key={option} style={styles.dropdownOption} onPress={() => { onChange(option); setOpen(false); }}>
                <Text style={styles.dropdownOptionText}>{option}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  );
}

function MarketIntelligenceContent() {
  const insets = useSafeAreaInsets();
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [productService, setProductService] = useState("");
  const [geography, setGeography] = useState("India");
  const [customers, setCustomers] = useState("SMBs");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errors, setErrors] = useState<{ industry?: string; productService?: string }>({});

  async function handleGenerate() {
    const nextErrors = {
      industry: !industry ? "Select an industry." : undefined,
      productService: !productService.trim() ? "Enter your product or service." : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.industry || nextErrors.productService) {
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const analysis = await generateMarketAnalysis({
        business_name: businessName.trim(),
        industry,
        product_service: productService.trim(),
        target_geography: geography,
        target_customers: customers,
      });
      setResult(analysis);
    } catch {
      setResult({
        summary: "Market analysis request is ready. Connect the AI market-analysis backend to show generated competitor insights here.",
        opportunities: ["Refine your offer for the selected customer segment.", "Compare pricing, positioning, and lead channels in your target geography."],
        positioning: ["Use WhatsApp follow-ups, AI lead scoring, and faster response time as differentiators."],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Market Intelligence" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="globe-outline" size={22} color="#4f46e5" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Market Intelligence</Text>
            <Text style={styles.subtitle}>AI-powered competitor & market analysis for your business</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles-outline" size={18} color="#4f46e5" />
            <Text style={styles.cardTitle}>Tell us about your business</Text>
          </View>

          <FieldLabel>Business Name</FieldLabel>
          <TextInput mode="outlined" value={businessName} onChangeText={setBusinessName} placeholder="e.g. CurveLead" style={styles.input} />

          <SelectField
            label="Industry"
            required
            value={industry}
            options={INDUSTRIES}
            error={errors.industry}
            onChange={(value) => { setIndustry(value); setErrors((current) => ({ ...current, industry: undefined })); }}
          />

          <FieldLabel required>Product / Service</FieldLabel>
          <TextInput
            mode="outlined"
            value={productService}
            onChangeText={(value) => { setProductService(value); setErrors((current) => ({ ...current, productService: undefined })); }}
            placeholder="e.g. Lead management CRM with AI scoring and WhatsApp integration"
            style={[styles.input, errors.productService && styles.inputWithError]}
            error={!!errors.productService}
            multiline
          />
          {errors.productService ? <Text style={styles.inlineError}>{errors.productService}</Text> : null}

          <SelectField label="Target Geography" value={geography} options={GEOGRAPHIES} onChange={setGeography} />
          <SelectField label="Target Customers" value={customers} options={CUSTOMERS} onChange={setCustomers} />

          <Pressable style={[styles.generateButton, loading && styles.generateButtonDisabled]} onPress={handleGenerate} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles-outline" size={17} color="#fff" />}
            <Text style={styles.generateText}>{loading ? "Generating..." : "Generate Market Analysis"}</Text>
          </Pressable>
          <Text style={styles.poweredText}>Powered by AI - based on training data, not real-time research</Text>
        </View>

        {result ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Analysis</Text>
            {result.summary ? <Text style={styles.resultSummary}>{result.summary}</Text> : null}
            {[
              ["Competitors", result.competitors],
              ["Opportunities", result.opportunities],
              ["Positioning", result.positioning],
            ].map(([title, rows]) => Array.isArray(rows) && rows.length ? (
              <View key={title as string} style={styles.resultSection}>
                <Text style={styles.resultSectionTitle}>{title as string}</Text>
                {rows.map((row) => <Text key={row} style={styles.resultBullet}>- {row}</Text>)}
              </View>
            ) : null)}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function MarketAiScreen() {
  return <MarketIntelligenceContent />;
  return (
    <PlaceholderScreen
      showBack
      icon="🌐"
      title="Market AI"
      description="AI-powered market and competitor insights for your business."
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  header: { backgroundColor: colors.surface },
  headerTitle: { color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 16 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#e0e7ff", alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
  card: { ...glass, backgroundColor: colors.surface, borderColor: colors.borderSoft, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  cardTitle: { color: colors.text, fontSize: 15, fontFamily: "Inter_700Bold" },
  fieldBlock: { marginBottom: 12 },
  label: { color: colors.textSecondary, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 7, marginTop: 2 },
  required: { color: colors.danger },
  input: { backgroundColor: colors.surface, marginBottom: 12 },
  inputWithError: { marginBottom: 4 },
  selectBox: { height: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectBoxOpen: { borderColor: "#818cf8", borderWidth: 2 },
  fieldErrorBorder: { borderColor: colors.danger },
  selectText: { flex: 1, color: colors.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  placeholderText: { color: colors.textMuted },
  dropdownList: { maxHeight: 240, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 8, marginTop: 4, overflow: "hidden", shadowColor: colors.text, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  dropdownScroll: { maxHeight: 240 },
  dropdownOption: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  dropdownOptionText: { color: colors.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  dropdownPlaceholder: { color: colors.textMuted, fontSize: 13, fontFamily: "Inter_500Medium" },
  inlineError: { color: colors.danger, fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4, marginBottom: 8 },
  generateButton: { height: 48, borderRadius: 10, backgroundColor: "#4f46e5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  generateButtonDisabled: { opacity: 0.72 },
  generateText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  poweredText: { color: colors.textMuted, fontSize: 10, textAlign: "center", marginTop: 12 },
  resultCard: { ...glass, backgroundColor: colors.surface, borderColor: colors.borderSoft, padding: 16, marginBottom: 16 },
  resultTitle: { color: colors.text, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSummary: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  resultSection: { marginTop: 14 },
  resultSectionTitle: { color: colors.text, fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 6 },
  resultBullet: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 4 },
});
