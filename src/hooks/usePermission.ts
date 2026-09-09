import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types";

export function hasRole(role: UserRole | undefined, allowed: UserRole[]) {
  return !!role && allowed.includes(role);
}

export function usePermission() {
  const { user } = useAuth();
  return {
    role: user?.role,
    can: (allowed: UserRole[]) => hasRole(user?.role, allowed),
    isAdmin: hasRole(user?.role, ["admin", "super_admin"]),
    isSuperAdmin: hasRole(user?.role, ["super_admin"]),
  };
}
