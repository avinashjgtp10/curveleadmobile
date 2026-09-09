import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function ReportsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="📊"
      title="Reports"
      description="Wire to GET /api/reports/summary, /conversion, /by-source, /by-staff, /by-campaign, /timeline. Charts via recharts-equivalent (e.g. victory-native)."
    />
  );
}
