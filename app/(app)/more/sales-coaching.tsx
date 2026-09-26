import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Avatar, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { CoachingData, fetchCoaching, regenerateCoaching, StaffCoachingStat } from "@/api/coaching";
import { fetchStaff } from "@/api/staff";

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function isRouteMissing(error: unknown) {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

async function loadCoachingWithFallback(): Promise<CoachingData> {
  try {
    return await fetchCoaching();
  } catch (error) {
    if (!isRouteMissing(error)) throw error;
    // Backend route isn't live yet — build a reasonable placeholder from the real staff list.
    const staff = await fetchStaff();
    const stats: StaffCoachingStat[] = staff.map((member) => ({
      id: member.id, name: member.name, calls: 0, avg_score: null, vs_team: null, conv_rate: 0, top_missed_points: null,
    }));
    return { playbook: null, staff: stats };
  }
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function convRateStyle(rate: number) {
  return rate >= 40 ? { backgroundColor: colors.successSoft, color: colors.success } : { backgroundColor: colors.surfaceMuted, color: colors.textSecondary };
}

function StaffCoachingRow({ stat }: { stat: StaffCoachingStat }) {
  const badge = convRateStyle(stat.conv_rate);
  return (
    <Card mode="outlined" style={styles.staffCard}>
      <Card.Content>
        <View style={styles.staffHeader}>
          <Avatar.Text size={38} label={initials(stat.name)} color={colors.primary} style={styles.staffAvatar} />
          <Text style={styles.staffName}>{stat.name}</Text>
          <View style={[styles.convBadge, { backgroundColor: badge.backgroundColor }]}>
            <Text style={[styles.convBadgeText, { color: badge.color }]}>{stat.conv_rate}%</Text>
          </View>
        </View>
        <View style={styles.staffStatsRow}>
          <View style={styles.staffStat}>
            <Text style={styles.staffStatLabel}>Calls</Text>
            <Text style={styles.staffStatValue}>{stat.calls}</Text>
          </View>
          <View style={styles.staffStat}>
            <Text style={styles.staffStatLabel}>Avg Score</Text>
            <Text style={styles.staffStatValue}>{stat.avg_score ?? "—"}</Text>
          </View>
          <View style={styles.staffStat}>
            <Text style={styles.staffStatLabel}>vs Team</Text>
            <Text style={styles.staffStatValue}>{stat.vs_team ?? "—"}</Text>
          </View>
        </View>
        <Text style={styles.staffMissedLabel}>Top missed points</Text>
        <Text style={styles.staffMissedValue}>{stat.top_missed_points || "—"}</Text>
      </Card.Content>
    </Card>
  );
}

export default function SalesCoachingScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CoachingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      setData(await loadCoachingWithFallback());
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load sales coaching."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const result = await regenerateCoaching();
      setData(result);
    } catch (regenerateError) {
      if (isRouteMissing(regenerateError)) {
        Alert.alert("Not enough data yet", "Once you have a few leads marked Won or Lost with analyzed calls attached, you'll be able to build a playbook.");
      } else {
        Alert.alert("Couldn't regenerate", errorMessage(regenerateError, "Please try again."));
      }
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Sales Coaching" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.state}>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={load} style={styles.retry}>Try again</Button>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <Card mode="outlined" style={[styles.card, styles.introCard]}>
            <Card.Content>
              <Text style={styles.introTitle}>Sales Coaching</Text>
              <Text style={styles.introDescription}>AI-synthesized sales playbook, learned from your team's call outcomes, plus per-rep coaching insights.</Text>
              <Button
                mode="contained" icon="refresh" onPress={handleRegenerate} loading={regenerating} disabled={regenerating}
                style={styles.regenerateButton} contentStyle={styles.regenerateButtonContent}
              >
                Regenerate Now
              </Button>
            </Card.Content>
          </Card>

          {data.playbook ? (
            <>
              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text style={styles.cardTitle}>Best Practices</Text>
                  {data.playbook.best_practices.map((practice, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{practice}</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>

              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text style={styles.cardTitle}>Common Objections</Text>
                  {data.playbook.objections.map((item, index) => (
                    <View key={index} style={styles.objectionBlock}>
                      <Text style={styles.objectionText}>"{item.objection}"</Text>
                      <Text style={styles.objectionResponse}>{item.response}</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>

              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text style={styles.cardTitle}>Winning Phrases</Text>
                  {data.playbook.winning_phrases.map((phrase, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{phrase}</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            </>
          ) : (
            <Card mode="outlined" style={[styles.card, styles.emptyCard]}>
              <Card.Content style={styles.emptyContent}>
                <View style={styles.emptyIcon}><Ionicons name="bulb-outline" size={22} color={colors.primary} /></View>
                <Text style={styles.emptyTitle}>No playbook yet</Text>
                <Text style={styles.emptyText}>Once you have a few leads marked won or lost with analyzed calls attached, click "Regenerate Now" to build one.</Text>
              </Card.Content>
            </Card>
          )}

          <Text style={styles.sectionLabel}>STAFF COACHING</Text>
          {data.staff.length ? (
            data.staff.map((stat) => <StaffCoachingRow key={stat.id} stat={stat} />)
          ) : (
            <Text style={styles.emptyText}>No staff to show yet.</Text>
          )}
        </ScrollView>
      ) : null}
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
  content: { padding: 18, gap: 14 },

  card: {},
  introCard: { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft },
  introTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  introDescription: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },
  regenerateButton: { marginTop: 14, borderRadius: 10, backgroundColor: colors.primary },
  regenerateButtonContent: { height: 44 },

  cardTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },

  bulletRow: { flexDirection: "row", gap: 9, marginTop: 10 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.textMuted, marginTop: 7 },
  bulletText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },

  objectionBlock: { marginTop: 12 },
  objectionText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  objectionResponse: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },

  emptyCard: {},
  emptyContent: { alignItems: "center", paddingVertical: 20 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  emptyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 6, paddingHorizontal: 10 },

  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginTop: 4 },

  staffCard: {},
  staffHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  staffAvatar: {},
  staffName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" },
  convBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  convBadgeText: { fontSize: 12, fontWeight: "800" },

  staffStatsRow: { flexDirection: "row", marginTop: 14, gap: 10 },
  staffStat: { flex: 1, alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: 10, paddingVertical: 10 },
  staffStatLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  staffStatValue: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 3 },

  staffMissedLabel: { color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 14 },
  staffMissedValue: { color: colors.textSecondary, fontSize: 13, marginTop: 3 },
});
