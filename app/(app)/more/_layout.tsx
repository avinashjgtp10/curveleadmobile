import { router, Stack } from "expo-router";
import { homeOrigin } from "@/navigation/homeOrigin";

// When a feature is opened straight from Home, the More tab's stack must still start with the menu.
// Without this the feature becomes the stack's only screen, so it is never popped and tapping More
// later shows that feature instead of the menu.
export const unstable_settings = { initialRouteName: "index" };

export default function MoreLayout() {
  return (
    <Stack
      screenOptions={{ headerShown: false }}
      screenListeners={({ navigation, route }) => ({
        beforeRemove: (event) => {
          if (!homeOrigin.current) return;
          const routes = navigation.getState().routes;
          const isTop = routes[routes.length - 1]?.key === route.key;
          // Only when this screen sits directly on the More menu: deeper screens (e.g. a campaign's
          // "new" page) should still go back to their own parent.
          if (!isTop || routes[routes.length - 2]?.name !== "index") return;
          homeOrigin.current = false;
          // Go straight to Home instead of popping to the menu first, which flashed the More menu. The More tab
          // resets itself to the menu when it loses focus (popToTopOnBlur in the tab layout).
          event.preventDefault();
          router.navigate("/(app)");
        },
      })}
    />
  );
}
