import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Appbar, Button, Card, Text } from "react-native-paper";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { ImportLeadsResult, importLeadsFile } from "@/api/leads";

const FILE_TYPES = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

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
    setFileName(file.name);
    setUploading(true);
    try {
      const uploaded = await importLeadsFile({ uri: file.uri, name: file.name, mimeType: file.mimeType });
      setResult(uploaded);
    } catch (uploadError) {
      setError(errorMessage(uploadError, "Could not import this file. Check the format and try again."));
    } finally { setUploading(false); }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Import Clients from Spreadsheet" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultCard}>
            <View style={styles.resultIcon}><Ionicons name="checkmark-circle" size={40} color={colors.success} /></View>
            <Text style={styles.resultTitle}>{result.message}</Text>
            <View style={styles.resultStats}>
              <View style={styles.resultStat}><Text style={styles.resultStatValue}>{result.inserted}</Text><Text style={styles.resultStatLabel}>Added</Text></View>
              <View style={styles.resultStat}><Text style={[styles.resultStatValue, result.skipped > 0 && styles.resultStatWarn]}>{result.skipped}</Text><Text style={styles.resultStatLabel}>Skipped</Text></View>
            </View>

            {result.skip_reasons.length ? (
              <Card mode="outlined" style={styles.reasonsCard}>
                <Card.Content>
                  <Text style={styles.reasonsTitle}>Skipped rows</Text>
                  {result.skip_reasons.map((item, index) => (
                    <View key={index} style={styles.reasonRow}>
                      <Text style={styles.reasonRowText}>Row {item.row}{item.name ? ` · ${item.name}` : ""}</Text>
                      <Text style={styles.reasonRowReason}>{item.reason}</Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            ) : null}

            <Button mode="contained" onPress={() => router.replace("/(app)/leads")} style={styles.doneButton} contentStyle={styles.actionButtonContent}>Done</Button>
            <Button mode="text" onPress={() => { setResult(null); setFileName(""); }} style={styles.againButton}>Import another file</Button>
          </View>
        ) : (
          <>
            <View style={styles.iconRow}>
              <Ionicons name="document-text-outline" size={40} color={colors.primary} />
              <Ionicons name="document-outline" size={48} color={colors.primary} style={{ marginHorizontal: -8 }} />
              <Ionicons name="document-attach-outline" size={40} color={colors.primary} />
            </View>
            <Text style={styles.title}>Import Clients in a Snap</Text>
            <Text style={styles.subtitle}>Want to quickly add your contacts to CurveLead? Just upload a spreadsheet!</Text>

            {error ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{error}</Text></View> : null}

            <Pressable style={styles.dropzone} onPress={pickAndUpload} disabled={uploading}>
              {uploading ? (
                <>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.dropzoneTitle}>Uploading {fileName}…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={34} color={colors.text} />
                  <Text style={styles.dropzoneTitle}>Browse and upload</Text>
                  <Text style={styles.dropzoneHint}>Tap to browse. We support CSV, XLS, and XLSX formats.</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.tipsTitle}>Spreadsheet Tips</Text>
            <Text style={styles.tipsText}>
              For a smooth import, use a Name and Phone column at minimum — Email, Source, Stage, Notes, Deal Value, City
              and Date columns are also recognised automatically. Don&apos;t worry if your columns are named a little
              differently, we match common variations.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.surface },
  headerTitle: { fontSize: 15, fontWeight: "700" },
  content: { paddingHorizontal: 24, paddingTop: 26, alignItems: "center" },

  iconRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", textAlign: "center" },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  errorBanner: { alignSelf: "stretch", backgroundColor: colors.dangerSoft, borderRadius: 10, padding: 12, marginTop: 16 },
  errorBannerText: { color: colors.danger, fontSize: 12, fontWeight: "600", textAlign: "center" },

  dropzone: { alignSelf: "stretch", minHeight: 180, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginTop: 24, paddingHorizontal: 20 },
  dropzoneTitle: { color: colors.text, fontSize: 15, fontWeight: "700", marginTop: 12 },
  dropzoneHint: { color: colors.textMuted, fontSize: 11, textAlign: "center", marginTop: 5 },

  tipsTitle: { alignSelf: "flex-start", color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 28 },
  tipsText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },

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

  doneButton: { alignSelf: "stretch", marginTop: 28 },
  againButton: { alignSelf: "stretch", marginTop: 4 },
  actionButtonContent: { height: 46 },
});
