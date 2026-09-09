import { useCallback, useEffect, useState } from "react";
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
    } catch {
      setError("Could not load pipeline stages.");
    } finally {
      inflight = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cachedStages) { setStages(cachedStages); setLoading(false); return; }
    load();
  }, [load]);

  function findStage(name?: string): LeadStage | undefined {
    if (!name) return undefined;
    return stages.find((stage) => stage.name.toLowerCase() === name.toLowerCase());
  }

  function colorFor(stageName?: string) {
    return colorForWord(findStage(stageName)?.color);
  }

  function statusesFor(stageName?: string): LeadStatus[] {
    const stage = findStage(stageName);
    if (stage?.statuses.length) return stage.statuses;
    // Fall back to every configured status when the current stage has none of its own —
    // mirrors the web app's behaviour (LeadDetailPage.jsx: `stageStatuses[...] || allStatuses`).
    return stages.flatMap((item) => item.statuses);
  }

  return { stages, loading, error, reload: load, colorFor, statusesFor, findStage };
}
