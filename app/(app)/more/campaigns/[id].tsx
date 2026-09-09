import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function CampaignDetailScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="📣"
      title="Campaign Detail"
      description="Wire to GET /api/campaigns/:id plus its ROI/leads sub-views (check campaignController.js for exact wiring)."
    />
  );
}
