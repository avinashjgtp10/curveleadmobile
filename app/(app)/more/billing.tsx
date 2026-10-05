import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import axios from "axios";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { colors, tabBarStyleFor } from "@/theme";
import { BillingCycle, createSubscription, fetchPlans, formatPrice, Plan, priceFor, RazorpayPayment, verifySubscription } from "@/api/billing";
import { isExpoGo } from "@/notifications/environment";

const WEB_BILLING_URL = "https://curvelead.com/billing";

interface RazorpayModule {
  open: (options: Record<string, unknown>) => Promise<RazorpayPayment>;
}

// Razorpay's checkout is a native add-on: it exists in the development / release build, not in Expo Go.
function loadRazorpay(): RazorpayModule | null {
  if (isExpoGo) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("react-native-razorpay");
    return (module.default || module) as RazorpayModule;
  } catch {
    return null;
  }
}

// The accent of the plan picker: the same CurveLead blue as the other screens. (Names kept from the first version.)
const GREEN = colors.primary;
const GREEN_DARK = "#0284c7";
const GREEN_SOFT = "#e0f2fe";
const GREEN_BORDER = "#bae6fd";

const PERIODS: { key: BillingCycle; label: string; badge?: string }[] = [
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly", badge: "2 months free" },
];

// What each CurveLead plan includes, the same copy as the website's billing page.
const PLAN_COPY: Record<string, { description: string; features: string[]; icon: keyof typeof Ionicons.glyphMap; badge?: { text: string; color: string } }> = {
  Free: {
    description: "For testing the basic sales workflow.",
    features: ["20 leads", "1 user", "Pipeline basics", "Email support"],
    icon: "gift",
  },
  Starter: {
    description: "For small teams starting with Meta and WhatsApp follow-up.",
    features: ["100 leads", "1 user", "Meta Ads capture", "WhatsApp inbox"],
    icon: "rocket",
  },
  Growth: {
    description: "For active sales teams that need AI and reporting.",
    features: ["1000 leads", "5 users", "AI scoring", "Campaign ROI", "Reports"],
    icon: "star",
    badge: { text: "Most Popular", color: "#4f46e5" },
  },
  Pro: {
    description: "For larger teams that need custom onboarding and limits.",
    features: ["Unlimited leads", "Unlimited users", "Priority support", "Advanced setup help"],
    icon: "diamond",
  },
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function usersText(maxUsers?: number | null) {
  if (maxUsers == null) return "";
  if (maxUsers < 0) return "Unlimited users";
  return `${maxUsers} user${maxUsers === 1 ? "" : "s"}`;
}

export default function BillingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user, tenant, refreshProfile } = useAuth();

  // The tab bar floats over the bottom of the screen and was covering the Total / Pay Now bar, so hide it here.
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: "none" } });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [navigation, insets.bottom]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  // The workspace's own plan: a trial counts as Free, otherwise the plan it paid for.
  const status = tenant?.subscriptionStatus || "trial";
  const currentPlanName = status === "trial" ? "Free" : tenant?.planName || "";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      // Like the website, Pro is handled by "contact sales", so it isn't offered here.
      setPlans((await fetchPlans()).filter((plan) => plan.name !== "Pro"));
    } catch (loadError) {
      setError(errorMessage(loadError, "Failed to load billing plans."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Start on the plan the workspace already has, or the most popular one.
  useEffect(() => {
    if (selected || !plans.length) return;
    const current = plans.find((plan) => plan.name === currentPlanName);
    const popular = plans.find((plan) => plan.name === "Growth");
    setSelected((current || popular || plans[0]).id);
  }, [plans, selected, currentPlanName]);

  const selectedPlan = plans.find((plan) => plan.id === selected);
  const selectedPrice = selectedPlan ? priceFor(selectedPlan, cycle) : null;
  // On a trial the workspace is on the Free plan; otherwise it is on the plan it paid for.
  const isCurrent = !!selectedPlan && selectedPlan.name === currentPlanName;
  const canPay = !!selectedPlan && selectedPlan.checkoutEnabled && !isCurrent;

  function toggleMore(id: string) {
    setExpanded((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  // The same three steps as the website: the server creates the subscription, Razorpay takes the payment,
  // then the server verifies it before the plan is activated. Where Razorpay isn't available (Expo Go),
  // the payment happens on the CurveLead website instead.
  async function payNow() {
    if (!selectedPlan) return;
    setPaying(true);
    try {
      const Razorpay = loadRazorpay();
      if (!Razorpay) {
        await WebBrowser.openBrowserAsync(WEB_BILLING_URL);
        await refreshProfile();
        load(true);
        return;
      }

      const order = await createSubscription(selectedPlan.name, cycle);
      if (!order.subscriptionId || !order.razorpayKeyId) throw new Error("The server did not return a payment to start.");

      let payment: RazorpayPayment;
      try {
        payment = await Razorpay.open({
          key: order.razorpayKeyId,
          subscription_id: order.subscriptionId,
          name: "CurveLead",
          description: order.description || `${selectedPlan.name} subscription`,
          prefill: { name: order.prefill?.name || user?.name || "", email: order.prefill?.email || user?.email || "" },
          notes: { plan_name: selectedPlan.name, billing_period: cycle, tenant_id: tenant?.id || "" },
          theme: { color: colors.primary },
        });
      } catch (checkoutError) {
        const reason = checkoutError as { code?: number; description?: string };
        // Closing the payment sheet is not an error.
        if (reason?.code === 0 || /cancel/i.test(reason?.description || "")) return;
        Alert.alert("Payment failed", reason?.description || "The payment could not be completed. Please try again.");
        return;
      }

      try {
        const message = await verifySubscription(payment, selectedPlan.name, cycle);
        await refreshProfile();
        load(true);
        Alert.alert("Payment successful", message);
      } catch (verifyError) {
        Alert.alert("Payment received, not confirmed", `${errorMessage(verifyError, "We couldn't confirm it yet.")}

If money was taken, contact support with payment ID ${payment.razorpay_payment_id}.`);
      }
    } catch (payError) {
      Alert.alert("Couldn't start the payment", errorMessage(payError, payError instanceof Error ? payError.message : "Please try again."));
    } finally {
      setPaying(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Choose Your Plan" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={GREEN} /></View>
      ) : error && !plans.length ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" buttonColor={GREEN} onPress={() => load()} style={{ marginTop: 8 }}>Try again</Button>
        </View>
      ) : (
        <>
          <View style={styles.periodWrap}>
            <View style={styles.periodRow}>
              {PERIODS.map((period) => {
                const active = cycle === period.key;
                return (
                  <Pressable key={period.key} onPress={() => setCycle(period.key)} style={[styles.periodTab, active && styles.periodTabActive]}>
                    <Text style={[styles.periodText, active && styles.periodTextActive]}>{period.label}</Text>
                    {period.badge ? <View style={styles.periodBadge}><Text style={styles.periodBadgeText}>{period.badge}</Text></View> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={GREEN} colors={[GREEN]} />}
          >
            {plans.map((plan) => {
              const copy = PLAN_COPY[plan.name] || { description: "", features: [], icon: "pricetag" as const };
              const price = priceFor(plan, cycle);
              const active = selected === plan.id;
              const open = expanded.includes(plan.id);
              const users = usersText(plan.max_users);
              const allFeatures = [...copy.features.filter((feature) => !/^\d+ users?$/i.test(feature) && !/users$/i.test(feature)), ...(users ? [users] : [])];
              const chips = allFeatures.slice(0, 2);
              const mine = plan.name === currentPlanName;
              return (
                <Pressable key={plan.id} onPress={() => setSelected(plan.id)} style={[styles.card, active && styles.cardActive]}>
                  <View style={styles.cardTop}>
                    <View style={styles.planIcon}><Ionicons name={copy.icon} size={18} color={active ? colors.primary : "#64748b"} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.planName}>{plan.name} Plan</Text>
                        {copy.badge ? <View style={[styles.planBadge, { backgroundColor: copy.badge.color }]}><Text style={styles.planBadgeText}>{copy.badge.text}</Text></View> : null}
                        {mine ? <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current plan</Text></View> : null}
                      </View>
                      <Text style={styles.planDescription} numberOfLines={2}>{copy.description}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>{active ? <View style={styles.radioDot} /> : null}</View>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{formatPrice(price.amount, price.currency)}</Text>
                    {price.amount ? <Text style={styles.per}>/{cycle === "yearly" ? "year" : "month"}</Text> : null}
                  </View>

                  <View style={[styles.features, active && styles.featuresActive]}>
                    <View style={styles.chipRow}>
                      {chips.map((feature) => (
                        <View key={feature} style={styles.featureChip}>
                          <Ionicons name="checkmark-circle" size={14} color={active ? colors.primary : "#94a3b8"} />
                          <Text style={styles.featureChipText}>{feature}</Text>
                        </View>
                      ))}
                    </View>

                    {open ? (
                      <View style={styles.moreList}>
                        {allFeatures.slice(2).map((feature) => (
                          <View key={feature} style={styles.moreRow}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                            <Text style={styles.moreText}>{feature}</Text>
                          </View>
                        ))}
                        {allFeatures.length <= 2 ? <Text style={styles.moreNone}>That's everything in this plan.</Text> : null}
                      </View>
                    ) : null}

                    <Pressable style={styles.viewMore} onPress={() => toggleMore(plan.id)} hitSlop={8}>
                      <Text style={styles.viewMoreText}>{open ? "View Less" : "View More"}</Text>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.primary} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}

            {!plans.length ? <Text style={styles.empty}>No plans available right now.</Text> : null}
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.total}>Total: {selectedPrice ? formatPrice(selectedPrice.amount, selectedPrice.currency) : "-"}</Text>
              <Text style={styles.totalSub}>{selectedPrice?.amount ? (cycle === "yearly" ? "Per Year" : "Per Month") : "No payment needed"}</Text>
            </View>
            <Pressable onPress={payNow} disabled={!canPay || paying} style={(!canPay || paying) && { opacity: 0.55 }}>
              <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.payButton}>
                {paying ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.payText}>{isCurrent ? "Current plan" : canPay ? "Pay Now" : "Included"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 8 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },

  periodWrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  periodRow: { flexDirection: "row", backgroundColor: "#eaf1f7", borderRadius: 12, padding: 3 },
  periodTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, height: 34, borderRadius: 10 },
  periodTabActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  periodText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  periodTextActive: { color: colors.primary },
  periodBadge: { backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  periodBadgeText: { color: colors.primary, fontSize: 10, fontWeight: "800" },

  content: { paddingHorizontal: 14, paddingTop: 8, gap: 10 },
  card: { backgroundColor: "#ffffff", borderRadius: 16, borderWidth: 1.5, borderColor: "#e2eef7", overflow: "hidden" },
  cardActive: { borderColor: colors.primary },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12, paddingTop: 12 },
  planIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  planName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  planBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  planBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  currentBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#dcfce7" },
  currentBadgeText: { color: "#15803d", fontSize: 10, fontWeight: "800" },
  planDescription: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", marginTop: 4 },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },

  priceRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  price: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: -0.8 },
  per: { color: colors.textMuted, fontSize: 13, marginBottom: 4, marginLeft: 2 },

  features: { backgroundColor: "#f8fbfd", paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: "#eef4f9" },
  featuresActive: { backgroundColor: GREEN_SOFT, borderTopColor: GREEN_BORDER },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  featureChipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  moreList: { marginTop: 10, gap: 7, paddingHorizontal: 4 },
  moreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  moreText: { color: colors.text, fontSize: 13, flex: 1 },
  moreNone: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  viewMore: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 8, paddingBottom: 2 },
  viewMoreText: { color: colors.primary, fontSize: 13, fontWeight: "800" },

  empty: { color: colors.textMuted, textAlign: "center", paddingVertical: 30 },

  bottomBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: "#e2eef7" },
  total: { color: colors.text, fontSize: 17, fontWeight: "900" },
  totalSub: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  payButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 140, height: 46, borderRadius: 14, paddingHorizontal: 18 },
  payText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
});
