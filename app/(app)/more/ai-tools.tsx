import { GlassBackground, glass, GradientIcon } from "@/components/Glass";
import { generateAiImages } from "@/api/ai";
import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Appbar, Button, TextInput } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PlaceholderScreen } from "@/components/PlaceholderScreen";

function PlaceholderAiToolsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="✨"
      title="AI Tools"
      description="Wire to POST /api/ai/score-lead/:id, /score-bulk, /summarize/:leadId, /qualify, /market-analysis. These also surface contextually on lead detail."
    />
  );
}

const IMAGE_SAMPLES = [
  { caption: "Product shot", source: require("../../../assets/ai-samples/product-shot.png") },
  { caption: "Studio look", source: require("../../../assets/ai-samples/studio-look.png") },
  { caption: "Lifestyle", source: require("../../../assets/ai-samples/lifestyle.png") },
  { caption: "Fashion", source: require("../../../assets/ai-samples/fashion.png") },
  { caption: "Glow", source: require("../../../assets/ai-samples/glow.png") },
  { caption: "Salon color", source: require("../../../assets/ai-samples/salon-color.png") },
  { caption: "Bridal makeup", source: require("../../../assets/ai-samples/bridal-makeup.png") },
  { caption: "Spa facial", source: require("../../../assets/ai-samples/spa-facial.png") },
];

const STYLES = ["Food", "Product", "Salon", "Spa", "Festival", "Fashion", "Bridal"];
const SIZES = ["1:1", "4:5", "9:16"];

export default function AiToolsScreen() {
  const insets = useSafeAreaInsets();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLES[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [busy, setBusy] = useState(false);
  const [generatedImageUri, setGeneratedImageUri] = useState("");
  const [error, setError] = useState("");

  const previewItems = useMemo(() => IMAGE_SAMPLES.slice(0, 8), []);

  function buildImagePrompt() {
    return [
      prompt.trim(),
      `${style} style`,
      `${size} aspect ratio`,
      "high quality marketing creative, clean composition, professional lighting",
    ].join(", ");
  }

  async function createImage() {
    if (!prompt.trim()) {
      Alert.alert("Add a prompt", "Write what you want the AI Agent to create.");
      return;
    }
    setBusy(true);
    setError("");
    setGeneratedImageUri("");
    try {
      const [uri] = await generateAiImages(buildImagePrompt(), 1);
      setGeneratedImageUri(uri);
    } catch (createError: any) {
      setError(createError?.response?.data?.error || createError?.message || "Could not create this image. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <GlassBackground />
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="AI Agent" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <GradientIcon tone="emerald" size={40}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </GradientIcon>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Create image</Text>
              <Text style={styles.heroSub}>AI Agent for creatives, campaigns and lead work</Text>
            </View>
          </View>

          <TextInput
            mode="outlined"
            dense
            multiline
            numberOfLines={2}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the image or marketing asset"
            style={styles.prompt}
            outlineStyle={styles.promptOutline}
          />

          <View style={styles.optionBlock}>
            <Text style={styles.optionLabel}>Style</Text>
            <View style={styles.styleChipWrap}>
              {STYLES.map((item) => (
                <Pressable key={item} style={[styles.pill, style === item && styles.pillActive]} onPress={() => setStyle(item)}>
                  <Text style={[styles.pillText, style === item && styles.pillTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.optionBlock}>
            <Text style={styles.optionLabel}>Size</Text>
            <View style={styles.sizeRow}>
              {SIZES.map((item) => (
                <Pressable key={item} style={[styles.sizePill, size === item && styles.pillActive]} onPress={() => setSize(item)}>
                  <Text style={[styles.pillText, size === item && styles.pillTextActive]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Button mode="contained" icon="image-plus" loading={busy} disabled={busy} onPress={createImage} style={styles.createButton} contentStyle={styles.createButtonContent}>
            Create image
          </Button>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {generatedImageUri ? (
            <ImageBackground source={{ uri: generatedImageUri }} style={styles.generatedImageSingle} imageStyle={styles.generatedImageMedia}>
              <View style={styles.generatedImageLabel}>
                <Text style={styles.generatedImageText}>AI image · {size}</Text>
              </View>
            </ImageBackground>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={18} color={colors.textMuted} />
              <Text style={styles.imagePlaceholderText}>{busy ? "Creating preview..." : "Your generated image will appear here."}</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>AI image styles</Text>
          <Text style={styles.sectionAction}>All</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
          {previewItems.map((item) => (
            <Pressable key={item.caption} onPress={() => setStyle(item.caption)}>
              <ImageBackground source={item.source} style={[styles.imageCard, style === item.caption && styles.imageCardActive]} imageStyle={styles.image}>
                <View style={styles.imageLabelWrap}>
                  <Text style={styles.imageLabel} numberOfLines={1}>{item.caption}</Text>
                </View>
              </ImageBackground>
            </Pressable>
          ))}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: "transparent" },
  headerTitle: { color: colors.text, fontSize: 17, fontFamily: "DMSans_700Bold" },
  content: { paddingHorizontal: 16, paddingTop: 4 },
  hero: { ...glass, padding: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.78)" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  heroTitle: { color: colors.text, fontSize: 17, fontFamily: "DMSans_700Bold" },
  heroSub: { color: colors.textMuted, fontSize: 11, lineHeight: 15, marginTop: 1 },
  prompt: { minHeight: 64, backgroundColor: "rgba(255,255,255,0.8)", fontSize: 12 },
  promptOutline: { borderRadius: 12, borderColor: colors.border },
  optionBlock: { marginTop: 10 },
  optionLabel: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold", marginBottom: 6 },
  chipRow: { gap: 7, paddingRight: 4 },
  styleChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  pill: { minHeight: 30, justifyContent: "center", borderRadius: 9, paddingHorizontal: 10, backgroundColor: "rgba(255,255,255,0.74)", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textSecondary, fontSize: 11, fontFamily: "Inter_700Bold" },
  pillTextActive: { color: "#fff" },
  sizeRow: { flexDirection: "row", gap: 7 },
  sizePill: { flex: 1, minHeight: 30, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "rgba(255,255,255,0.74)", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  createButton: { marginTop: 12, borderRadius: 24 },
  createButtonContent: { height: 40 },
  errorText: { color: colors.danger, fontSize: 11, fontFamily: "Inter_600SemiBold", textAlign: "center", marginTop: 8 },
  imagePlaceholder: { minHeight: 42, marginTop: 10, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, backgroundColor: "rgba(255,255,255,0.42)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  imagePlaceholderText: { color: colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  generatedImageSingle: { width: "100%", height: 200, marginTop: 10, borderRadius: 12, overflow: "hidden", justifyContent: "flex-end", backgroundColor: colors.surfaceMuted },
  generatedImageMedia: { borderRadius: 12 },
  generatedImageLabel: { backgroundColor: "rgba(15,23,42,0.48)", paddingHorizontal: 10, paddingVertical: 8 },
  generatedImageText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, marginBottom: 9 },
  sectionTitle: { color: colors.text, fontSize: 13, fontFamily: "DMSans_700Bold" },
  sectionAction: { color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" },
  imageRow: { gap: 8, paddingRight: 8 },
  imageCard: { width: 96, height: 120, overflow: "hidden", justifyContent: "flex-end" },
  image: { borderRadius: 12 },
  imageLabelWrap: { backgroundColor: "rgba(15,23,42,0.42)", paddingHorizontal: 7, paddingVertical: 6 },
  imageLabel: { color: "#fff", fontSize: 10, textAlign: "center", fontFamily: "Inter_700Bold" },
  imageCardActive: { borderWidth: 2, borderColor: colors.primary },
});
