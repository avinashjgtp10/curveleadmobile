import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View,
} from "react-native";
import { ActivityIndicator, Appbar, Button, Card, IconButton, List, Searchbar, Text, TextInput } from "react-native-paper";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { Brochure, deleteBrochure, fetchBrochures, shareBrochure, uploadBrochure } from "@/api/brochures";
import { fetchLeads, LeadListItem } from "@/api/leads";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function formatSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string): keyof typeof Ionicons.glyphMap {
  if (mimeType?.includes("pdf")) return "document-text";
  if (mimeType?.startsWith("image")) return "image";
  return "document";
}

export default function BrochuresScreen() {
  const insets = useSafeAreaInsets();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Brochure | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [sharing, setSharing] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try { setBrochures(await fetchBrochures()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load brochures.")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!shareOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) { setLeadResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      try { setLeadResults((await fetchLeads({ search: leadQuery.trim(), limit: 6 })).leads); } catch { /* best-effort */ }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [leadQuery, shareOpen]);

  async function openUpload() {
    const picked = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    setPickedFile(file);
    setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    setUploadCategory("");
    setUploadError("");
    setUploadOpen(true);
  }

  async function confirmUpload() {
    if (!pickedFile) return;
    if (!uploadName.trim()) { setUploadError("Give this brochure a name."); return; }
    setUploading(true); setUploadError("");
    try {
      await uploadBrochure({ uri: pickedFile.uri, name: pickedFile.name, mimeType: pickedFile.mimeType }, uploadName.trim(), uploadCategory.trim() || "general");
      setUploadOpen(false);
      load();
    } catch (uploadErr) {
      setUploadError(errorMessage(uploadErr, "Could not upload this file."));
    } finally { setUploading(false); }
  }

  function confirmDelete(brochure: Brochure) {
    Alert.alert("Delete brochure?", `"${brochure.name}" will be removed for your whole team.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteBrochure(brochure.id); load(); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  function openShare(brochure: Brochure) {
    setShareTarget(brochure); setLeadQuery(""); setLeadResults([]); setShareOpen(true);
  }

  async function shareTo(lead: LeadListItem) {
    if (!shareTarget) return;
    setSharing(true);
    try {
      const result = await shareBrochure(shareTarget.id, lead.id);
      setShareOpen(false);
      if (result.whatsapp_url) Linking.openURL(result.whatsapp_url);
      else Alert.alert("No phone number", "This lead has no phone number to share via WhatsApp.");
    } catch (shareError) {
      Alert.alert("Couldn't share", errorMessage(shareError, "Please try again."));
    } finally { setSharing(false); }
  }

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Brochures" titleStyle={styles.headerTitle} />
        <Appbar.Action icon="plus" color={colors.primary} onPress={openUpload} />
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
          {brochures.length ? brochures.map((brochure) => (
            <Card key={brochure.id} mode="outlined" style={styles.card}>
              <Card.Content style={styles.cardContent}>
                <View style={styles.cardIcon}><Ionicons name={fileIcon(brochure.mime_type)} size={22} color={colors.primary} /></View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{brochure.name}</Text>
                  <Text style={styles.cardMeta}>{brochure.category} · {formatSize(brochure.file_size)}</Text>
                </View>
                <View style={styles.cardActions}>
                  <IconButton icon="whatsapp" size={17} iconColor={colors.success} style={styles.iconButton} onPress={() => openShare(brochure)} />
                  <IconButton icon="trash-can-outline" size={16} iconColor={colors.danger} style={styles.iconButton} onPress={() => confirmDelete(brochure)} />
                </View>
              </Card.Content>
            </Card>
          )) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="folder-open-outline" size={30} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>No Brochures Yet</Text>
              <Button mode="outlined" onPress={openUpload} style={styles.emptyButton}>Tap to upload your first file</Button>
            </View>
          )}
        </ScrollView>
      )}

      <Modal visible={uploadOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !uploading && setUploadOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !uploading && setUploadOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Upload Brochure</Text>
            {uploadError ? <View style={styles.sheetError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.sheetErrorText}>{uploadError}</Text></View> : null}
            {pickedFile ? (
              <View style={styles.filePreview}>
                <Ionicons name={fileIcon(pickedFile.mimeType || "")} size={18} color={colors.primary} />
                <Text style={styles.filePreviewText} numberOfLines={1}>{pickedFile.name}</Text>
              </View>
            ) : null}
            <TextInput mode="outlined" label="Name *" value={uploadName} onChangeText={setUploadName} placeholder="e.g. Product Brochure 2025" style={styles.sheetField} />
            <TextInput mode="outlined" label="Category" value={uploadCategory} onChangeText={setUploadCategory} placeholder="e.g. Pricing, Product, Company" style={styles.sheetField} />
            <Button mode="contained" onPress={confirmUpload} loading={uploading} disabled={uploading} style={styles.sheetPrimaryButton} contentStyle={styles.sheetPrimaryButtonContent}>Upload</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={shareOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !sharing && setShareOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !sharing && setShareOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share &quot;{shareTarget?.name}&quot;</Text>
            <Searchbar value={leadQuery} onChangeText={setLeadQuery} placeholder="Search & Select Lead" autoFocus elevation={0} style={styles.searchInput} />
            {sharing ? <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 14 }} /> : (
              <View style={styles.suggestions}>
                {leadResults.map((lead) => (
                  <List.Item key={lead.id} title={lead.name} titleNumberOfLines={1} description={lead.phone} onPress={() => shareTo(lead)} />
                ))}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
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
  cardContent: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1 },
  cardName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  cardMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 3, textTransform: "capitalize" },
  cardActions: { flexDirection: "row" },
  iconButton: { margin: 0 },

  empty: { alignItems: "center", paddingTop: 60 },
  emptyIcon: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 14 },
  emptyButton: { marginTop: 12 },

  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: "center", backgroundColor: colors.border, marginBottom: 14 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800", marginBottom: 14 },
  sheetError: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, marginBottom: 6, borderRadius: 8, backgroundColor: colors.dangerSoft },
  sheetErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  sheetField: { marginBottom: 12 },
  sheetPrimaryButton: { marginTop: 8 },
  sheetPrimaryButtonContent: { height: 48 },
  filePreview: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surfaceMuted, borderRadius: 8, padding: 10, marginBottom: 12 },
  filePreviewText: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "600" },

  searchInput: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  suggestions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginTop: 10, overflow: "hidden" },
});
