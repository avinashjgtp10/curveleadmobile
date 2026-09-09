import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function SuperAdminScreen() {
  return (
    <PlaceholderScreen
      showBack
      icon="🛡️"
      title="Super Admin"
      description="Wire to GET /api/super-admin/stats, /tenants, PUT /tenants/:id, POST /tenants/:id/extend-trial, GET /plans. Platform-wide, super_admin role only."
    />
  );
}
