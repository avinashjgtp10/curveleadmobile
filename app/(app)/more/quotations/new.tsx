import React, { useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View,
} from "react-native";
import { ActivityIndicator, Appbar, Text, TextInput } from "react-native-paper";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { createQuotation, CreateQuotationInput, Quotation, QuotationItem, sendQuotation } from "@/api/quotations";
import { fetchLeads, LeadListItem } from "@/api/leads";

const VALID_UNTIL_OPTIONS = [
  { key: "none", label: "No expiry", days: null as number | null },
  { key: "3d", label: "3 days", days: 3 },
  { key: "1w", label: "1 week", days: 7 },
  { key: "2w", label: "2 weeks", days: 14 },
  { key: "1m", label: "1 month", days: 30 },
];
const DISCOUNT_PRESETS = ["0", "5", "10", "15", "20"];
const TAX_PRESETS = ["0", "5", "12", "18", "28"];

function emptyItem(): QuotationItem { return { name: "", quantity: 1, price: 0 }; }

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function PresetRow({ presets, value, onSelect }: { presets: string[]; value: string; onSelect: (value: string) => void }) {
  return (
    <View style={styles.presetRow}>
      {presets.map((preset) => {
        const active = (value || "0") === preset;
        return (
          <Pressable key={preset} onPress={() => onSelect(preset)} style={[styles.presetChip, active && styles.presetChipActive]}>
            <Text style={[styles.presetText, active && styles.presetTextActive]}>{preset}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NewQuotationScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: "none" } });
      return () => parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) });
    }, [navigation, insets.bottom])
  );
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([emptyItem()]);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [taxPercent, setTaxPercent] = useState("18");
  const [validUntilDays, setValidUntilDays] = useState<number | null>(30);
  const [terms, setTerms] = useState("50% advance, balance on delivery.");
  const [notes, setNotes] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const saving = savingDraft || sending;

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try { setLeadResults((await fetchLeads({ search: leadQuery.trim(), limit: 6 })).leads); } catch { /* best-effort */ }
      setSearching(false);
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery]);

  function updateItem(index: number, patch: Partial<QuotationItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function removeItem(index: number) {
    setItems((current) => current.length > 1 ? current.filter((_, i) => i !== index) : current);
  }

  const subtotal = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
  const discountAmount = (subtotal * (Number(discountPercent) || 0)) / 100;
  const taxAmount = ((subtotal - discountAmount) * (Number(taxPercent) || 0)) / 100;
  const total = subtotal - discountAmount + taxAmount;
  const optionsSummary = `GST ${taxPercent || 0}%${Number(discountPercent) ? ` · ${discountPercent}% off` : ""}${validUntilDays ? ` · valid ${validUntilDays}d` : ""}`;

  function buildInput(): CreateQuotationInput | null {
    if (!selectedLead) { setError("Search and select a customer first."); return null; }
    const validItems = items.filter((item) => item.name.trim());
    if (!validItems.length) { setError("Add at least one item with a name."); return null; }
    if (validItems.some((item) => !(Number(item.quantity) > 0))) { setError("Quantity must be greater than 0."); return null; }
    if (validItems.some((item) => !(Number(item.price) > 0))) { setError("Enter a price for every item."); return null; }
    const validUntil = validUntilDays ? new Date(Date.now() + validUntilDays * 86400000).toISOString().slice(0, 10) : undefined;
    return {
      lead_id: selectedLead.id,
      title: title.trim() || undefined,
      items: validItems,
      discount_percent: Number(discountPercent) || 0,
      tax_percent: Number(taxPercent) || 0,
      valid_until: validUntil,
      terms: terms.trim() || undefined,
      notes: notes.trim() || undefined,
    };
  }

  async function saveDraft() {
    const input = buildInput();
    if (!input) return;
    setSavingDraft(true); setError("");
    try {
      const quotation = await createQuotation(input);
      router.replace(`/(app)/more/quotations/${quotation.id}`);
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not create this quotation."));
    } finally { setSavingDraft(false); }
  }

  async function saveAndSend() {
    const input = buildInput();
    if (!input) return;
    setSending(true); setError("");
    let quotation: Quotation | null = null;
    try {
      quotation = await createQuotation(input);
    } catch (saveError) {
      setError(errorMessage(saveError, "Could not create this quotation."));
      setSending(false);
      return;
    }
    try {
      const { whatsapp_url } = await sendQuotation(quotation.id);
      if (whatsapp_url) await Linking.openURL(whatsapp_url);
    } catch (sendError) {
      Alert.alert("Created, but couldn't send", errorMessage(sendError, "The quotation was saved as a draft — you can send it from its detail page."));
    } finally {
      setSending(false);
      router.replace(`/(app)/more/quotations/${quotation.id}`);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New Quotation" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Customer</Text>
        {selectedLead ? (
          <View style={styles.selectedLead}>
            <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{(selectedLead.name.charAt(0) || "?").toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectedLeadName} numberOfLines={1}>{selectedLead.name}</Text>
              <Text style={styles.selectedLeadPhone} numberOfLines={1}>{selectedLead.phone}</Text>
            </View>
            <Pressable onPress={() => setSelectedLead(null)} hitSlop={8} style={styles.changeButton}>
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                mode="flat"
                value={leadQuery}
                onChangeText={setLeadQuery}
                placeholder="Search customer by name or phone"
                underlineColor="transparent"
                activeUnderlineColor="transparent"
                style={styles.searchField}
                dense
              />
              {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
            {leadResults.length ? (
              <View style={styles.suggestions}>
                {leadResults.map((lead, index) => (
                  <Pressable
                    key={lead.id}
                    style={[styles.suggestionRow, index < leadResults.length - 1 && styles.suggestionDivider]}
                    onPress={() => { setSelectedLead(lead); setLeadResults([]); setLeadQuery(""); }}
                  >
                    <View style={styles.leadAvatar}><Text style={styles.leadAvatarText}>{(lead.name.charAt(0) || "?").toUpperCase()}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionName} numberOfLines={1}>{lead.name}</Text>
                      <Text style={styles.suggestionPhone} numberOfLines={1}>{lead.phone}</Text>
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.sectionLabel}>Items</Text>
        {items.map((item, index) => {
          const lineTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);
          return (
            <View key={index} style={styles.itemCard}>
              <View style={styles.itemTop}>
                <TextInput mode="outlined" dense value={item.name} onChangeText={(value) => updateItem(index, { name: value })} placeholder="Item or service name" style={styles.itemName} outlineStyle={styles.fieldOutline} />
                {items.length > 1 ? (
                  <Pressable onPress={() => removeItem(index)} hitSlop={8} style={styles.removeButton}>
                    <Ionicons name="close" size={18} color={colors.danger} />
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.itemBottom}>
                <View style={styles.stepper}>
                  <Pressable style={styles.stepperButton} onPress={() => updateItem(index, { quantity: Math.max(1, (Number(item.quantity) || 1) - 1) })}>
                    <Ionicons name="remove" size={18} color={colors.text} />
                  </Pressable>
                  <Text style={styles.stepperValue}>{item.quantity}</Text>
                  <Pressable style={styles.stepperButton} onPress={() => updateItem(index, { quantity: (Number(item.quantity) || 0) + 1 })}>
                    <Ionicons name="add" size={18} color={colors.text} />
                  </Pressable>
                </View>
                <TextInput
                  mode="outlined"
                  dense
                  value={item.price ? String(item.price) : ""}
                  onChangeText={(value) => updateItem(index, { price: Number(value.replace(/[^\d.]/g, "")) || 0 })}
                  placeholder="Price"
                  keyboardType="decimal-pad"
                  left={<TextInput.Affix text="₹" />}
                  style={styles.priceField}
                  outlineStyle={styles.fieldOutline}
                />
                <Text style={styles.lineTotal}>{money(lineTotal)}</Text>
              </View>
            </View>
          );
        })}
        <Pressable style={styles.addItemButton} onPress={() => setItems((current) => [...current, emptyItem()])}>
          <Ionicons name="add" size={18} color={colors.primary} />
          <Text style={styles.addItemText}>Add another item</Text>
        </Pressable>

        <Pressable style={styles.moreHeader} onPress={() => setMoreOpen((open) => !open)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.moreTitle}>More options</Text>
            <Text style={styles.moreSummary} numberOfLines={1}>{optionsSummary}</Text>
          </View>
          <Ionicons name={moreOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
        </Pressable>
        {moreOpen ? (
          <View style={styles.moreBody}>
            <Text style={styles.miniLabel}>Title</Text>
            <TextInput mode="outlined" dense value={title} onChangeText={setTitle} placeholder="e.g. Bridal makeup package" style={styles.plainField} outlineStyle={styles.fieldOutline} />
            <Text style={styles.miniLabel}>Discount</Text>
            <PresetRow presets={DISCOUNT_PRESETS} value={discountPercent} onSelect={setDiscountPercent} />
            <Text style={styles.miniLabel}>Tax (GST)</Text>
            <PresetRow presets={TAX_PRESETS} value={taxPercent} onSelect={setTaxPercent} />
            <Text style={styles.miniLabel}>Valid for</Text>
            <View style={styles.presetRow}>
              {VALID_UNTIL_OPTIONS.map((option) => {
                const active = validUntilDays === option.days;
                return (
                  <Pressable key={option.key} onPress={() => setValidUntilDays(option.days)} style={[styles.presetChip, active && styles.presetChipActive]}>
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.miniLabel}>Terms & conditions</Text>
            <TextInput mode="outlined" dense value={terms} onChangeText={setTerms} placeholder="e.g. 50% advance, balance on delivery." multiline numberOfLines={3} style={[styles.plainField, styles.multiline]} outlineStyle={styles.fieldOutline} />
            <Text style={styles.miniLabel}>Note for the customer</Text>
            <TextInput mode="outlined" dense value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={[styles.plainField, styles.multiline]} outlineStyle={styles.fieldOutline} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.totalRow}>
          <View>
            <Text style={styles.totalLabel}>Total</Text>
            {subtotal > 0 ? <Text style={styles.totalBreakdown}>{money(subtotal)}{discountAmount ? ` − ${money(discountAmount)}` : ""}{taxAmount ? ` + ${money(taxAmount)} tax` : ""}</Text> : null}
          </View>
          <Text style={styles.totalValue}>{money(total)}</Text>
        </View>
        <View style={styles.bottomBarRow}>
          <Pressable style={[styles.draftButton, saving && styles.disabled]} onPress={saveDraft} disabled={saving}>
            {savingDraft ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="save-outline" size={18} color={colors.primary} />}
            <Text style={styles.draftText}>Save draft</Text>
          </Pressable>
          <Pressable style={[styles.sendWrap, saving && styles.disabled]} onPress={saveAndSend} disabled={saving}>
            <LinearGradient colors={["#22c55e", "#0ea5e9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sendButton}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="logo-whatsapp" size={18} color="#fff" />}
              <Text style={styles.sendText}>Send on WhatsApp</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12, marginBottom: 8 },
  errorBannerText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },

  sectionLabel: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  fieldOutline: { borderRadius: 12, borderColor: "#d7e6f1" },
  plainField: { backgroundColor: "#ffffff", fontSize: 14 },
  multiline: { minHeight: 70 },
  miniLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 6 },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f4f9fc", borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", paddingLeft: 12, paddingRight: 10, minHeight: 50 },
  searchField: { flex: 1, backgroundColor: "transparent", fontSize: 14 },
  suggestions: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: "#e2eef7", overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, backgroundColor: "#fff" },
  suggestionDivider: { borderBottomWidth: 1, borderBottomColor: "#eef4f9" },
  suggestionName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  suggestionPhone: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  leadAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.successSoft, alignItems: "center", justifyContent: "center" },
  leadAvatarText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  selectedLead: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.primarySoft, borderRadius: 14, padding: 10 },
  selectedLeadName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  selectedLeadPhone: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  changeButton: { backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  changeText: { color: colors.primary, fontSize: 12, fontWeight: "800" },

  itemCard: { backgroundColor: "#f8fbfd", borderRadius: 16, borderWidth: 1, borderColor: "#e2eef7", padding: 12, marginBottom: 10 },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  itemName: { flex: 1, backgroundColor: "#ffffff", fontSize: 14 },
  removeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" },
  itemBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  priceField: { flex: 1, backgroundColor: "#ffffff", fontSize: 14 },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: "#ffffff", borderRadius: 12, borderWidth: 1, borderColor: "#d7e6f1" },
  stepperButton: { width: 32, height: 40, alignItems: "center", justifyContent: "center" },
  stepperValue: { minWidth: 24, textAlign: "center", color: colors.text, fontSize: 14, fontWeight: "800" },
  lineTotal: { minWidth: 72, textAlign: "right", color: colors.text, fontSize: 13, fontWeight: "800" },
  addItemButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  addItemText: { color: colors.primary, fontSize: 13, fontWeight: "800" },

  moreHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, padding: 14, borderRadius: 16, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#e2eef7" },
  moreTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  moreSummary: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  moreBody: { paddingHorizontal: 2, paddingBottom: 8 },

  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  presetChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f9fc", borderWidth: 1, borderColor: "#d7e6f1" },
  presetChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  presetTextActive: { color: "#ffffff" },

  bottomBar: { paddingHorizontal: 16, paddingTop: 12, gap: 10, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e2eef7" },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  totalBreakdown: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
  totalValue: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.5 },
  bottomBarRow: { flexDirection: "row", gap: 10 },
  draftButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 50, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: "#ffffff" },
  draftText: { color: colors.primary, fontSize: 14, fontWeight: "800" },
  sendWrap: { flex: 1 },
  sendButton: { height: 50, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sendText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.6 },
});
