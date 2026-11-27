import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchStagesWithStatuses, LeadStage, LeadStatus } from "@/api/stages";

const PALETTE: Record<string, { bg: string; text: string }> = {
  blue: { bg: "#D2E1FF", text: "#1D61E7" },
  green: { bg: "#ABFCCC", text: "#0B8464" },
  emerald: { bg: "#ABFCCC", text: "#0B8464" },
  teal: { bg: "#ABFCCC", text: "#0B8464" },
  red: { bg: "#F4BDC5", text: "#A01439" },
  orange: { bg: "#FFB580", text: "#BE4D00" },
  yellow: { bg: "#FFF3B0", text: "#8A6D00" },
  purple: { bg: "#DFC6FE", text: "#43159C" },
  violet: { bg: "#DFC6FE", text: "#43159C" },
  indigo: { bg: "#DDE3FE", text: "#3730A3" },
  pink: { bg: "#FBD4E8", text: "#9D174D" },
  gray: { bg: "#E5E5E5", text: "#666565" },
  grey: { bg: "#E5E5E5", text: "#666565" },
};

const DEFAULT_COLOR = PALETTE.gray;

export function colorForWord(word?: string) {
  if (!word) return DEFAULT_COLOR;
  return PALETTE[word.toLowerCase()] || DEFAULT_COLOR;
}

// Saved on the phone too (cleared on sign-out), so after a restart the status and stage lists are there at once instead of
// the sheets sitting empty until the server answers.
export const STAGES_STORAGE_KEY = "curvelead_stages_cache";
let cachedStages: LeadStage[] | null = null;
let inflight: Promise<LeadStage[]> | null = null;

export function useStages() {
  const [stages, setStages] = useState<LeadStage[]>(cachedStages || []);
  const [loading, setLoading] = useState(!cachedStages);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      inflight = inflight || fetchStagesWithStatuses();
      const result = await inflight;
      cachedStages = result;
      setStages(result);
      AsyncStorage.setItem(STAGES_STORAGE_KEY, JSON.stringify(result)).catch(() => {});
    } catch {
      setError("Could not load pipeline stages.");
    } finally {
      inflight = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedStages) { setStages(cachedStages); setLoading(false); return; }
    let cancelled = false;
    AsyncStorage.getItem(STAGES_STORAGE_KEY).then((raw) => {
      if (cancelled || cachedStages || !raw) return; // the fresh copy already arrived, or nothing saved
      const saved = JSON.parse(raw) as LeadStage[];
      if (Array.isArray(saved) && saved.length) { setStages(saved); setLoading(false); }
    }).catch(() => {});
    load();
    return () => { cancelled = true; };
  }, [load]);

  // Stable between renders (they only change when the stage list does), so memoized rows and effects that depend on
  // them don't redraw every time the screen re-renders.
  const findStage = useCallback((name?: string): LeadStage | undefined => {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    return stages.find((stage) => stage.name.toLowerCase() === lower);
  }, [stages]);

  const colorFor = useCallback((stageName?: string) => colorForWord(findStage(stageName)?.color), [findStage]);

  const statusesFor = useCallback((stageName?: string): LeadStatus[] => {
    const stage = findStage(stageName);
    if (stage?.statuses.length) return stage.statuses;
    // Fall back to every configured status when the current stage has none of its own —
    // mirrors the web app's behaviour (LeadDetailPage.jsx: `stageStatuses[...] || allStatuses`).
    return stages.flatMap((item) => item.statuses);
  }, [stages, findStage]);

  return { stages, loading, error, reload: load, colorFor, statusesFor, findStage };
}
