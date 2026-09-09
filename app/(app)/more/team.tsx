import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function TeamScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="👥"
      title="Team"
      description="Wire to GET /api/staff (list), POST /api/staff/invite, PUT/DELETE /api/staff/:id. Admin-only, plan-limit gated on invite/create."
    />
  );
}
