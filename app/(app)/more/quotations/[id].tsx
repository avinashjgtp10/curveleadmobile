import React, { useCallback, useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { API_BASE_URL } from "@/api/client";
import {
  acceptQuotation, deleteQuotation, fetchQuotation, Quotation, QuotationStatus,
  rejectQuotation, sendQuotation,
} from "@/api/quotations";

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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError("");
    try { setQuotation(await fetchQuotation(id)); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load this quotation.")); }
    finally { setLoading(false); }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSend() {
    if (!quotation) return;
    setBusy(true);
    try {
      const result = await sendQuotation(quotation.id);
      Linking.openURL(result.whatsapp_url);
      load();
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
    Linking.openURL(`${API_BASE_URL}/quotations/pdf/${quotation.id}`);
  }

  if (loading && !quotation) {
    return <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }
  if (!quotation) {
    return (
      <View style={styles.state}>
        <Text style={styles.errorText}>{error || "Quotation not found."}</Text>
        <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
      </View>
    );
  }

  const status = STATUS_COLORS[quotation.status] || STATUS_COLORS.draft;

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={quotation.quote_number} titleStyle={styles.headerTitle} />
        <Appbar.Action icon="trash-can-outline" color={colors.danger} onPress={handleDelete} />
      </Appbar.Header>

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

        <Button mode="outlined" icon="file-document-outline" onPress={openPdf} style={styles.pdfButton} contentStyle={styles.pdfButtonContent}>View PDF</Button>

        <View style={styles.actions}>
          {quotation.status === "draft" ? (
            <Button mode="contained" icon="whatsapp" onPress={handleSend} loading={busy} disabled={busy} contentStyle={styles.actionButtonContent}>Send via WhatsApp</Button>
          ) : null}
          {quotation.status === "sent" ? (
            <View style={styles.actionRow}>
              <Button mode="contained" buttonColor={colors.success} onPress={handleAccept} loading={busy} disabled={busy} style={styles.actionRowButton} contentStyle={styles.actionButtonContent}>Mark Accepted</Button>
              <Button mode="outlined" textColor={colors.danger} style={[styles.actionRowButton, styles.rejectButton]} onPress={handleReject} disabled={busy} contentStyle={styles.actionButtonContent}>Mark Rejected</Button>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, backgroundColor: colors.background },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },

  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  content: { padding: 18 },

  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  leadName: { color: colors.text, fontSize: 20, fontWeight: "800" },
  title: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
  statusPill: { borderRadius: 4, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontWeight: "800" },

  itemsCard: { marginTop: 18 },
  itemsCardContent: { paddingHorizontal: 0, paddingVertical: 0 },
  itemRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  noBorder: { borderBottomWidth: 0 },
  itemCopy: { flex: 1 },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  itemQty: { color: colors.textSecondary, fontSize: 11, marginTop: 3 },
  itemTotal: { color: colors.text, fontSize: 14, fontWeight: "700" },

  summaryCard: { marginTop: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5 },
  summaryLabel: { color: colors.textSecondary, fontSize: 12 },
  summaryValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  summaryTotalRow: { borderTopWidth: 1, borderTopColor: colors.borderSoft, marginTop: 6, paddingTop: 10 },
  summaryTotalLabel: { color: colors.text, fontSize: 14, fontWeight: "800" },
  summaryTotalValue: { color: colors.primary, fontSize: 16, fontWeight: "800" },

  metaLine: { color: colors.textSecondary, fontSize: 12, marginTop: 14 },
  sectionLabel: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 16 },
  sectionText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 5 },

  pdfButton: { marginTop: 22 },
  pdfButtonContent: { height: 46 },

  actions: { marginTop: 16 },
  actionButtonContent: { height: 50 },
  actionRow: { flexDirection: "row", gap: 10 },
  actionRowButton: { flex: 1 },
  rejectButton: { borderColor: colors.danger },
});
