import { AiAgentPanel } from "@/components/AiAgentPanel";
import { buildImagePrompt, generateAiImages } from "@/api/ai";
import { colors } from "@/theme";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Image, ImageBackground, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput as RNTextInput, View,
} from "react-native";
import { ActivityIndicator, Appbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const IDEAS = [
  { caption: "Product shot", idea: "A clean product shot on a soft studio background", source: require("../../../assets/ai-samples/product-shot.png") },
  { caption: "Studio look", idea: "A professional studio look with soft lighting", source: require("../../../assets/ai-samples/studio-look.png") },
  { caption: "Lifestyle", idea: "A warm lifestyle scene that feels natural and friendly", source: require("../../../assets/ai-samples/lifestyle.png") },
  { caption: "Fashion", idea: "A stylish fashion campaign look", source: require("../../../assets/ai-samples/fashion.png") },
  { caption: "Glow", idea: "A glowing skin and beauty treatment promotion", source: require("../../../assets/ai-samples/glow.png") },
  { caption: "Salon color", idea: "A vibrant hair colour makeover at a salon", source: require("../../../assets/ai-samples/salon-color.png") },
  { caption: "Bridal makeup", idea: "An elegant bridal makeup package announcement", source: require("../../../assets/ai-samples/bridal-makeup.png") },
  { caption: "Spa facial", idea: "A relaxing spa facial offer", source: require("../../../assets/ai-samples/spa-facial.png") },
];

const QUICK_IDEAS = ["Festival sale offer", "Weekend discount", "New service launch", "Grand opening", "Gift voucher"];
const MIN_PROMPT = 15;

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    if (typeof error.response?.data?.error === "string") return error.response.data.error;
    if (error.code === "ECONNABORTED") return "This is taking too long. Please try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function ImagePanel() {
  const [idea, setIdea] = useState("");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [cta, setCta] = useState("");
  const [textOpen, setTextOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [promptEdited, setPromptEdited] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [generationEnabled, setGenerationEnabled] = useState(true);
  const [busy, setBusy] = useState<"" | "prompt" | "images">("");
  const [images, setImages] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState("");

  async function create() {
    if (!idea.trim() && !(promptEdited && prompt.trim())) {
      setError("Tell the AI what the image is for.");
      return;
    }
    setError("");
    setImages([]);
    let finalPrompt = prompt;
    try {
      // The server writes the prompt, unless the person has hand-edited it.
      if (!promptEdited || !finalPrompt.trim()) {
        setBusy("prompt");
        const built = await buildImagePrompt({ idea: idea.trim(), headline: headline.trim(), subline: subline.trim(), cta: cta.trim() });
        finalPrompt = built.prompt;
        setPrompt(built.prompt);
        setGenerationEnabled(built.generationEnabled);
        if (!built.generationEnabled) {
          setPromptOpen(true);
          setError("One-tap image creation isn't switched on for your workspace yet. Copy the prompt below and use it in any AI image tool.");
          return;
        }
      }
      if (finalPrompt.trim().length < MIN_PROMPT) {
        setError("Add a little more detail so the AI can create a good image.");
        return;
      }
      setBusy("images");
      setImages(await generateAiImages(finalPrompt, 2));
      setSelected(0);
    } catch (createError) {
      setError(errorMessage(createError, "Could not create images. Please try again."));
    } finally {
      setBusy("");
    }
  }

  function pickIdea(text: string) {
    setIdea(text);
    setPromptEdited(false);
    setError("");
  }

  async function sharePrompt() {
    try { await Share.share({ message: prompt }); } catch { /* the person closed the share sheet */ }
  }

  const working = busy !== "";

  return (
    <View style={styles.stack}>
      <LinearGradient colors={["#06b6d4", "#6366f1", "#d946ef"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="sparkles" size={24} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>Create marketing images</Text>
          <Text style={styles.heroSub}>Describe it in a few words. The AI makes two options for you.</Text>
        </View>
        <View style={styles.heroCircle} />
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. What is the image for?</Text>
        <View style={styles.inputBox}>
          <RNTextInput
            value={idea} onChangeText={(value) => { setIdea(value); setPromptEdited(false); }} multiline textAlignVertical="top"
            placeholder="e.g. Diwali offer for our salon, 20% off on facials"
            placeholderTextColor={colors.textMuted} style={styles.ideaText}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          {QUICK_IDEAS.map((item) => (
            <Pressable key={item} style={styles.chip} onPress={() => pickIdea(item)}>
              <Text style={styles.chipText}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable style={styles.optionHeader} onPress={() => setTextOpen((open) => !open)}>
          <Ionicons name="text-outline" size={16} color={colors.primary} />
          <Text style={styles.optionTitle}>Add text on the image</Text>
          <Text style={styles.optionHint}>optional</Text>
          <Ionicons name={textOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
        </Pressable>
        {textOpen ? (
          <View style={styles.textFields}>
            {[
              { label: "Headline", value: headline, set: setHeadline, placeholder: "e.g. Diwali Glow Sale" },
              { label: "Sub-line", value: subline, set: setSubline, placeholder: "e.g. 20% off on all facials" },
              { label: "Button text", value: cta, set: setCta, placeholder: "e.g. Book now" },
            ].map((field) => (
              <View key={field.label}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <View style={styles.smallInput}>
                  <RNTextInput
                    value={field.value} onChangeText={(value) => { field.set(value); setPromptEdited(false); }}
                    placeholder={field.placeholder} placeholderTextColor={colors.textMuted} style={styles.smallInputText}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <Pressable onPress={create} disabled={working} style={working && { opacity: 0.7 }}>
          <LinearGradient colors={["#06b6d4", "#6366f1", "#d946ef"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.createButton}>
            {working ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={18} color="#fff" />}
            <Text style={styles.createText}>
              {busy === "prompt" ? "Writing the prompt..." : busy === "images" ? "Creating images (up to a minute)..." : images.length ? "Create new options" : "Create images"}
            </Text>
          </LinearGradient>
        </Pressable>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </View>

      {images.length ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>2. Your images</Text>
          <Image source={{ uri: images[selected] }} style={styles.bigImage} resizeMode="cover" />
          {images.length > 1 ? (
            <View style={styles.thumbRow}>
              {images.map((uri, index) => (
                <Pressable key={uri.slice(-24) + index} onPress={() => setSelected(index)} style={[styles.thumbWrap, selected === index && styles.thumbActive]}>
                  <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  <Text style={[styles.thumbLabel, selected === index && styles.thumbLabelActive]}>Option {index + 1}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {prompt ? (
        <View style={styles.card}>
          <Pressable style={styles.optionHeader} onPress={() => setPromptOpen((open) => !open)}>
            <Ionicons name="document-text-outline" size={16} color={colors.primary} />
            <Text style={styles.optionTitle}>The AI prompt</Text>
            <Text style={styles.optionHint}>{promptEdited ? "edited" : "tap to view or edit"}</Text>
            <Ionicons name={promptOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
          </Pressable>
          {promptOpen ? (
            <>
              <View style={[styles.inputBox, { minHeight: 120 }]}>
                <RNTextInput
                  value={prompt} onChangeText={(value) => { setPrompt(value); setPromptEdited(true); }}
                  multiline textAlignVertical="top" style={styles.promptText}
                />
              </View>
              <View style={styles.promptActions}>
                <Pressable style={styles.smallButton} onPress={sharePrompt}>
                  <Ionicons name="share-outline" size={15} color={colors.primary} />
                  <Text style={styles.smallButtonText}>Share prompt</Text>
                </Pressable>
                {promptEdited ? (
                  <Pressable style={styles.smallButton} onPress={() => { setPromptEdited(false); setPrompt(""); }}>
                    <Ionicons name="refresh-outline" size={15} color={colors.primary} />
                    <Text style={styles.smallButtonText}>Reset</Text>
                  </Pressable>
                ) : null}
              </View>
              {!generationEnabled ? <Text style={styles.noteText}>Image creation isn't switched on for your workspace. Use this prompt in any AI image tool.</Text> : null}
            </>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Need inspiration?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
        {IDEAS.map((item) => (
          <Pressable key={item.caption} onPress={() => pickIdea(item.idea)}>
            <ImageBackground source={item.source} style={styles.imageCard} imageStyle={{ borderRadius: 14 }}>
              <View style={styles.imageLabelWrap}><Text style={styles.imageLabel} numberOfLines={1}>{item.caption}</Text></View>
            </ImageBackground>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export default function AiToolsScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"agent" | "images">("agent");

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Appbar.Header style={styles.header} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="AI Agent" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.segment}>
          <Pressable onPress={() => setTab("agent")} style={[styles.segmentButton, tab === "agent" && styles.segmentActive]}>
            <Ionicons name="logo-whatsapp" size={16} color={tab === "agent" ? "#6366f1" : colors.textSecondary} />
            <Text style={[styles.segmentText, tab === "agent" && styles.segmentTextActive]}>WhatsApp Agent</Text>
          </Pressable>
          <Pressable onPress={() => setTab("images")} style={[styles.segmentButton, tab === "images" && styles.segmentActive]}>
            <Ionicons name="image-outline" size={16} color={tab === "images" ? "#6366f1" : colors.textSecondary} />
            <Text style={[styles.segmentText, tab === "images" && styles.segmentTextActive]}>Images</Text>
          </Pressable>
        </View>

        {tab === "agent" ? <AiAgentPanel /> : <ImagePanel />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  header: { backgroundColor: "#ffffff" },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  stack: { gap: 14 },

  segment: { flexDirection: "row", backgroundColor: "#f1f6fa", borderRadius: 14, padding: 4 },
  segmentButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 11 },
  segmentActive: { backgroundColor: "#ffffff", shadowColor: "#0f172a", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  segmentTextActive: { color: "#6366f1" },

  hero: { borderRadius: 22, padding: 18, flexDirection: "row", alignItems: "center", gap: 14, overflow: "hidden" },
  heroIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  heroTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 12, lineHeight: 17, marginTop: 3 },
  heroCircle: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.12)", right: -30, top: -36 },

  card: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#e2eef7", padding: 14, gap: 10 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
  inputBox: { minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 14, paddingVertical: 4 },
  ideaText: { color: colors.text, fontSize: 14, minHeight: 72, paddingVertical: 8 },
  promptText: { color: colors.text, fontSize: 13, lineHeight: 19, minHeight: 108, paddingVertical: 8 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#f4f1ff", borderWidth: 1, borderColor: "#e4defc" },
  chipText: { color: "#6366f1", fontSize: 13, fontWeight: "700" },

  optionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  optionTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "800" },
  optionHint: { color: colors.textMuted, fontSize: 11 },
  textFields: { gap: 8 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  smallInput: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#d7e6f1", backgroundColor: "#f8fbfd", paddingHorizontal: 12, justifyContent: "center" },
  smallInputText: { color: colors.text, fontSize: 14 },

  createButton: { height: 52, borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 },
  createText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: colors.dangerSoft, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, color: colors.danger, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  bigImage: { width: "100%", aspectRatio: 1, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  thumbRow: { flexDirection: "row", gap: 10 },
  thumbWrap: { flex: 1, borderRadius: 14, borderWidth: 2, borderColor: "transparent", padding: 2, alignItems: "center", gap: 4 },
  thumbActive: { borderColor: "#6366f1" },
  thumb: { width: "100%", aspectRatio: 1, borderRadius: 11, backgroundColor: colors.surfaceMuted },
  thumbLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", paddingBottom: 2 },
  thumbLabelActive: { color: "#6366f1" },

  promptActions: { flexDirection: "row", gap: 10 },
  smallButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  smallButtonText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  noteText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },

  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginTop: 4 },
  imageRow: { gap: 10, paddingRight: 8 },
  imageCard: { width: 104, height: 130, justifyContent: "flex-end", overflow: "hidden", borderRadius: 14 },
  imageLabelWrap: { backgroundColor: "rgba(15,23,42,0.45)", paddingHorizontal: 7, paddingVertical: 6 },
  imageLabel: { color: "#fff", fontSize: 11, textAlign: "center", fontWeight: "800" },
});
