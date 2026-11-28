import React, { useCallback, useRef, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, View, Pressable } from "react-native";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { API_BASE_URL } from "@/api/client";
import {
  acceptQuotation, deleteQuotation, fetchQuotation, Quotation, QuotationStatus,
  rejectQuotation, sendQuotation,
} from "@/api/quotations";


// The add forms' palette: pale blue page, white cards with soft blue borders, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7", red: "#d6334f", redSoft: "#fdecef", amber: "#c2710c", amberSoft: "#fde9c9", green: "#0f7b5f", greenSoft: "#d8f0e5", track: "#e4ecf3" };
const STATUS_COLORS: Record<QuotationStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: "#E5E5E5", text: "#666565", label: "Draft" },
  sent: { bg: "#D2E1FF", text: "#1D61E7", label: "Sent" },
  accepted: { bg: "#ABFCCC", text: "#0B8464", label: "Accepted" },
  rejected: { bg: "#F4BDC5", text: "#A01439", label: "Rejected" },
};

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function dateOnly(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

export default function QuotationDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try { setQuotation(await fetchQuotation(id)); hasLoaded.current = true; }
    catch (loadError) {
      const message = errorMessage(loadError, "Could not load this quotation.");
      // If the quotation is already on screen, keep it and say the refresh failed instead of staying silent.
      if (hasLoaded.current) Alert.alert("Couldn't refresh", message);
      else setError(message);
    }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSend() {
    if (!quotation) return;
    setBusy(true);
    try {
      const result = await sendQuotation(quotation.id);
      load();
      // The server has already marked it sent; only the WhatsApp hand-off can fail here.
      if (result.whatsapp_url) {
        Linking.openURL(result.whatsapp_url).catch(() => {
          Alert.alert("Marked as sent", "WhatsApp could not be opened. Share the quotation from the PDF instead.");
        });
      }
    } catch (sendError) {
      Alert.alert("Couldn't send", errorMessage(sendError, "Please try again."));
    } finally { setBusy(false); }
  }

  async function handleAccept() {
    if (!quotation) return;
    setBusy(true);
    try { await acceptQuotation(quotation.id); load(); }
    catch (acceptError) { Alert.alert("Couldn't update", errorMessage(acceptError, "Please try again.")); }
    finally { setBusy(false); }
  }

  function handleReject() {
    if (!quotation) return;
    Alert.alert("Mark as rejected?", "This records that the lead declined this quotation.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reject", style: "destructive", onPress: async () => {
        setBusy(true);
        try { await rejectQuotation(quotation.id); load(); }
        catch (rejectError) { Alert.alert("Couldn't update", errorMessage(rejectError, "Please try again.")); }
        finally { setBusy(false); }
      } },
    ]);
  }

  function handleDelete() {
    if (!quotation) return;
    Alert.alert("Delete quotation?", `${quotation.quote_number} will be permanently removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteQuotation(quotation.id); router.back(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  function openPdf() {
    if (!quotation) return;
    Linking.openURL(`${API_BASE_URL}/quotations/pdf/${quotation.id}`).catch(() => Alert.alert("Couldn't open PDF", "Please try again in a moment."));
  }

  if (loading && !quotation) {
    return <View style={styles.state}><ActivityIndicator size="large" color={UI.teal} /></View>;
  }
  if (!quotation) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error || "Quotation not found."}</Text>
        <Button mode="contained" buttonColor={UI.teal} onPress={load} style={styles.retry}>Try again</Button>
      </View>
    );
  }

  const status = STATUS_COLORS[quotation.status] || STATUS_COLORS.draft;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{quotation.quote_number}</Text>
        <Pressable onPress={handleDelete} hitSlop={10} style={styles.headerButton} accessibilityRole="button">
          <Ionicons name="trash-outline" size={20} color={UI.red} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.leadName}>{quotation.lead_name}</Text>
            {quotation.title ? <Text style={styles.title}>{quotation.title}</Text> : null}
          </View>
          <View style={[styles.statusPill, { backgroundColor: status.bg }]}><Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text></View>
        </View>

        <Card mode="outlined" style={styles.itemsCard}>
          <Card.Content style={styles.itemsCardContent}>
            {quotation.items.map((item, index) => (
              <View key={index} style={[styles.itemRow, index === quotation.items.length - 1 && styles.noBorder]}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemQty}>{item.quantity} × {money(item.price)}</Text>
                </View>
                <Text style={styles.itemTotal}>{money(item.quantity * item.price)}</Text>
              </View>
            ))}
          </Card.Content>
        </Card>

        <Card mode="outlined" style={styles.summaryCard}>
          <Card.Content>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{money(quotation.subtotal)}</Text></View>
            {quotation.discount_percent > 0 ? <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Discount ({quotation.discount_percent}%)</Text><Text style={styles.summaryValue}>-{money(quotation.discount_amount)}</Text></View> : null}
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Tax ({quotation.tax_percent}%)</Text><Text style={styles.summaryValue}>{money(quotation.tax_amount)}</Text></View>
            <View style={[styles.summaryRow, styles.summaryTotalRow]}><Text style={styles.summaryTotalLabel}>Total</Text><Text style={styles.summaryTotalValue}>{money(quotation.total)}</Text></View>
          </Card.Content>
        </Card>

        {quotation.valid_until ? <Text style={styles.metaLine}>Valid until {dateOnly(quotation.valid_until)}</Text> : null}
        {quotation.terms ? <><Text style={styles.sectionLabel}>Terms</Text><Text style={styles.sectionText}>{quotation.terms}</Text></> : null}
        {quotation.notes ? <><Text style={styles.sectionLabel}>Notes</Text><Text style={styles.sectionText}>{quotation.notes}</Text></> : null}
        {quotation.status === "rejected" && quotation.rejection_reason ? <><Text style={styles.sectionLabel}>Rejection reason</Text><Text style={styles.sectionText}>{quotation.rejection_reason}</Text></> : null}

        <Button mode="outlined" textColor={UI.teal} icon="file-document-outline" onPress={openPdf} style={styles.pdfButton} contentStyle={styles.pdfButtonContent}>View PDF</Button>

        <View style={styles.actions}>
          {quotation.status === "draft" ? (
            <Button mode="contained" buttonColor={UI.teal} icon="whatsapp" onPress={handleSend} loading={busy} disabled={busy} contentStyle={styles.actionButtonContent}>Send via WhatsApp</Button>
          ) : null}
          {quotation.status === "sent" ? (
            <View style={styles.actionRow}>
              <Button mode="contained" buttonColor={UI.green} onPress={handleAccept} loading={busy} disabled={busy} style={styles.actionRowButton} contentStyle={styles.actionButtonContent}>Mark Accepted</Button>
              <Button mode="outlined" textColor={UI.red} style={[styles.actionRowButton, styles.rejectButton]} onPress={handleReject} disabled={busy} contentStyle={styles.actionButtonContent}>Mark Rejected</Button>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, backgroundColor: UI.bg },
  errorText: { color: UI.red, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },

  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { padding: 18 },

  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  leadName: { color: UI.ink, fontSize: 20, fontWeight: "800" },
  title: { color: UI.sub, fontSize: 13, marginTop: 3 },
  statusPill: { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontWeight: "800" },

  itemsCard: { marginTop: 18 },
  itemsCardContent: { paddingHorizontal: 0, paddingVertical: 0 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: UI.line },
  noBorder: { borderBottomWidth: 0 },
  itemCopy: { flex: 1 },
  itemName: { color: UI.ink, fontSize: 14, fontWeight: "700" },
  itemQty: { color: UI.sub, fontSize: 11, marginTop: 3 },
  itemTotal: { color: UI.ink, fontSize: 14, fontWeight: "700" },

  summaryCard: { marginTop: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  summaryLabel: { color: UI.sub, fontSize: 12 },
  summaryValue: { color: UI.ink, fontSize: 12, fontWeight: "700" },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: UI.line, marginTop: 6, paddingTop: 10 },
  summaryTotalLabel: { color: UI.ink, fontSize: 14, fontWeight: "800" },
  summaryTotalValue: { color: UI.teal, fontSize: 16, fontWeight: "800" },

  metaLine: { color: UI.sub, fontSize: 12, marginTop: 14 },
  sectionLabel: { color: UI.ink, fontSize: 12, fontWeight: "800", marginTop: 16 },
  sectionText: { color: UI.sub, fontSize: 12, lineHeight: 18, marginTop: 5 },

  pdfButton: { marginTop: 22 },
  pdfButtonContent: { height: 46 },

  actions: { marginTop: 16 },
  actionButtonContent: { height: 50 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionRowButton: { flex: 1 },
  rejectButton: { borderColor: UI.red },
});
