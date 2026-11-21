import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { ImportLeadsResult, importLeadsFile } from "@/api/leads";
import { notifyLeadsAdded } from "@/api/notifications";

// Android phones label .csv files in different ways (and some file managers report no type at all),
// so CSV is accepted under every common label instead of greying the file out.
const FILE_TYPES = [
  "text/csv",
  "text/comma-separated-values",
  "application/csv",
  "application/x-csv",
  "text/x-csv",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// Same palette as the Add lead form: pale blue page, white cards, deep teal-blue actions.
const UI = { bg: "#f0f6fa", line: "#cfe3f1", ink: "#0f172a", sub: "#64748b", muted: "#94a3b8", teal: "#0b6b97", tealSoft: "#e1eef7" };

const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

export default function ImportLeadsScreen() {
  const insets = useSafeAreaInsets();
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportLeadsResult | null>(null);

  async function pickAndUpload() {
    setError(""); setResult(null);
    const picked = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    // "octet-stream" lets odd CSV labels through, so the file name decides whether it's really a spreadsheet.
    if (!ALLOWED_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension))) {
      setError("Please choose a CSV, XLS or XLSX file.");
      return;
    }
    setFileName(file.name);
    setUploading(true);
    try {
      const uploaded = await importLeadsFile({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      setResult(uploaded);
      notifyLeadsAdded(uploaded.inserted, "Spreadsheet import").catch(() => {});
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Could not import this file. Check the format and try again."));
    } finally { setUploading(false); }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerButton} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={UI.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>Import leads</Text>
      </View>

      <ScrollView scrollEnabled={!!result} bounces={false} overScrollMode="never" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultCard}>
            <View style={styles.resultIcon}><Ionicons name="checkmark-circle" size={40} color={colors.success} /></View>
            <Text style={styles.resultTitle}>{result.message}</Text>
            <View style={styles.resultStats}>
              <View style={styles.resultStat}><Text style={styles.resultStatValue}>{result.inserted}</Text><Text style={styles.resultStatLabel}>Added</Text></View>
              <View style={styles.resultStat}><Text style={[styles.resultStatValue, result.skipped > 0 && styles.resultStatWarn]}>{result.skipped}</Text><Text style={styles.resultStatLabel}>Skipped</Text></View>
            </View>

            {(result.skip_reasons || []).length ? (
              <Card mode="outlined" style={styles.reasonsCard}>
                <Card.Content>
                  <Text style={styles.reasonsTitle}>Skipped rows</Text>
                  {(result.skip_reasons || []).map((item, index) => (
                    <View key={index} style={styles.reasonRow}>
                      <Text style={styles.reasonRowText}>Row {item.row}{item.name ? ` · ${item.name}` : ""}</Text>
                      <Text style={styles.reasonRowReason}>{item.reason}</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            ) : null}

            <Button mode="contained" buttonColor={UI.teal} textColor="#ffffff" onPress={() => router.replace("/(app)/leads")} style={styles.doneButton} contentStyle={styles.actionButtonContent} labelStyle={styles.actionLabel}>Done</Button>
            <Button mode="text" textColor={UI.teal} onPress={() => { setResult(null); setFileName(""); }} style={styles.againButton}>Import another file</Button>
          </View>
        ) : (
          <>
            <View style={styles.heroIcon}>
              <Ionicons name="document-attach-outline" size={34} color={UI.teal} />
            </View>
            <Text style={styles.title}>Import Clients in a Snap</Text>
            <Text style={styles.subtitle}>Want to quickly add your contacts to CurveLead? Just upload a spreadsheet!</Text>

            {error ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{error}</Text></View> : null}

            <Pressable style={styles.dropzone} onPress={pickAndUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <ActivityIndicator size="large" color={UI.teal} />
                  <Text style={styles.dropzoneTitle}>Uploading {fileName}…</Text>
                </>
              ) : (
                <>
                  <View style={styles.uploadIcon}><Ionicons name="cloud-upload-outline" size={26} color={UI.teal} /></View>
                  <Text style={styles.dropzoneTitle}>Browse and upload</Text>
                  <Text style={styles.dropzoneHint}>Tap to browse. We support CSV, XLS, and XLSX formats.</Text>
                </>
              )}
            </Pressable>

            <View style={styles.tipsCard}>
              <View style={styles.tipsHead}>
                <Ionicons name="bulb-outline" size={18} color={UI.teal} />
                <Text style={styles.tipsTitle}>Spreadsheet tips</Text>
              </View>
              <Text style={styles.tipsText}>
                For a smooth import, use a Name and Phone column at minimum — Email, Source, Stage, Notes, Deal Value, City
                and Date columns are also recognised automatically. Don&apos;t worry if your columns are named a little
                differently, we match common variations.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: UI.line },
  headerButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: UI.ink, fontSize: 16, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16, paddingTop: 16, alignItems: "center" },

  heroIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { color: UI.ink, fontSize: 20, fontFamily: "DMSans_700Bold", textAlign: "center" },
  subtitle: { color: UI.sub, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  errorBanner: { alignSelf: "stretch", backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginTop: 16 },
  errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center" },

  dropzone: { alignSelf: "stretch", minHeight: 160, borderWidth: 2, borderStyle: "dashed", borderColor: UI.line, borderRadius: 14, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", marginTop: 18, paddingHorizontal: 20 },
  uploadIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: UI.tealSoft, alignItems: "center", justifyContent: "center" },
  dropzoneTitle: { color: UI.teal, fontSize: 15, fontFamily: "Inter_700Bold", marginTop: 12 },
  dropzoneHint: { color: UI.sub, fontSize: 11, textAlign: "center", marginTop: 5 },

  tipsCard: { alignSelf: "stretch", backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: UI.line, padding: 14, marginTop: 16 },
  tipsHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  tipsTitle: { color: UI.ink, fontSize: 14, fontFamily: "Inter_700Bold" },
  tipsText: { color: UI.sub, fontSize: 12, lineHeight: 18, marginTop: 8 },

  resultCard: { alignSelf: "stretch", alignItems: "center", paddingTop: 20 },
  resultIcon: { marginBottom: 12 },
  resultTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
  resultStats: { flexDirection: "row", gap: 30, marginTop: 20 },
  resultStat: { alignItems: "center" },
  resultStatValue: { color: colors.success, fontSize: 30, fontWeight: "800" },
  resultStatWarn: { color: colors.warning },
  resultStatLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 4 },

  reasonsCard: { alignSelf: "stretch", marginTop: 24 },
  reasonsTitle: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
  reasonRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  reasonRowText: { color: colors.text, fontSize: 12, fontWeight: "700" },
  reasonRowReason: { color: colors.danger, fontSize: 11, marginTop: 2 },

  doneButton: { alignSelf: "stretch", marginTop: 28, borderRadius: 999 },
  againButton: { alignSelf: "stretch", marginTop: 4 },
  actionButtonContent: { height: 46 },
  actionLabel: { fontWeight: "800" },
});
