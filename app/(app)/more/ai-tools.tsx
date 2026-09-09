import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function AiToolsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="✨"
      title="AI Tools"
      description="Wire to POST /api/ai/score-lead/:id, /score-bulk, /summarize/:leadId, /qualify, /market-analysis. These also surface contextually on lead detail."
    />
  );
}
