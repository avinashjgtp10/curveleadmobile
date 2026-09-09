import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme";

export function defaultFollowupDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(10, 0, 0, 0);
  return date;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DateTimeField({ value, onChange, minimumDate }: { value: Date; onChange: (date: Date) => void; minimumDate?: Date }) {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        minimumDate,
        onChange: (dateEvent, pickedDate) => {
          if (dateEvent.type !== "set" || !pickedDate) return;
          DateTimePickerAndroid.open({
            value: pickedDate,
            mode: "time",
            onChange: (timeEvent, pickedTime) => {
              if (timeEvent.type !== "set" || !pickedTime) return;
              const combined = new Date(pickedDate);
              combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              onChange(combined);
            },
          });
        },
      });
    } else {
      setDraft(value);
      setIosPickerOpen(true);
    }
  }

  return (
    <>
      <Pressable style={styles.field} onPress={open}>
        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={styles.icon} />
        <Text style={styles.fieldText}>{formatDateTime(value)}</Text>
        <Ionicons name="pencil" size={13} color={colors.textSecondary} />
      </Pressable>

      {Platform.OS === "ios" ? (
        <Modal visible={iosPickerOpen} transparent animationType="fade" onRequestClose={() => setIosPickerOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosPickerOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <DateTimePicker value={draft} mode="datetime" display="spinner" minimumDate={minimumDate} onChange={(_, date) => date && setDraft(date)} />
              <Button mode="contained" onPress={() => { onChange(draft); setIosPickerOpen(false); }} style={styles.doneButton} contentStyle={styles.doneButtonContent}>Done</Button>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", minHeight: 46, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  icon: { marginRight: 10 },
  fieldText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: "center" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  doneButton: { alignSelf: "stretch", marginTop: 12 },
  doneButtonContent: { height: 48 },
});
