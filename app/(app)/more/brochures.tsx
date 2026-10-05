import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  TextInput as RNTextInput, View,
} from "react-native";
import { ActivityIndicator, Appbar, Button, Text } from "react-native-paper";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, tabBarStyleFor } from "@/theme";
import { Brochure, deleteBrochure, fetchBrochures, uploadBrochure } from "@/api/brochures";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const CATEGORIES = ["Products", "Services", "Pricing", "Company", "General"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string" ? error.response.data.error : fallback;
}

function formatSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function shortDate(value?: string) {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function pretty(value?: string) {
  if (!value) return "General";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileLook(mimeType?: string) {
  if (mimeType?.includes("pdf")) return { icon: "document-text" as const, color: "#dc2626", bg: "#fee2e2", label: "PDF" };
  if (mimeType?.startsWith("image")) return { icon: "image" as const, color: "#2563eb", bg: "#dbeafe", label: "Image" };
  return { icon: "document" as const, color: "#64748b", bg: "#eef2f6", label: "File" };
}

function FieldError({ message }: { message: string }) {
  return (
    <View style={styles.fieldError} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={styles.fieldErrorText}>{message}</Text>
    </View>
  );
}

export default function BrochuresScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("General");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Messages under each field, set when Upload is pressed and cleared as soon as that field is fixed.
  const [fieldErrors, setFieldErrors] = useState({ file: "", name: "" });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try { setBrochures(await fetchBrochures()); }
    catch (loadError) { setError(errorMessage(loadError, "Could not load brochures.")); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // The upload form is a full page: hide the tab bar and let the phone's back button close it.
  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: uploadOpen ? { display: "none" } : tabBarStyleFor(insets.bottom) });
    return () => { parent?.setOptions({ tabBarStyle: tabBarStyleFor(insets.bottom) }); };
  }, [uploadOpen, navigation, insets.bottom]);

  useEffect(() => {
    if (!uploadOpen) return undefined;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { if (!uploading) setUploadOpen(false); return true; });
    return () => sub.remove();
  }, [uploadOpen, uploading]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: brochures.length };
    CATEGORIES.forEach((name) => { result[name.toLowerCase()] = 0; });
    brochures.forEach((item) => {
      const key = (item.category || "general").toLowerCase();
      result[key] = (result[key] || 0) + 1;
    });
    return result;
  }, [brochures]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return brochures.filter((item) =>
      (filter === "all" || (item.category || "general").toLowerCase() === filter) &&
      (!term || item.name.toLowerCase().includes(term) || (item.category || "").toLowerCase().includes(term)));
  }, [brochures, filter, search]);

  const totalViews = brochures.reduce((sum, item) => sum + (item.views || 0), 0);
  const totalShares = brochures.reduce((sum, item) => sum + (item.times_shared || 0), 0);

  function openUpload() {
    setPickedFile(null);
    setUploadName("");
    setUploadCategory("General");
    setUploadError("");
    setFieldErrors({ file: "", name: "" });
    setUploadOpen(true);
  }

  async function pickFile() {
    const picked = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    setPickedFile(file);
    setUploadError("");
    setFieldErrors((current) => ({ ...current, file: "" }));
    if (!uploadName.trim()) setUploadName(file.name.replace(/\.[^/.]+$/, ""));
  }

  async function confirmUpload() {
    const found = {
      file: pickedFile ? "" : "Choose a PDF or image to upload.",
      name: uploadName.trim() ? "" : "Give this brochure a name.",
    };
    setFieldErrors(found);
    if (found.file || found.name) { setUploadError(found.file || found.name); return; }
    if (!pickedFile) return;
    setUploading(true);
    setUploadError("");
    try {
      await uploadBrochure({ uri: pickedFile.uri, name: pickedFile.name, mimeType: pickedFile.mimeType }, uploadName.trim(), uploadCategory);
      setUploadOpen(false);
      load(true);
    } catch (uploadErr) {
      setUploadError(errorMessage(uploadErr, "Could not upload this file."));
    } finally { setUploading(false); }
  }

  function openBrochure(brochure: Brochure) {
    if (!brochure.file_url) { Alert.alert("No preview", "This brochure doesn't have a file link."); return; }
    Linking.openURL(brochure.file_url).catch(() => Alert.alert("Could not open", "This brochure link is not available right now."));
  }

  // Straight to WhatsApp with the brochure link typed in; pick the chat there.
  async function shareBrochure(brochure: Brochure) {
    const text = brochure.file_url ? `${brochure.name}: ${brochure.file_url}` : brochure.name;
    try { await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`); }
    catch { Alert.alert("Couldn't open WhatsApp", "Make sure WhatsApp is installed on this phone."); }
  }

  function confirmDelete(brochure: Brochure) {
    Alert.alert("Delete brochure?", `"${brochure.name}" will be removed for your whole team.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await deleteBrochure(brochure.id); load(true); }
        catch (deleteError) { Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again.")); }
      } },
    ]);
  }

  const filters = [{ key: "all", label: "All" }, ...CATEGORIES.map((name) => ({ key: name.toLowerCase(), label: name }))];
  const look = pickedFile ? fileLook(pickedFile.mimeType) : null;

  return (
    <View style={styles.screen}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Brochures" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      {loading ? (
        <View style={styles.state}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : error && !brochures.length ? (
        <View style={styles.state}>
          <Ionicons name="cloud-offline-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={() => load()} style={{ marginTop: 8 }}>Try again</Button>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 170 }]}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.primary} colors={[colors.primary]} />}
        >
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{brochures.length}</Text><Text style={styles.summaryLabel}>Brochures</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{totalShares}</Text><Text style={styles.summaryLabel}>Shares</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{totalViews}</Text><Text style={styles.summaryLabel}>Views</Text></View>
          </LinearGradient>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <RNTextInput value={search} onChangeText={setSearch} placeholder="Search brochures" placeholderTextColor={colors.textMuted} style={styles.searchField} />
            {search ? <Pressable onPress={() => setSearch("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {filters.map((item) => {
              const active = filter === item.key;
              return (
                <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
                  <View style={[styles.chipCount, active && styles.chipCountActive]}>
                    <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{counts[item.key] || 0}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {visible.length ? visible.map((brochure) => {
            const kind = fileLook(brochure.mime_type);
            return (
              <Pressable key={brochure.id} style={styles.card} onPress={() => openBrochure(brochure)}>
                <View style={styles.cardTop}>
                  <View style={[styles.fileIcon, { backgroundColor: kind.bg }]}>
                    <Ionicons name={kind.icon} size={24} color={kind.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>{brochure.name}</Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {[kind.label, formatSize(brochure.file_size), shortDate(brochure.created_at)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  <View style={styles.tag}><Text style={styles.tagText}>{pretty(brochure.category)}</Text></View>
                </View>

                <View style={styles.cardBottom}>
                  <View style={styles.statsRow}>
                    <Ionicons name="eye-outline" size={14} color={colors.textMuted} /><Text style={styles.statText}>{brochure.views || 0}</Text>
                    <Ionicons name="share-social-outline" size={14} color={colors.textMuted} style={{ marginLeft: 10 }} /><Text style={styles.statText}>{brochure.times_shared || 0}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <Pressable style={styles.shareButton} onPress={() => shareBrochure(brochure)}>
                    <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                    <Text style={styles.shareText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => confirmDelete(brochure)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </Pressable>
            );
          }) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="folder-open-outline" size={32} color={colors.primary} /></View>
              <Text style={styles.emptyTitle}>{brochures.length ? "No brochures match" : "No brochures yet"}</Text>
              <Text style={styles.emptyText}>{brochures.length ? "Try another search or category." : "Upload a PDF or image, then share it with any lead on WhatsApp in one tap."}</Text>
              {!brochures.length ? (
                <Pressable style={styles.emptyButton} onPress={openUpload}>
                  <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                  <Text style={styles.emptyButtonText}>Upload your first brochure</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </ScrollView>
      )}

      {!uploadOpen && !loading && !(error && !brochures.length) ? (
        <Pressable accessibilityLabel="Upload brochure" style={[styles.fabWrap, { bottom: 64 + Math.max(insets.bottom, 8) + 16 }]} onPress={openUpload}>
          <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fab}>
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </Pressable>
      ) : null}

      {uploadOpen ? (
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.overlayHeader, { paddingTop: insets.top + 8 }]}>
            <Pressable onPress={() => !uploading && setUploadOpen(false)} hitSlop={10} style={styles.overlayBack}>
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.overlayTitle}>Upload brochure</Text>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {uploadError ? (
              <View style={styles.formError}><Ionicons name="alert-circle-outline" size={16} color={colors.danger} /><Text style={styles.formErrorText}>{uploadError}</Text></View>
            ) : null}

            <Text style={styles.label}>File <Text style={styles.required}>*</Text></Text>
            <Pressable style={[styles.picker, pickedFile && styles.pickerFilled, !!fieldErrors.file && styles.fieldInvalid]} onPress={pickFile}>
              {look && pickedFile ? (
                <>
                  <View style={[styles.fileIcon, { backgroundColor: look.bg }]}><Ionicons name={look.icon} size={24} color={look.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName} numberOfLines={1}>{pickedFile.name}</Text>
                    <Text style={styles.cardMeta}>{[look.label, formatSize(pickedFile.size)].filter(Boolean).join(" · ")} · Tap to change</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                </>
              ) : (
                <View style={styles.pickerEmpty}>
                  <Ionicons name="cloud-upload-outline" size={30} color={colors.primary} />
                  <Text style={styles.pickerTitle}>Choose a PDF or image</Text>
                  <Text style={styles.pickerHint}>PDF, JPG, PNG or WEBP</Text>
                </View>
              )}
            </Pressable>

            {fieldErrors.file ? <FieldError message={fieldErrors.file} /> : null}

            <Text style={styles.label}>Name <Text style={styles.required}>*</Text></Text>
            <View style={[styles.input, !!fieldErrors.name && styles.fieldInvalid]}>
              <RNTextInput value={uploadName} onChangeText={(value) => { setUploadName(value); setUploadError(""); setFieldErrors((current) => ({ ...current, name: "" })); }} placeholder="e.g. Summer price list" placeholderTextColor={colors.textMuted} style={styles.inputText} />
            </View>
            {fieldErrors.name ? <FieldError message={fieldErrors.name} /> : null}

            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map((name) => {
                const active = uploadCategory === name;
                return (
                  <Pressable key={name} onPress={() => setUploadCategory(name)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={[styles.formFooter, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable onPress={confirmUpload} disabled={uploading} style={uploading && { opacity: 0.6 }}>
              <LinearGradient colors={["#0ea5e9", "#4f46e5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveButton}>
                {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="cloud-upload" size={19} color="#fff" />}
                <Text style={styles.saveText}>{uploading ? "Uploading..." : "Upload brochure"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f4f9fc" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
  state: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30, gap: 8 },
  errorText: { color: colors.danger, fontSize: 13, textAlign: "center" },
  content: { padding: 14, gap: 12 },

  summary: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingVertical: 16 },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryValue: { color: "#fff", fontSize: 24, fontWeight: "900" },
  summaryLabel: { color: "rgba(255,255,255,0.88)", fontSize: 12, fontWeight: "700", marginTop: 1 },
  summaryDivider: { width: 1, height: 34, backgroundColor: "rgba(255,255,255,0.3)" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", paddingHorizontal: 12, minHeight: 46 },
  searchField: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 },

  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { gap: 8, paddingVertical: 2, alignItems: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d7e6f1" },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: "#ffffff" },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: "#eef4f9", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  chipCountActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  chipCountText: { color: colors.textSecondary, fontSize: 11, fontWeight: "800" },
  chipCountTextActive: { color: "#ffffff" },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 12 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cardName: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  tag: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 8 },
  statsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  shareButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#16a34a", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  shareText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  deleteButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", paddingTop: 40, paddingHorizontal: 24, gap: 6 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },
  emptyButton: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  emptyButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },

  fabWrap: { position: "absolute", right: 18 },
  fab: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#4f46e5", shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 8 },

  overlay: { ...StyleSheet.absoluteFill, zIndex: 50, elevation: 50, backgroundColor: "#ffffff" },
  overlayHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSoft },
  overlayBack: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  overlayTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  formContent: { padding: 16, paddingBottom: 24 },
  formError: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  formErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "700" },
  label: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 18, marginBottom: 8 },
  required: { color: colors.danger },
  fieldInvalid: { borderColor: colors.danger },
  fieldError: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  fieldErrorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600" },
  picker: { borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: "#bae6fd", backgroundColor: "#f0f9ff", padding: 16, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 96 },
  pickerFilled: { borderStyle: "solid", borderColor: "#d7e6f1", backgroundColor: "#ffffff" },
  pickerEmpty: { flex: 1, alignItems: "center", gap: 4 },
  pickerTitle: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  pickerHint: { color: colors.textMuted, fontSize: 12 },
  input: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, justifyContent: "center" },
  inputText: { color: colors.text, fontSize: 15 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formFooter: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderSoft, backgroundColor: "#ffffff" },
  saveButton: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  saveText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
});
