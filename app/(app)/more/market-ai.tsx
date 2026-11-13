import { PlaceholderScreen } from "@/components/PlaceholderScreen";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { apiClient } from "@/api/client";


// The add forms' palette: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const CARD = { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cfe3f1", borderRadius: 16 } as const;
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#d6334f", redSoft: "#fdecef", amber: "#c2710c", amberSoft: "#fde9c9", green: "#0f7b5f", greenSoft: "#d8f0e5", track: "#e4ecf3" };
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

// A plain white box like the Add lead form's fields. The multi-line one shows its whole placeholder.
function TextBox({ value, onChangeText, placeholder, multiline = false, error = false }: {
  value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; error?: boolean;
}) {
  return (
    <View style={[styles.textBox, multiline && styles.textBoxMulti, error && styles.fieldErrorBorder]}>
      <RNTextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={UI.muted}
        multiline={multiline} textAlignVertical={multiline ? "top" : "center"} style={[styles.textBoxInput, multiline && styles.textBoxInputMulti]}
      />
    </View>
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
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={UI.muted} />
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
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Market Intelligence</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="globe-outline" size={22} color={UI.teal} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Market Intelligence</Text>
            <Text style={styles.subtitle}>AI-powered competitor & market analysis for your business</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles-outline" size={18} color={UI.teal} />
            <Text style={styles.cardTitle}>Tell us about your business</Text>
          </View>

          <FieldLabel>Business Name</FieldLabel>
          <TextBox value={businessName} onChangeText={setBusinessName} placeholder="e.g. CurveLead" />

          <SelectField
            label="Industry"
            required
            value={industry}
            options={INDUSTRIES}
            error={errors.industry}
            onChange={(value) => { setIndustry(value); setErrors((current) => ({ ...current, industry: undefined })); }}
          />

          <FieldLabel required>Product / Service</FieldLabel>
          <TextBox
            value={productService}
            onChangeText={(value) => { setProductService(value); setErrors((current) => ({ ...current, productService: undefined })); }}
            placeholder="e.g. Lead management CRM with AI scoring and WhatsApp integration"
            multiline
            error={!!errors.productService}
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
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16 },
  hero: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#e0e7ff", alignItems: "center", justifyContent: "center" },
  title: { color: UI.ink, fontSize: 20, fontFamily: "DMSans_700Bold" },
  subtitle: { color: UI.sub, fontSize: 12, marginTop: 2, lineHeight: 17 },
  card: { ...CARD, backgroundColor: "#ffffff", borderColor: UI.line, padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  cardTitle: { color: UI.ink, fontSize: 15, fontFamily: "Inter_700Bold" },
  fieldBlock: { marginBottom: 12 },
  label: { color: UI.sub, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 7, marginTop: 2 },
  required: { color: UI.red },
  textBox: { minHeight: 48, borderWidth: 1, borderColor: UI.line, borderRadius: 10, backgroundColor: "#ffffff", paddingHorizontal: 13, justifyContent: "center", marginBottom: 12 },
  textBoxMulti: { minHeight: 100, paddingVertical: 8, justifyContent: "flex-start" },
  textBoxInput: { color: UI.ink, fontSize: 14, paddingVertical: 12 },
  textBoxInputMulti: { minHeight: 80, paddingVertical: 4 },
  selectBox: { height: 48, borderWidth: 1, borderColor: UI.line, borderRadius: 10, backgroundColor: "#ffffff", paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  selectBoxOpen: { borderColor: UI.teal, borderWidth: 2 },
  fieldErrorBorder: { borderColor: UI.red },
  selectText: { flex: 1, color: UI.ink, fontSize: 14, fontFamily: "Inter_500Medium" },
  placeholderText: { color: UI.muted },
  dropdownList: { maxHeight: 240, backgroundColor: "#ffffff", borderWidth: 1, borderColor: UI.line, borderRadius: 8, marginTop: 4, overflow: "hidden", shadowColor: UI.ink, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
  dropdownScroll: { maxHeight: 240 },
  dropdownOption: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: UI.line },
  dropdownOptionText: { color: UI.ink, fontSize: 13, fontFamily: "Inter_500Medium" },
  dropdownPlaceholder: { color: UI.muted, fontSize: 13, fontFamily: "Inter_500Medium" },
  inlineError: { color: UI.red, fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4, marginBottom: 8 },
  generateButton: { height: 48, borderRadius: 10, backgroundColor: UI.teal, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  generateButtonDisabled: { opacity: 0.72 },
  generateText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  poweredText: { color: UI.muted, fontSize: 10, textAlign: "center", marginTop: 12 },
  resultCard: { ...CARD, backgroundColor: "#ffffff", borderColor: UI.line, padding: 16, marginBottom: 16 },
  resultTitle: { color: UI.ink, fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 8 },
  resultSummary: { color: UI.sub, fontSize: 13, lineHeight: 19 },
  resultSection: { marginTop: 14 },
  resultSectionTitle: { color: UI.ink, fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 6 },
  resultBullet: { color: UI.sub, fontSize: 12, lineHeight: 18, marginBottom: 4 },
});
