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

// The pickers compare the minimum down to the millisecond, so "now" as the minimum can leave today itself unselectable.
// They get the start of that day instead; a time that has already passed today is moved to a few minutes from now.
function startOfDay(date: Date) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function notInThePast(date: Date, minimum?: Date) {
  if (!minimum || date.getTime() >= minimum.getTime() - 60_000) return date;
  const next = new Date(Date.now() + 5 * 60_000);
  next.setSeconds(0, 0);
  next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5);
  return next;
}

// One-tap times for scheduling, like the web form. A time that has already passed today (e.g. "Today 4 pm" after 4 pm) is shown greyed out.
function quickPickOptions() {
  const at = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d; };
  const options = [
    { label: "Today 4 pm", date: at(0, 16) },
    { label: "Tomorrow 11 am", date: at(1, 11) },
    { label: "In 2 days", date: at(2, 10) },
    { label: "Next week", date: at(7, 10) },
  ];
  return options.map((option) => ({ ...option, past: option.date.getTime() <= Date.now() }));
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDateOnly(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function DateTimeField({ value, onChange, minimumDate, mode = "datetime", quickPicks = false }: {
  value: Date; onChange: (date: Date) => void; minimumDate?: Date; mode?: "date" | "datetime";
  /** Shows the one-tap chips (Today 4 pm, Tomorrow 11 am, In 2 days, Next week) above the field. */
  quickPicks?: boolean;
}) {
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const dateOnly = mode === "date";

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        minimumDate: minimumDate ? startOfDay(minimumDate) : undefined,
        onChange: (dateEvent, pickedDate) => {
          if (dateEvent.type !== "set" || !pickedDate) return;
          if (dateOnly) { onChange(pickedDate); return; }
          DateTimePickerAndroid.open({
            value: pickedDate,
            mode: "time",
            onChange: (timeEvent, pickedTime) => {
              if (timeEvent.type !== "set" || !pickedTime) return;
              const combined = new Date(pickedDate);
              combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              onChange(notInThePast(combined, minimumDate));
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
      {quickPicks && !dateOnly ? (
        <View style={styles.chipRow}>
          {quickPickOptions().map((option) => {
            const selected = !option.past && Math.abs(option.date.getTime() - value.getTime()) < 60_000;
            return (
              <Pressable
                key={option.label} disabled={option.past} style={[styles.chip, selected && styles.chipSelected, option.past && styles.chipPast]}
                onPress={() => onChange(option.date)} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ disabled: option.past }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected, option.past && styles.chipTextPast]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Pressable style={styles.field} onPress={open}>
        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} style={styles.icon} />
        <Text style={styles.fieldText}>{dateOnly ? formatDateOnly(value) : formatDateTime(value)}</Text>
        <Ionicons name="pencil" size={13} color={colors.textSecondary} />
      </Pressable>

      {Platform.OS === "ios" ? (
        <Modal visible={iosPickerOpen} transparent animationType="fade" onRequestClose={() => setIosPickerOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosPickerOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <View style={styles.sheetHandle} />
              <DateTimePicker value={draft} mode={dateOnly ? "date" : "datetime"} display="spinner" minimumDate={minimumDate ? startOfDay(minimumDate) : undefined} onChange={(_, date) => date && setDraft(date)} />
              <Button mode="contained" onPress={() => { onChange(dateOnly ? draft : notInThePast(draft, minimumDate)); setIosPickerOpen(false); }} style={styles.doneButton} contentStyle={styles.doneButtonContent}>Done</Button>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "#cfe3f1", backgroundColor: colors.surface },
  chipSelected: { borderColor: "#0b6b97", backgroundColor: "#e1eef7" },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextSelected: { color: "#0b6b97" },
  chipPast: { borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  chipTextPast: { color: "#a1a9b8" },
  field: { flexDirection: "row", alignItems: "center", minHeight: 46, paddingHorizontal: 14, backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cfe3f1", borderRadius: 10 },
  icon: { marginRight: 10 },
  fieldText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(22,22,22,0.45)" },
  sheet: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24, backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: "center" },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 10 },
  doneButton: { alignSelf: "stretch", marginTop: 12 },
  doneButtonContent: { height: 48 },
});
