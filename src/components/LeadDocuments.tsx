import React, { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import * as DocumentPicker from "expo-document-picker";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";
import {
  LeadAttachment, MAX_ATTACHMENT_BYTES, deleteLeadAttachment, fetchLeadAttachments, uploadLeadAttachment,
} from "@/api/attachments";

type IconName = keyof typeof Ionicons.glyphMap;

const TYPE_ICON: Record<LeadAttachment["file_type"], { icon: IconName; bg: string; color: string }> = {
  image: { icon: "image-outline", bg: "#e0f2fe", color: "#0369a1" },
  pdf: { icon: "document-text-outline", bg: "#fee2e2", color: "#b91c1c" },
  doc: { icon: "document-outline", bg: "#dbeafe", color: "#1d4ed8" },
  audio: { icon: "musical-notes-outline", bg: "#f3e8ff", color: "#7e22ce" },
  video: { icon: "videocam-outline", bg: "#fef3c7", color: "#b45309" },
  other: { icon: "attach-outline", bg: "#f1f5f9", color: "#475569" },
};

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function sizeText(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function LeadDocuments({ leadId, onChanged }: { leadId: string; onChanged?: () => void }) {
  const [files, setFiles] = useState<LeadAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try { setFiles(await fetchLeadAttachments(leadId)); }
    catch (error) { setLoadError(errorMessage(error, "Could not load documents.")); }
    finally { setLoading(false); }
  }, [leadId]);

  useEffect(() => { load(); }, [load]);

  async function pickAndUpload() {
    if (uploading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert("File too large", "Documents can be up to 5 MB.");
        return;
      }
      setUploading(true);
      await uploadLeadAttachment(leadId, { uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
      await load();
      onChanged?.();
    } catch (error) {
      Alert.alert("Couldn't upload", errorMessage(error, "Please try again."));
    } finally { setUploading(false); }
  }

  function openFile(file: LeadAttachment) {
    Linking.openURL(file.file_url).catch(() => Alert.alert("Unable to open", "This file could not be opened on your phone."));
  }

  function confirmDelete(file: LeadAttachment) {
    Alert.alert("Delete this file?", file.file_name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          setDeletingId(file.id);
          try { await deleteLeadAttachment(leadId, file.id); setFiles((current) => current.filter((item) => item.id !== file.id)); }
          catch (error) { Alert.alert("Couldn't delete", errorMessage(error, "Please try again.")); }
          finally { setDeletingId(""); }
        },
      },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Documents</Text>
        <Pressable onPress={pickAndUpload} disabled={uploading} style={[styles.uploadButton, uploading && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Upload document">
          {uploading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="cloud-upload-outline" size={16} color={colors.primary} />}
          <Text style={styles.uploadText}>{uploading ? "Uploading..." : "Upload"}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} />
      ) : loadError ? (
        <Pressable onPress={() => { setLoading(true); load(); }}><Text style={styles.errorText}>{loadError} Tap to retry.</Text></Pressable>
      ) : files.length ? (
        files.map((file) => {
          const kind = TYPE_ICON[file.file_type] || TYPE_ICON.other;
          return (
            <Pressable key={file.id} onPress={() => openFile(file)} style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: kind.bg }]}><Ionicons name={kind.icon} size={20} color={kind.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fileName} numberOfLines={1}>{file.file_name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {sizeText(file.file_size)}{file.uploaded_by_name ? ` · ${file.uploaded_by_name}` : ""}{dateText(file.uploaded_at) ? ` · ${dateText(file.uploaded_at)}` : ""}
                </Text>
              </View>
              {deletingId === file.id ? <ActivityIndicator size="small" color={colors.danger} /> : (
                <Pressable onPress={() => confirmDelete(file)} hitSlop={10} accessibilityLabel={`Delete ${file.file_name}`}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              )}
            </Pressable>
          );
        })
      ) : (
        <Text style={styles.empty}>No documents yet. Upload a PDF, photo or file (up to 5 MB).</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { color: colors.text, fontSize: 14, fontWeight: "800" },
  uploadButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34, borderRadius: 999, borderWidth: 1, borderColor: "#bae6fd", backgroundColor: "#f0f9ff" },
  uploadText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: "#bae6fd", backgroundColor: "#ffffff" },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  fileName: { color: colors.text, fontSize: 14, fontWeight: "700" },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  empty: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, paddingVertical: 6 },
  errorText: { color: colors.danger, fontSize: 13, paddingVertical: 6 },
});
