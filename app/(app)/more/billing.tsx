import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import axios from "axios";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import {
  BillingCycle, CurrentBilling, Invoice, Plan, fetchCurrentBilling, fetchInvoices, fetchPlans,
} from "@/api/billing";

const WEB_BILLING_URL = "https://curvelead.com/billing";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function price(value: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${value.toLocaleString("en-US")}`;
}

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentBilling | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [planList, billing, invoiceList] = await Promise.all([
        fetchPlans(),
        fetchCurrentBilling().catch(() => null),
        fetchInvoices().catch(() => [] as Invoice[]),
      ]);
      setPlans(planList);
      setCurrent(billing);
      setInvoices(invoiceList);
      if (billing?.billing_cycle) setCycle(billing.billing_cycle);
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load billing."));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Payment is verified server-side; checkout happens on the web billing page, then we refresh on return.
  async function checkout() {
    await WebBrowser.openBrowserAsync(WEB_BILLING_URL);
    load();
  }

  const isActive = current?.status?.toLowerCase() === "active";
  const isCurrentPlan = (plan: Plan) =>
    !!current && (current.plan_id === plan.id || current.plan_name?.toLowerCase() === plan.name.toLowerCase());

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Billing" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}><ActivityIndicator /></View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>BILLING</Text>
          <Text style={styles.title}>Choose your CurveLead plan</Text>
          <Text style={styles.subtitle}>Upgrade securely with Razorpay. Your workspace limits update after payment verification.</Text>

          <View style={styles.controlsRow}>
            <View style={styles.toggle}>
              {(["monthly", "yearly"] as BillingCycle[]).map((value) => (
                <Pressable key={value} onPress={() => setCycle(value)} style={[styles.toggleOption, cycle === value && styles.toggleActive]}>
                  <Text style={[styles.toggleText, cycle === value && styles.toggleTextActive]}>{value === "monthly" ? "Monthly" : "Yearly"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.statusPill}>
              <Text style={styles.statusLabel}>Status</Text>
              <View style={[styles.statusBadge, !isActive && styles.statusBadgeOff]}>
                <Text style={[styles.statusBadgeText, !isActive && styles.statusBadgeTextOff]}>{isActive ? "Active" : (current?.status || "Inactive").replace(/^\w/, (c) => c.toUpperCase())}</Text>
              </View>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {plans.map((plan) => {
            const mine = isCurrentPlan(plan);
            const amount = cycle === "monthly" ? plan.monthly_price : plan.yearly_price;
            return (
              <View key={plan.id} style={[styles.planCard, mine && styles.planCardCurrent]}>
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Ionicons name="card-outline" size={20} color="#94a3b8" />
                </View>
                <View style={styles.priceRow}>
                  <Text style={styles.planPrice}>{price(amount, plan.currency)}</Text>
                  <Text style={styles.planPer}>{cycle === "monthly" ? "/mo" : "/yr"}</Text>
                </View>
                {plan.max_users ? (
                  <View style={styles.usersRow}>
                    <Ionicons name="people-outline" size={16} color="#64748b" />
                    <Text style={styles.usersText}>{plan.max_users} users</Text>
                  </View>
                ) : null}
                {plan.features.map((feature) => (
                  <View key={feature} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={14} color="#16a34a" />
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
                {mine && isActive ? (
                  <View style={styles.includedButton}>
                    <Ionicons name="shield-checkmark-outline" size={16} color="#1f2937" />
                    <Text style={styles.includedText}>Included</Text>
                  </View>
                ) : (
                  <Button mode="contained" onPress={checkout} style={styles.upgradeButton} contentStyle={styles.upgradeContent}>
                    {isActive ? "Upgrade" : "Subscribe"}
                  </Button>
                )}
              </View>
            );
          })}

          {!plans.length && !error ? <Text style={styles.emptyText}>No plans available right now.</Text> : null}

          <View style={styles.secureCard}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={styles.secureTitle}>Secure payments</Text>
              <Text style={styles.secureText}>Payments are processed through Razorpay and verified before the upgraded plan is activated for your workspace.</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Invoices</Text>
          {invoices.length ? (
            invoices.map((invoice) => (
              <Pressable
                key={invoice.id}
                style={styles.invoiceRow}
                disabled={!invoice.invoice_url}
                onPress={() => invoice.invoice_url && WebBrowser.openBrowserAsync(invoice.invoice_url)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.invoiceAmount}>{price(invoice.amount, invoice.currency)}</Text>
                  <Text style={styles.invoiceMeta}>
                    {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                  </Text>
                </View>
                <Text style={styles.invoiceStatus}>{invoice.status.replace(/^\w/, (c) => c.toUpperCase())}</Text>
                {invoice.invoice_url ? <Ionicons name="open-outline" size={16} color="#64748b" /> : null}
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>No invoices yet.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  eyebrow: { color: "#4f46e5", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -0.5, marginTop: -8 },
  subtitle: { color: "#64748b", fontSize: 13, lineHeight: 19, marginTop: -8 },
  controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  toggle: { flexDirection: "row", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 3 },
  toggleOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 },
  toggleActive: { backgroundColor: "#4f46e5" },
  toggleText: { color: "#475569", fontSize: 13, fontWeight: "700" },
  toggleTextActive: { color: "#ffffff" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  statusLabel: { color: "#64748b", fontSize: 12 },
  statusBadge: { backgroundColor: "#dcfce7", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeOff: { backgroundColor: "#f1f5f9" },
  statusBadgeText: { color: "#15803d", fontSize: 12, fontWeight: "700" },
  statusBadgeTextOff: { color: "#64748b" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 10 },
  errorText: { color: colors.danger, fontSize: 12, flex: 1 },
  planCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, padding: 16, backgroundColor: "#ffffff", gap: 10 },
  planCardCurrent: { borderColor: "#4f46e5" },
  planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planName: { color: "#111827", fontSize: 18, fontWeight: "700" },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 14 },
  planPrice: { color: "#111827", fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.8 },
  planPer: { color: "#64748b", fontSize: 14, marginBottom: 6 },
  usersRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#f8fafc", borderRadius: 8, padding: 10 },
  usersText: { color: "#475569", fontSize: 13 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  featureText: { color: "#475569", fontSize: 13, flex: 1 },
  includedButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#f1f5f9", borderRadius: 8, paddingVertical: 12 },
  includedText: { color: "#1f2937", fontSize: 14, fontWeight: "600" },
  upgradeButton: { borderRadius: 8 },
  upgradeContent: { height: 44 },
  secureCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, padding: 14 },
  secureTitle: { color: "#111827", fontSize: 14, fontWeight: "700" },
  secureText: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 2 },
  sectionTitle: { color: "#111827", fontSize: 16, fontWeight: "800", marginTop: 6 },
  invoiceRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 12 },
  invoiceAmount: { color: "#111827", fontSize: 15, fontWeight: "700" },
  invoiceMeta: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  invoiceStatus: { color: "#15803d", fontSize: 12, fontWeight: "700" },
  emptyText: { color: "#94a3b8", fontSize: 13, textAlign: "center", paddingVertical: 8 },
});
