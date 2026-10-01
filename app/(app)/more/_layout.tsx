import { router, Stack } from "expo-router";
import { homeOrigin } from "@/navigation/homeOrigin";

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation, route }) => ({
        beforeRemove: () => {
          if (!homeOrigin.current) return;
          const routes = navigation.getState().routes;
          const isTop = routes[routes.length - 1]?.key === route.key;
          // Only when this screen sits directly on the More menu: deeper screens (e.g. a campaign's
          // "new" page) should still go back to their own parent.
          if (!isTop || routes[routes.length - 2]?.name !== "index") return;
          homeOrigin.current = false;
          // Let the pop happen so the More tab is left showing its menu, then land on Home.
          setTimeout(() => router.navigate("/(app)"), 0);
        },
      })}
    />
  );
}
