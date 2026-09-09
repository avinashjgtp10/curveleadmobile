import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function CampaignsScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="📣"
      title="Campaigns"
      description="Wire to GET /api/campaigns (list) and GET /api/campaigns/stats/summary. Push to /(app)/more/campaigns/:id for detail, /(app)/more/campaigns/new to create."
    />
  );
}
