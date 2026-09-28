import React, { useEffect, useRef, useState } from "react";
import {
  Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View,
} from "react-native";
import { Appbar, Button, Card, Chip, IconButton, List, Searchbar, Text, TextInput } from "react-native-paper";
import axios from "axios";
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

function emptyItem(): QuotationItem { return { name: "", quantity: 1, price: 0 }; }

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
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
  const [selectedLead, setSelectedLead] = useState<LeadListItem | null>(null);
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([emptyItem()]);
  const [discountPercent, setDiscountPercent] = useState("0");
  const [taxPercent, setTaxPercent] = useState("18");
  const [validUntilDays, setValidUntilDays] = useState<number | null>(null);
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const saving = savingDraft || sending;

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setLeadResults((await fetchLeads({ search: leadQuery.trim(), limit: 6 })).leads); } catch { /* best-effort */ }
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

  function buildInput(): CreateQuotationInput | null {
    if (!selectedLead) { setError("Search and select a lead first."); return null; }
    const validItems = items.filter((item) => item.name.trim());
    if (!validItems.length) { setError("Add at least one item with a name."); return null; }
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New Quotation" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {error ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{error}</Text></View> : null}

        <Text style={styles.label}>Lead <Text style={styles.required}>*</Text></Text>
        {selectedLead ? (
          <View style={styles.selectedLead}>
            <Text style={styles.selectedLeadText} numberOfLines={1}>{selectedLead.name} · {selectedLead.phone}</Text>
            <Pressable onPress={() => setSelectedLead(null)} hitSlop={8}><Ionicons name="close" size={16} color={colors.textSecondary} /></Pressable>
          </View>
        ) : (
          <>
            <Searchbar value={leadQuery} onChangeText={setLeadQuery} placeholder="Search & Select Lead" elevation={0} style={styles.searchInput} />
            {leadResults.length ? (
              <View style={styles.suggestions}>
                {leadResults.map((lead) => (
                  <List.Item key={lead.id} title={lead.name} titleNumberOfLines={1} description={lead.phone} onPress={() => { setSelectedLead(lead); setLeadResults([]); }} />
                ))}
              </View>
            ) : null}
          </>
        )}

        <TextInput mode="outlined" label="Title (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Website Redesign Project" style={styles.field} />

        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.label, styles.sectionHeaderLabel]}>Line Items <Text style={styles.required}>*</Text></Text>
          <Button mode="text" icon="plus" compact onPress={() => setItems((current) => [...current, emptyItem()])}>Add Item</Button>
        </View>
        {items.map((item, index) => (
          <Card key={index} mode="outlined" style={styles.itemRow}>
            <Card.Content>
              <View style={styles.itemTop}>
                <TextInput mode="outlined" dense value={item.name} onChangeText={(value) => updateItem(index, { name: value })} placeholder="Item name" style={styles.itemNameInput} />
                <IconButton icon="close-circle" size={20} iconColor={colors.danger} style={styles.removeItemButton} onPress={() => removeItem(index)} />
              </View>
              <TextInput mode="outlined" dense value={item.description || ""} onChangeText={(value) => updateItem(index, { description: value })} placeholder="Description (optional)" style={styles.itemDescriptionInput} />
              <View style={styles.itemBottom}>
                <TextInput mode="outlined" dense value={String(item.quantity)} onChangeText={(value) => updateItem(index, { quantity: Number(value.replace(/[^\d]/g, "")) || 0 })} placeholder="Qty" keyboardType="number-pad" style={styles.itemQtyInput} />
                <TextInput mode="outlined" dense value={String(item.price)} onChangeText={(value) => updateItem(index, { price: Number(value.replace(/[^\d.]/g, "")) || 0 })} placeholder="Price" keyboardType="decimal-pad" style={styles.itemPriceInput} />
                <Text style={styles.itemLineTotal}>{money((Number(item.quantity) || 0) * (Number(item.price) || 0))}</Text>
              </View>
            </Card.Content>
          </Card>
        ))}

        <Text style={[styles.label, styles.sectionHeaderLabel]}>Totals &amp; Terms</Text>
        <View style={styles.twoUp}>
          <TextInput mode="outlined" label="Discount %" value={discountPercent} onChangeText={(value) => setDiscountPercent(value.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.twoUpItem} />
          <TextInput mode="outlined" label="Tax % (GST)" value={taxPercent} onChangeText={(value) => setTaxPercent(value.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" style={styles.twoUpItem} />
        </View>

        <Text style={styles.label}>Valid Until</Text>
        <View style={styles.chipRow}>
          {VALID_UNTIL_OPTIONS.map((option) => (
            <Chip key={option.key} selected={validUntilDays === option.days} onPress={() => setValidUntilDays(option.days)} mode={validUntilDays === option.days ? "flat" : "outlined"}>
              {option.label}
            </Chip>
          ))}
        </View>

        <TextInput mode="outlined" label="Terms & Conditions (optional)" value={terms} onChangeText={setTerms} placeholder="e.g. 50% advance, balance on delivery." multiline numberOfLines={3} style={styles.field} />
        <TextInput mode="outlined" label="Notes, visible to client (optional)" value={notes} onChangeText={setNotes} multiline numberOfLines={3} style={styles.field} />

        <Card mode="outlined" style={styles.summaryCard}>
          <Card.Content>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{money(subtotal)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Discount ({discountPercent || 0}%)</Text><Text style={styles.summaryValue}>-{money(discountAmount)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Tax ({taxPercent || 0}%)</Text><Text style={styles.summaryValue}>+{money(taxAmount)}</Text></View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}><Text style={styles.summaryTotalLabel}>Total</Text><Text style={styles.summaryTotalValue}>{money(total)}</Text></View>
          </Card.Content>
        </Card>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.bottomBarRow}>
          <Button mode="outlined" onPress={() => router.back()} disabled={saving} style={styles.cancelButton} contentStyle={styles.saveButtonContent}>Cancel</Button>
          <Button mode="contained-tonal" icon="content-save-outline" onPress={saveDraft} loading={savingDraft} disabled={saving} style={styles.draftButton} contentStyle={styles.saveButtonContent}>Save Draft</Button>
        </View>
        <Button mode="contained" icon="send" onPress={saveAndSend} loading={sending} disabled={saving} contentStyle={styles.saveButtonContent} style={styles.sendButton}>
          Save & Send on WhatsApp
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  scroll: { flex: 1 },
  content: { padding: 14 },
  errorBanner: { backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 10, marginBottom: 10 },
  errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center" },

  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginBottom: 5, marginTop: 12 },
  required: { color: colors.danger },
  field: { marginTop: 12 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeaderLabel: { fontSize: 14, fontWeight: "800", marginBottom: 2 },

  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, minHeight: 42 },
  suggestions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 6, overflow: "hidden" },
  selectedLead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 42, paddingHorizontal: 12, backgroundColor: colors.primarySoft, borderRadius: 8 },
  selectedLeadText: { flex: 1, color: colors.primary, fontSize: 13, fontWeight: "700" },

  itemRow: { marginTop: 8 },
  itemTop: { flexDirection: "row", alignItems: "center" },
  itemNameInput: { flex: 1 },
  itemDescriptionInput: { marginTop: 6 },
  removeItemButton: { margin: 0 },
  itemBottom: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  itemQtyInput: { width: 64 },
  itemPriceInput: { flex: 1 },
  itemLineTotal: { width: 72, textAlign: "right", color: colors.text, fontSize: 12, fontWeight: "700" },

  twoUp: { flexDirection: "row", gap: 10, marginTop: 12 },
  twoUpItem: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },

  summaryCard: { marginTop: 16 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { color: colors.textSecondary, fontSize: 12 },
  summaryValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 4, paddingTop: 8 },
  summaryTotalLabel: { color: colors.text, fontSize: 13, fontWeight: "800" },
  summaryTotalValue: { color: colors.primary, fontSize: 15, fontWeight: "800" },

  bottomBar: { paddingHorizontal: 14, paddingTop: 10, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  bottomBarRow: { flexDirection: "row", gap: 8 },
  cancelButton: { flex: 1 },
  draftButton: { flex: 1 },
  sendButton: {},
  saveButtonContent: { height: 42 },
});
