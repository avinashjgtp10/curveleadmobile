import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  List,
  Searchbar,
  Text,
  TextInput,
} from "react-native-paper";
import axios from "axios";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import {
  Brochure,
  deleteBrochure,
  fetchBrochures,
  shareBrochure,
  uploadBrochure,
} from "@/api/brochures";
import { fetchLeads, LeadListItem } from "@/api/leads";

const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
type FilterKey = "all" | "products" | "services" | "pricing" | "company";
const CATEGORY_OPTIONS = ["Products", "Services", "Pricing", "Company", "General"];

function errorMessage(error: unknown, fallback: string) {
  return axios.isAxiosError(error) && typeof error.response?.data?.error === "string"
    ? error.response.data.error
    : fallback;
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

const SAMPLE_BROCHURES: Brochure[] = [
  {
    id: "sample-1",
    name: "NewBrochure",
    category: "company",
    file_url: "",
    file_name: "newbrochure.pdf",
    file_size: 182000,
    mime_type: "application/pdf",
    created_at: "2026-01-10T00:00:00.000Z",
  },
  {
    id: "sample-2",
    name: "Brochure",
    category: "products",
    file_url: "",
    file_name: "brochure.pdf",
    file_size: 154000,
    mime_type: "application/pdf",
    created_at: "2026-01-15T00:00:00.000Z",
  },
];

export default function BrochuresScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 560;
  const horizontalPadding = width >= 700 ? 24 : 16;
  const gridColumns = width >= 900 ? 3 : 2;
  const gridGap = width >= 700 ? 16 : 12;
  const cardWidth = (width - horizontalPadding * 2 - gridGap * (gridColumns - 1)) / gridColumns;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [brochures, setBrochures] = useState<Brochure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [createChoiceOpen, setCreateChoiceOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [coverImage, setCoverImage] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadStep, setUploadStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNameError, setUploadNameError] = useState(false);
  const [uploadCategoryError, setUploadCategoryError] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<Brochure | null>(null);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<LeadListItem[]>([]);
  const [sharing, setSharing] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setBrochures(await fetchBrochures());
    } catch (loadError) {
      setError(errorMessage(loadError, "Could not load brochures."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!shareOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!leadQuery.trim()) {
      setLeadResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        setLeadResults((await fetchLeads({ search: leadQuery.trim(), limit: 6 })).leads);
      } catch {
        // best effort
      }
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [leadQuery, shareOpen]);

  function chooseUploadFile() {
    setCreateChoiceOpen(false);
    openUpload();
  }

  function chooseCreateManually() {
    setCreateChoiceOpen(false);
    Alert.alert("Coming soon", "Building a brochure inside CurveLead isn't available yet — upload a ready-made PDF or image for now.");
  }

  function openUpload() {
    setPickedFile(null);
    setCoverImage(null);
    setUploadName("");
    setUploadCategory("");
    setUploadDescription("");
    setUploadStep(1);
    setUploadError("");
    setUploadNameError(false);
    setUploadCategoryError(false);
    setUploadOpen(true);
  }

  async function pickBrochureFile() {
    const picked = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    const file = picked.assets[0];
    setPickedFile(file);
    setUploadName(file.name.replace(/\.[^/.]+$/, ""));
    setUploadStep(2);
  }

  async function pickCoverImage() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["image/jpeg", "image/png", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (!picked.canceled && picked.assets?.length) setCoverImage(picked.assets[0]);
  }

  async function confirmUpload() {
    if (!pickedFile) return;
    if (!uploadName.trim()) {
      setUploadError("Give this brochure a name.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      await uploadBrochure(
        { uri: pickedFile.uri, name: pickedFile.name, mimeType: pickedFile.mimeType },
        uploadName.trim(),
        uploadCategory.trim() || "general"
      );
      setUploadOpen(false);
      setUploadStep(1);
      load();
    } catch (uploadErr) {
      setUploadError(errorMessage(uploadErr, "Could not upload this file."));
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(brochure: Brochure) {
    Alert.alert("Delete brochure?", `"${brochure.name}" will be removed for your whole team.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteBrochure(brochure.id);
            load();
          } catch (deleteError) {
            Alert.alert("Couldn't delete", errorMessage(deleteError, "Please try again."));
          }
        },
      },
    ]);
  }

  function openShare(brochure: Brochure) {
    setShareTarget(brochure);
    setLeadQuery("");
    setLeadResults([]);
    setShareOpen(true);
  }

  async function shareTo(lead: LeadListItem) {
    if (!shareTarget) return;
    setSharing(true);
    try {
      const result = await shareBrochure(shareTarget.id, lead.id);
      setShareOpen(false);
      if (result.whatsapp_url) {
        Linking.openURL(result.whatsapp_url);
      } else {
        Alert.alert("No phone number", "This lead has no phone number to share via WhatsApp.");
      }
    } catch (shareError) {
      Alert.alert("Couldn't share", errorMessage(shareError, "Please try again."));
    } finally {
      setSharing(false);
    }
  }

  const data = brochures.length ? brochures : SAMPLE_BROCHURES;

  const visibleBrochures = useMemo(() => {
    const term = search.toLowerCase().trim();
    return data.filter((brochure) => {
      const matchesSearch =
        !term ||
        brochure.name.toLowerCase().includes(term) ||
        brochure.category.toLowerCase().includes(term);
      const matchesFilter =
        filter === "all" ||
        brochure.category.toLowerCase() === filter ||
        (filter === "products" && brochure.category.toLowerCase().includes("product")) ||
        (filter === "services" && brochure.category.toLowerCase().includes("service")) ||
        (filter === "pricing" && brochure.category.toLowerCase().includes("pricing")) ||
        (filter === "company" && brochure.category.toLowerCase().includes("company"));
      return matchesSearch && matchesFilter;
    });
  }, [data, filter, search]);

  const stats = useMemo(() => {
    const totalBrochures = data.length;
    const sharedBrochures = Math.min(2, totalBrochures || 2);
    const totalViews = data.reduce((sum, brochure) => sum + (brochure.file_size ? 10 : 0), 0);
    const totalSize = data.reduce((sum, brochure) => sum + brochure.file_size, 0) || 281 * 1024;

    return [
      { label: "Total Brochures", value: `${totalBrochures}`, sub: "All categories", tone: "blue" },
      { label: "Shared Brochures", value: `${sharedBrochures}`, sub: "With leads", tone: "green" },
      { label: "Total Views", value: `${totalViews}`, sub: "All brochures", tone: "orange" },
      { label: "Total Size", value: `${Math.round(totalSize / 1024)} KB`, sub: "All files", tone: "slate" },
    ];
  }, [data]);

  const filterOptions: { key: FilterKey; label: string }[] = [
    { key: "all", label: `All (${data.length})` },
    { key: "products", label: `Products (${data.filter((item) => item.category.toLowerCase().includes("product")).length})` },
    { key: "services", label: `Services (${data.filter((item) => item.category.toLowerCase().includes("service")).length})` },
    { key: "pricing", label: `Pricing (${data.filter((item) => item.category.toLowerCase().includes("pricing")).length})` },
    { key: "company", label: `Company (${data.filter((item) => item.category.toLowerCase().includes("company")).length})` },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#111827" />
          </Pressable>
          <View style={styles.urlBar}>
            <Ionicons name="globe-outline" size={16} color="#374151" />
            <Text style={styles.urlText}>curvelead.com/brochures</Text>
          </View>
        </View>
        <View style={styles.topBarActions}>
          <View style={styles.avatarBubble}><Text style={styles.avatarText}>S</Text></View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalPadding, paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.pageHeader, isCompact && styles.pageHeaderCompact]}>
          <Text style={styles.pageTitle}>CurveLead</Text>
        </View>

        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.statCard,
                { width: cardWidth },
                stat.tone === "blue" ? styles.blueCard : stat.tone === "green" ? styles.greenCard : stat.tone === "orange" ? styles.orangeCard : styles.slateCard,
              ]}
            >
              <View style={styles.statIconWrap}>
                <Ionicons
                  name={
                    stat.tone === "blue"
                      ? "folder-open-outline"
                      : stat.tone === "green"
                        ? "share-social-outline"
                        : stat.tone === "orange"
                          ? "eye-outline"
                          : "document-outline"
                  }
                  size={17}
                  color="#1f2937"
                />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statSub}>{stat.sub}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.toolbar, isCompact && styles.toolbarCompact]}>
          <Searchbar
            placeholder="Search brochures..."
            value={search}
            onChangeText={setSearch}
            style={[styles.searchBar, isCompact && styles.searchBarCompact]}
            inputStyle={styles.searchInput}
            iconColor="#64748b"
            elevation={0}
          />
        </View>

        <View style={styles.filterRow}>
          {filterOptions.map((option) => (
            <Pressable
              key={option.key}
              onPress={() => setFilter(option.key)}
              style={[styles.filterChip, filter === option.key && styles.activeFilterChip]}
            >
              <Text style={[styles.filterText, filter === option.key && styles.activeFilterText]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.list}>
          {visibleBrochures.length ? (
            visibleBrochures.map((brochure, index) => {
              const isPink = index % 2 === 1;
              const openBrochure = () => {
                if (brochure.file_url) {
                  Linking.openURL(brochure.file_url).catch(() => {
                    Alert.alert("Could not open brochure", "This brochure link is not available right now.");
                  });
                } else {
                  Alert.alert("Brochure preview unavailable", "This brochure does not have a preview link.");
                }
              };

              return (
                <Pressable key={brochure.id} style={styles.listRow} onPress={openBrochure}>
                  <View style={[styles.listIconWrap, isPink ? styles.pinkCard : styles.neutralCard]}>
                    <Ionicons name={fileIcon(brochure.mime_type)} size={22} color="#1f2937" />
                  </View>
                  <View style={styles.listBody}>
                    <Text style={styles.listName} numberOfLines={1}>{brochure.name}</Text>
                    <View style={styles.listMetaRow}>
                      <View style={styles.listCategoryTag}><Text style={styles.listCategoryText}>{brochure.category === "company" ? "Company" : "Products"}</Text></View>
                      <Text style={styles.listMetaText}>
                        Created {new Date(brochure.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · 0 Views · 0 Shares
                      </Text>
                    </View>
                  </View>
                  <Pressable style={styles.listShareButton} onPress={() => openShare(brochure)}>
                    <Text style={styles.listShareButtonText}>Share</Text>
                  </Pressable>
                  <Pressable style={styles.listDeleteButton} onPress={() => confirmDelete(brochure)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </Pressable>
              );
            })
          ) : null}

          <Pressable style={styles.listAddRow} onPress={() => setCreateChoiceOpen(true)}>
            <Ionicons name="add" size={18} color="#4f46e5" />
            <Text style={styles.listAddRowText}>Create Brochure</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={createChoiceOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setCreateChoiceOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setCreateChoiceOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.sheetTitle}>Choose how you want to create</Text>
              <Pressable onPress={() => setCreateChoiceOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color="#1f2937" />
              </Pressable>
            </View>

            <Pressable style={styles.choiceRow} onPress={chooseUploadFile}>
              <View style={styles.choiceIconWrap}>
                <Ionicons name="cloud-upload-outline" size={20} color="#4f46e5" />
              </View>
              <View style={styles.choiceBody}>
                <Text style={styles.choiceTitle}>Upload File</Text>
                <Text style={styles.choiceText}>Upload PDF, DOC, or other files</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>

            <Pressable style={styles.choiceRow} onPress={chooseCreateManually}>
              <View style={styles.choiceIconWrap}>
                <Ionicons name="sparkles-outline" size={20} color="#4f46e5" />
              </View>
              <View style={styles.choiceBody}>
                <Text style={styles.choiceTitle}>Create Manually</Text>
                <Text style={styles.choiceText}>Build brochure inside CurveLead</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={uploadOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !uploading && setUploadOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !uploading && setUploadOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.sheetTitle}>Create Brochure</Text>
              <Pressable onPress={() => !uploading && setUploadOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color="#1f2937" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 14) }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.stepper}>
                {["Basic Information", "Upload File", "Preview"].map((label, index) => (
                  <React.Fragment key={label}>
                    <View style={styles.stepItem}>
                      <View style={[styles.stepCircle, uploadStep >= index + 1 && styles.stepCircleActive]}>
                        <Text style={[styles.stepNumber, uploadStep >= index + 1 && styles.stepNumberActive]}>{index + 1}</Text>
                      </View>
                      <Text style={[styles.stepLabel, uploadStep >= index + 1 && styles.stepLabelActive]}>{label}</Text>
                    </View>
                    {index < 2 ? <View style={styles.stepLine} /> : null}
                  </React.Fragment>
                ))}
              </View>
              {uploadError ? (
                <View style={styles.sheetError}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                  <Text style={styles.sheetErrorText}>{uploadError}</Text>
                </View>
              ) : null}
              <View style={[styles.formColumns, isCompact && styles.formColumnsCompact]}>
                <View style={styles.formColumn}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.formFieldLabel}>Brochure Name <Text style={styles.requiredMark}>*</Text></Text>
                  <TextInput
                    mode="outlined"
                    value={uploadName}
                    onChangeText={(value) => { setUploadName(value); if (value.trim()) setUploadNameError(false); }}
                    placeholder="Enter brochure name"
                    error={uploadNameError}
                    maxFontSizeMultiplier={1.1}
                    dense
                    style={[styles.sheetField, styles.compactTextInput]}
                  />
                  <HelperText type="error" visible={uploadNameError} style={styles.compactHelperText}>Brochure name is required.</HelperText>
                  <Text maxFontSizeMultiplier={1.1} style={styles.formFieldLabel}>Category <Text style={styles.requiredMark}>*</Text></Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Select brochure category"
                    accessibilityState={{ expanded: categoryMenuOpen }}
                    style={[styles.categorySelector, uploadCategoryError && styles.categorySelectorError]}
                    onPress={() => setCategoryMenuOpen((open) => !open)}
                  >
                    <Text maxFontSizeMultiplier={1.1} style={[styles.categorySelectorText, !uploadCategory && styles.categoryPlaceholder]}>
                      {uploadCategory || "Select category"}
                    </Text>
                    <Ionicons name={categoryMenuOpen ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
                  </Pressable>
                  {categoryMenuOpen ? (
                    <View style={styles.categoryOptions}>
                      {["Select category", ...CATEGORY_OPTIONS].map((option) => {
                        const isSelected = option === (uploadCategory || "Select category");
                        return (
                          <Pressable
                            key={option}
                            onPress={() => {
                              setUploadCategory(option === "Select category" ? "" : option);
                              setUploadCategoryError(false);
                              setCategoryMenuOpen(false);
                            }}
                            style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                          >
                            <Text maxFontSizeMultiplier={1.1} style={[styles.categoryOptionText, isSelected && styles.categoryOptionTextSelected]}>{option}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  <HelperText type="error" visible={uploadCategoryError} style={styles.compactHelperText}>Category is required.</HelperText>
                  <TextInput
                    mode="outlined"
                    label="Description"
                    value={uploadDescription}
                    onChangeText={(value) => setUploadDescription(value.slice(0, 250))}
                    placeholder="Enter description (optional)"
                    maxFontSizeMultiplier={1.1}
                    multiline
                    numberOfLines={3}
                    dense
                    style={[styles.sheetField, styles.descriptionField]}
                  />
                  <Text style={styles.characterCount}>{uploadDescription.length}/250</Text>
                </View>
                <View style={styles.formColumn}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.formFieldLabel}>Cover Image (Optional)</Text>
                  <Pressable style={styles.coverPicker} onPress={pickCoverImage}>
                    <Ionicons name={coverImage ? "checkmark-circle" : "image-outline"} size={24} color={colors.primary} />
                    <Text style={styles.coverPickerTitle}>{coverImage ? coverImage.name : "Add cover image"}</Text>
                    <Text style={styles.coverPickerText}>JPG, PNG or WEBP</Text>
                    <Text style={styles.coverPickerAction}>Browse Image</Text>
                  </Pressable>
                  <Pressable style={styles.filePicker} onPress={pickBrochureFile}>
                    <Ionicons name={pickedFile ? fileIcon(pickedFile.mimeType || "") : "document-attach-outline"} size={20} color={colors.primary} />
                    <Text style={styles.filePickerText} numberOfLines={1}>{pickedFile?.name || "Choose brochure PDF or image"}</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.modalActions}>
                <Button mode="outlined" onPress={() => setUploadOpen(false)} disabled={uploading} contentStyle={styles.modalActionContent}>Cancel</Button>
                <Button
                  mode="contained"
                  onPress={uploadStep === 1 ? () => {
                    const nameMissing = !uploadName.trim();
                    const categoryMissing = !uploadCategory.trim();
                    setUploadNameError(nameMissing);
                    setUploadCategoryError(categoryMissing);
                    if (nameMissing || categoryMissing) {
                      setUploadError("Enter a brochure name and category.");
                      return;
                    }
                    setUploadError("");
                    setUploadStep(2);
                  } : pickedFile ? confirmUpload : pickBrochureFile}
                  loading={uploading}
                  disabled={uploading}
                  style={styles.sheetPrimaryButton}
                  contentStyle={styles.sheetPrimaryButtonContent}
                >
                  {uploadStep === 1 ? "Next  →" : "Upload"}
                </Button>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={shareOpen} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => !sharing && setShareOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => !sharing && setShareOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share &quot;{shareTarget?.name}&quot;</Text>
            <Searchbar
              value={leadQuery}
              onChangeText={setLeadQuery}
              placeholder="Search & Select Lead"
              autoFocus
              elevation={0}
              style={styles.searchInput}
            />
            {sharing ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 14 }} />
            ) : (
              <View style={styles.suggestions}>
                {leadResults.map((lead) => (
                  <List.Item
                    key={lead.id}
                    title={lead.name}
                    titleNumberOfLines={1}
                    description={lead.phone}
                    onPress={() => shareTo(lead)}
                  />
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
  screen: {
    flex: 1,
    backgroundColor: "#f0f2f5",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    minHeight: 72,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  urlBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    flex: 1,
  },
  urlText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "600",
  },
  topBarActions: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  content: {
    paddingTop: 16,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 18,
  },
  pageHeaderCompact: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  choiceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBody: { flex: 1 },
  choiceTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },
  choiceText: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
  pageTitle: {
    color: "#1f2937",
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 92,
  },
  blueCard: { backgroundColor: "#eef4ff" },
  greenCard: { backgroundColor: "#ecfdf5" },
  orangeCard: { backgroundColor: "#fff7ed" },
  slateCard: { backgroundColor: "#f8fafc" },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statValue: {
    color: "#111827",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  statLabel: {
    color: "#475569",
    fontSize: 11,
    marginTop: 4,
    fontWeight: "600",
  },
  statSub: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 2,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  toolbarCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    gap: 10,
  },
  searchBar: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowOpacity: 0,
  },
  searchBarCompact: {
    flex: 0,
    width: "100%",
  },
  searchInput: {
    fontSize: 15,
    color: "#0f172a",
  },
  filterToggleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginLeft: "auto",
  },
  toolbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toolbarActionsCompact: {
    alignSelf: "flex-end",
  },
  filterButton: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 16,
  },
  filterChip: {
    flexGrow: 1,
    flexBasis: "31%",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#dbe3ef",
    borderRadius: 999,
  },
  activeFilterChip: {
    backgroundColor: "#4f46e5",
    borderColor: "#4f46e5",
  },
  filterText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "600",
  },
  activeFilterText: {
    color: "#ffffff",
  },
  gallery: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  list: {
    gap: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  listIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  listBody: { flex: 1 },
  listName: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
  listMetaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 },
  listCategoryTag: { backgroundColor: "#eef2ff", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  listCategoryText: { color: "#4f46e5", fontSize: 11, fontWeight: "700" },
  listMetaText: { color: "#94a3b8", fontSize: 11 },
  listShareButton: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  listShareButtonText: { color: "#1f2937", fontSize: 12, fontWeight: "700" },
  listDeleteButton: { padding: 4 },
  listAddRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: "#c7d2fe",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 16,
  },
  listAddRowText: { color: "#4f46e5", fontSize: 14, fontWeight: "700" },
  brochureCard: {
    minHeight: 248,
    borderRadius: 18,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 3,
    position: "relative",
  },
  neutralCard: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d9dde3",
  },
  pinkCard: {
    backgroundColor: "#f9dce8",
    borderWidth: 1,
    borderColor: "#f6bfd6",
  },
  addCard: {
    backgroundColor: "#f8fafc",
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#d7dfe8",
    justifyContent: "center",
  },
  addCardInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  brochureMenu: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  brochureIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  brochureName: {
    color: "#111827",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginBottom: 14,
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 6,
  },
  metaTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  metaTag: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "rgba(255,255,255,0.35)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    flexShrink: 1,
  },
  cardFooter: {
    marginTop: "auto",
  },
  cardFooterText: {
    color: "#475569",
    fontSize: 11,
    marginBottom: 8,
    flexShrink: 1,
  },
  smallStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  smallStatText: {
    color: "#475569",
    fontSize: 10,
    marginRight: 6,
  },
  shareButton: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
  },
  shareButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "700",
  },
  addCardIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: "#eef2ff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  addCardTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: "#111827",
    fontWeight: "700",
    marginBottom: 8,
  },
  addCardText: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 18,
  },
  addButton: {
    borderRadius: 12,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 14,
    maxHeight: "68%",
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 99,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 10,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 0,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef0f4",
  },
  stepCircleActive: {
    backgroundColor: "#4f46e5",
  },
  stepNumber: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  stepNumberActive: {
    color: "#fff",
  },
  stepLabel: {
    color: "#94a3b8",
    fontSize: 11,
    marginLeft: 5,
    flexShrink: 1,
  },
  stepLabelActive: {
    color: "#4f46e5",
    fontWeight: "600",
  },
  stepLine: {
    height: 1,
    flex: 1,
    minWidth: 8,
    backgroundColor: "#dbe1ea",
    marginHorizontal: 8,
  },
  formColumns: {
    flexDirection: "row",
    gap: 10,
  },
  formColumnsCompact: {
    flexDirection: "column",
  },
  formColumn: {
    flex: 1,
    minWidth: 0,
  },
  formFieldLabel: {
    color: "#475569",
    fontSize: 11,
    marginBottom: 4,
  },
  compactTextInput: {
    height: 46,
  },
  categoryOptions: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    marginTop: -4,
    marginBottom: 8,
    overflow: "hidden",
  },
  categorySelector: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#bae6fd",
    borderRadius: 7,
    backgroundColor: "#f0f9ff",
    paddingHorizontal: 14,
    marginBottom: 4,
  },
  categorySelectorError: {
    borderColor: colors.danger,
  },
  categorySelectorText: {
    color: "#1f2937",
    fontSize: 14,
  },
  categoryPlaceholder: {
    color: "#64748b",
  },
  categoryOption: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryOptionSelected: {
    backgroundColor: colors.primary,
  },
  categoryOptionText: {
    color: "#1f2937",
    fontSize: 13,
  },
  categoryOptionTextSelected: {
    color: "#ffffff",
    fontWeight: "700",
  },
  requiredMark: {
    color: "#dc2626",
    fontWeight: "700",
  },
  descriptionField: {
    minHeight: 64,
  },
  compactHelperText: {
    marginTop: -4,
    marginBottom: 2,
    paddingHorizontal: 0,
  },
  characterCount: {
    color: "#94a3b8",
    fontSize: 11,
    textAlign: "right",
    marginTop: -4,
    marginBottom: 4,
  },
  coverPicker: {
    minHeight: 80,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#d8dee8",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    marginBottom: 6,
  },
  coverPickerTitle: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  coverPickerText: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 5,
  },
  coverPickerAction: {
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    backgroundColor: "#eef2ff",
    padding: 10,
  },
  filePickerText: {
    flex: 1,
    color: "#334155",
    fontSize: 11,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
  modalActionContent: {
    height: 40,
  },
  sheetError: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  sheetErrorText: {
    color: colors.danger,
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  filePreviewText: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  sheetField: {
    marginBottom: 4,
    backgroundColor: "#fff",
  },
  sheetPrimaryButton: {
    marginTop: 4,
    borderRadius: 10,
  },
  sheetPrimaryButtonContent: {
    height: 42,
  },
  suggestions: {
    marginTop: 8,
    maxHeight: 260,
  },
});
