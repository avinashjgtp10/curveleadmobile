import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { fetchQuotations, Quotation, QuotationStatus } from "@/api/quotations";

const STATUS_COLORS: Record<QuotationStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: "#E5E5E5", text: "#666565", label: "Draft" },
  sent: { bg: "#D2E1FF", text: "#1D61E7", label: "Sent" },
  accepted: { bg: "#ABFCCC", text: "#0B8464", label: "Accepted" },
  rejected: { bg: "#F4BDC5", text: "#A01439", label: "Rejected" },
};

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

export default function QuotationsScreen() {
  const insets = useSafeAreaInsets();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setQuotations(await fetchQuotations()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load quotations.")); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Quotations" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color={colors.primary} onPress={() => router.push("/(app)/more/quotations/new")} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          {quotations.length ? quotations.map((quotation) => {
            const status = STATUS_COLORS[quotation.status] || STATUS_COLORS.draft;
            return (
              <Card key={quotation.id} mode="outlined" style={styles.card} onPress={() => router.push(`/(app)/more/quotations/${quotation.id}`)}>
                <Card.Content>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.quoteNumber}>{quotation.quote_number}</Text>
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}><Text style={[styles.statusPillText, { color: status.text }]}>{status.label}</Text></View>
                  </View>
                  <Text style={styles.leadName} numberOfLines={1}>{quotation.lead_name}{quotation.title ? ` · ${quotation.title}` : ""}</Text>
                  <Text style={styles.total}>{money(quotation.total)}</Text>
                </Card.Content>
              </Card>
            );
          }) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={30} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No Quotations Yet</Text>
              <Button mode="outlined" onPress={() => router.push("/(app)/more/quotations/new")} style={styles.emptyButton}>Create your first quotation</Button>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 16, fontWeight: "700" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  retry: { marginTop: 14 },
  content: { padding: 18 },

  card: { marginBottom: 12 },
  cardTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  quoteNumber: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  statusPill: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 10, fontWeight: "800" },
  leadName: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 8 },
  total: { color: colors.primary, fontSize: 18, fontWeight: "800", marginTop: 6 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14 },
  emptyButton: { marginTop: 12 },
});
