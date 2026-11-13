import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";

/** "YYYY-MM-DD" in the phone's own time zone, the shape the leads list expects for date_from / date_to. */
export function toYmd(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromYmd(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatYmd(value: string) {
  return fromYmd(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// A date-only field for filters: empty until a day is picked, and it can be cleared again.
export function FilterDateField({ value, onChange, placeholder = "Select date", minimumDate, maximumDate }: {
  value: string; onChange: (value: string) => void; placeholder?: string; minimumDate?: Date; maximumDate?: Date;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());

  function open() {
    const start = value ? fromYmd(value) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start, mode: "date", minimumDate, maximumDate,
        onChange: (event, picked) => { if (event.type === "set" && picked) onChange(toYmd(picked)); },
      });
    } else {
      setDraft(start);
      setIosOpen(true);
    }
  }

  return (
    <>
      <Pressable style={styles.field} onPress={open} accessibilityRole="button" accessibilityLabel={value ? formatYmd(value) : placeholder}>
        <Ionicons name="calendar-outline" size={15} color="#64748b" />
        <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>{value ? formatYmd(value) : placeholder}</Text>
        {value ? (
          <Pressable onPress={() => onChange("")} hitSlop={10} accessibilityLabel="Clear date">
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
          </Pressable>
        ) : null}
      </Pressable>

      {Platform.OS === "ios" ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <DateTimePicker value={draft} mode="date" display="spinner" minimumDate={minimumDate} maximumDate={maximumDate} onChange={(_, date) => date && setDraft(date)} />
              <Pressable style={styles.done} onPress={() => { onChange(toYmd(draft)); setIosOpen(false); }}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { height: 40, borderRadius: 10, borderWidth: 1, borderColor: "#dbe3f1", backgroundColor: "#ffffff", paddingHorizontal: 11, flexDirection: "row", alignItems: "center", gap: 8 },
  text: { flex: 1, color: "#0f172a", fontSize: 13, fontFamily: "Inter_500Medium" },
  placeholder: { color: "#94a3b8", fontFamily: "Inter_400Regular" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  done: { height: 44, borderRadius: 10, backgroundColor: "#2457e6", alignItems: "center", justifyContent: "center", marginTop: 8 },
  doneText: { color: "#ffffff", fontSize: 14, fontFamily: "Inter_700Bold" },
});
