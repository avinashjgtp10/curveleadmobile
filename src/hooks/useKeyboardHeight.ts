import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * Height of the on-screen keyboard on Android, 0 when it's closed (and always 0 on iOS, where KeyboardAvoidingView
 * already works). Android doesn't shrink a screen for the keyboard here, so a form's fields and its bottom buttons end
 * up hidden behind it. Add this height as bottom padding on the screen to lift everything above the keyboard.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return undefined;
    const show = Keyboard.addListener("keyboardDidShow", (event) => setHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}
