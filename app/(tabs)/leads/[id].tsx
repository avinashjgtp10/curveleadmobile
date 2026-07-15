import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { fetchLead, updateLeadStatus } from "@/api/leads";
import { Lead } from "@/types";

const STATUSES: Lead["status"][] = ["new", "contacted", "qualified", "proposal", "won", "lost"];

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLead(id).then(setLead).finally(() => setLoading(false));
  }, [id]);

  async function handleStatusChange(status: Lead["status"]) {
    if (!lead) return;
    const updated = await updateLeadStatus(lead.id, status);
    setLead(updated);
  }

  if (loading || !lead) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{lead.name}</Text>
      <Text style={styles.phone}>{lead.phone}</Text>
      {lead.score != null && <Text style={styles.score}>AI Score: {lead.score}/100</Text>}

      <View style={styles.actionRow}>
        <Pressable
          style={styles.actionBtn}
          onPress={() => Linking.openURL(`tel:${lead.phone}`)}
        >
          <Text style={styles.actionText}>📞 Call</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => Linking.openURL(`https://wa.me/${lead.phone.replace(/\D/g, "")}`)}
        >
          <Text style={styles.actionText}>💬 WhatsApp</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionLabel}>Status</Text>
      <View style={styles.statusRow}>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            style={[styles.statusChip, lead.status === s && styles.statusChipActive]}
            onPress={() => handleStatusChange(s)}
          >
            <Text
              style={[styles.statusChipText, lead.status === s && styles.statusChipTextActive]}
            >
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: "#0F172A" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0F172A" },
  name: { fontSize: 24, fontWeight: "700", color: "#fff" },
  phone: { color: "#94A3B8", marginTop: 4, fontSize: 16 },
  score: { color: "#34D399", marginTop: 8, fontWeight: "600" },
  actionRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, backgroundColor: "#1E293B", borderRadius: 10, padding: 14, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "600" },
  sectionLabel: { color: "#94A3B8", marginTop: 28, marginBottom: 10, fontSize: 13, fontWeight: "600" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#1E293B" },
  statusChipActive: { backgroundColor: "#6366F1" },
  statusChipText: { color: "#94A3B8", fontSize: 13, textTransform: "capitalize" },
  statusChipTextActive: { color: "#fff", fontWeight: "600" },
});
