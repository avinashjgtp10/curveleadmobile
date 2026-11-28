import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text } from "react-native-paper";
import axios from "axios";
import * as WebBrowser from "expo-web-browser";
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

// Pale lavender page, white cards with soft borders, indigo accents.
const UI = { bg: "#f4f5fb", line: "#dfe2f0", ink: "#14172e", sub: "#5b6280", muted: "#8b91ab", accent: "#4b45e0", accentSoft: "#eceefe", accentLine: "#c9ccf0", track: "#e8eaf4" };
const GREEN = UI.accent;
const GREEN_SOFT = UI.accentSoft;
const GREEN_BORDER = UI.accentLine;

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
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back"><Ionicons name="chevron-back" size={20} color={UI.ink} /></Pressable>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
      </View>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={GREEN} /></View>
      ) : error && !plans.length ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={UI.muted} />
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
                    <View style={[styles.planIcon, active && styles.planIconActive]}><Ionicons name="pricetag-outline" size={18} color={active ? UI.accent : UI.sub} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.planName}>{plan.name} Plan</Text>
                        {copy.badge ? <View style={[styles.planBadge, { backgroundColor: copy.badge.color }]}><Text style={styles.planBadgeText}>{copy.badge.text}</Text></View> : null}
                        {mine ? <View style={styles.currentBadge}><Text style={styles.currentBadgeText}>Current plan</Text></View> : null}
                      </View>
                      <Text style={styles.planDescription} numberOfLines={2}>{copy.description}</Text>
                    </View>
                    <View style={[styles.radio, active && styles.radioActive]}>{active ? <Ionicons name="checkmark" size={16} color="#ffffff" /> : null}</View>
                  </View>

                  <View style={styles.priceRow}>
                    <Text style={styles.price}>{formatPrice(price.amount, price.currency)}</Text>
                    {price.amount ? <Text style={styles.per}>/{cycle === "yearly" ? "year" : "month"}</Text> : null}
                  </View>

                  <View style={[styles.features, active && styles.featuresActive]}>
                    <View style={styles.chipRow}>
                      {chips.map((feature) => (
                        <View key={feature} style={styles.featureChip}>
                          <Ionicons name="checkmark-circle-outline" size={15} color={active ? UI.accent : UI.muted} />
                          <Text style={styles.featureChipText}>{feature}</Text>
                        </View>
                      ))}
                    </View>

                    {open ? (
                      <View style={styles.moreList}>
                        {allFeatures.slice(2).map((feature) => (
                          <View key={feature} style={styles.moreRow}>
                            <Ionicons name="checkmark-circle-outline" size={16} color={UI.accent} />
                            <Text style={styles.moreText}>{feature}</Text>
                          </View>
                        ))}
                        {allFeatures.length <= 2 ? <Text style={styles.moreNone}>That's everything in this plan.</Text> : null}
                      </View>
                    ) : null}

                    <Pressable style={styles.viewMore} onPress={() => toggleMore(plan.id)} hitSlop={8}>
                      <Text style={styles.viewMoreText}>{open ? "View less" : "View more"}</Text>
                      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={UI.accent} />
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
            <Pressable onPress={payNow} disabled={!canPay || paying} style={[styles.payButton, canPay ? styles.payButtonOn : styles.payButtonOff, paying && { opacity: 0.7 }]} accessibilityRole="button">
              {paying ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={[styles.payText, !canPay && styles.payTextOff]}>{isCurrent ? "Current plan" : canPay ? "Pay Now" : "Included"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingBottom: 8, backgroundColor: UI.bg },
  headerButton: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: UI.line, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, color: UI.ink, fontSize: 22, fontWeight: "800" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 8 },
  errorText: { color: "#b3173a", fontSize: 13, textAlign: "center" },

  periodWrap: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 },
  periodRow: { flexDirection: "row", backgroundColor: UI.track, borderRadius: 14, padding: 3 },
  periodTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 11 },
  periodTabActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  periodText: { color: UI.sub, fontSize: 14, fontWeight: "700" },
  periodTextActive: { color: "#3a35b8", fontWeight: "800" },
  periodBadge: { backgroundColor: "#d9f3e4", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  periodBadgeText: { color: "#0f6b3a", fontSize: 10, fontWeight: "800" },

  content: { paddingHorizontal: 14, paddingTop: 8, gap: 10 },
  card: { backgroundColor: "#ffffff", borderRadius: 18, borderWidth: 1, borderColor: UI.line, overflow: "hidden" },
  cardActive: { borderColor: UI.accent, borderWidth: 2 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 12, paddingTop: 12 },
  planIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#eef0f8", alignItems: "center", justifyContent: "center" },
  planIconActive: { backgroundColor: UI.accentSoft },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  planName: { color: UI.ink, fontSize: 15, fontWeight: "800" },
  planBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  planBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  currentBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: "#d9f3e4" },
  currentBadgeText: { color: "#0f6b3a", fontSize: 10, fontWeight: "800" },
  planDescription: { color: UI.sub, fontSize: 12, marginTop: 1 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "#c4c8dc", alignItems: "center", justifyContent: "center", marginTop: 4 },
  radioActive: { borderColor: UI.accent, backgroundColor: UI.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: UI.accent },

  priceRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  price: { color: UI.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.8 },
  per: { color: UI.sub, fontSize: 13, marginBottom: 5, marginLeft: 3 },

  features: { backgroundColor: "#f7f8fc", paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: UI.line },
  featuresActive: { backgroundColor: GREEN_SOFT, borderTopColor: GREEN_BORDER },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8 },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  featureChipText: { color: UI.ink, fontSize: 12, fontWeight: "700" },
  moreList: { marginTop: 10, gap: 7, paddingHorizontal: 4 },
  moreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  moreText: { color: UI.ink, fontSize: 13, flex: 1 },
  moreNone: { color: UI.muted, fontSize: 12, textAlign: "center" },
  viewMore: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, paddingTop: 6, paddingBottom: 2 },
  viewMoreText: { color: "#3a35b8", fontSize: 13, fontWeight: "800" },

  empty: { color: UI.muted, textAlign: "center", paddingVertical: 30 },

  bottomBar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingTop: 10, backgroundColor: "#ffffff", borderTopWidth: 1, borderTopColor: UI.line },
  total: { color: UI.ink, fontSize: 18, fontWeight: "900" },
  totalSub: { color: UI.sub, fontSize: 12, marginTop: 1 },
  payButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 140, height: 46, borderRadius: 14, paddingHorizontal: 18 },
  payButtonOn: { backgroundColor: UI.accent },
  payButtonOff: { backgroundColor: "#c9ccf0" },
  payText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  payTextOff: { color: "#2a2790" },
});
