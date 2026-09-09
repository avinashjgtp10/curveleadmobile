import React from "react";
import Svg, { Path, Circle, Rect, Line, Polyline } from "react-native-svg";
export function IconHome({ active }: { active?: boolean }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill={active ? "#0ea5e9" : "none"} stroke={active ? "#0ea5e9" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <Path d="M9 21V12h6v9" />
    </Svg>
  );
}
export function IconUsers({ active }: { active?: boolean }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#0ea5e9" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <Circle cx="9" cy="7" r="4" />
      <Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Svg>
  );
}
export function IconCheck({ active }: { active?: boolean }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#0ea5e9" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}
export function IconBook({ active }: { active?: boolean }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#0ea5e9" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="7" height="18" rx="1" />
      <Rect x="14" y="3" width="7" height="18" rx="1" />
    </Svg>
  );
}
export function IconGrid({ active }: { active?: boolean }) {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={active ? "#0ea5e9" : "#94a3b8"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="3" width="7" height="7" rx="1" />
      <Rect x="14" y="3" width="7" height="7" rx="1" />
      <Rect x="3" y="14" width="7" height="7" rx="1" />
      <Rect x="14" y="14" width="7" height="7" rx="1" />
    </Svg>
  );
}
export function IconBell() {
  return (
    <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 01-3.46 0" />
    </Svg>
  );
}
export function IconSearch() {
  return (
    <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="11" cy="11" r="8" /><Path d="M21 21l-4.35-4.35" />
    </Svg>
  );
}
export function IconChevronRight() {
  return <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"><Path d="M9 18l6-6-6-6" /></Svg>;
}
export function IconChevronDown() {
  return <Svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"><Path d="M6 9l6 6 6-6" /></Svg>;
}
export function IconAlert() {
  return <Svg width="18" height="18" viewBox="0 0 24 24" fill="#f43f5e" stroke="none"><Path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 13h-2v-2h2v2zm0-4h-2V7h2v4z" /></Svg>;
}
export function IconPlus() {
  return <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"><Path d="M12 5v14M5 12h14" /></Svg>;
}
export function IconEye() {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"><Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><Circle cx="12" cy="12" r="3" /></Svg>;
}
export function IconLogout() {
  return <Svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round"><Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Svg>;
}

// ── Feature icons (replacing emojis) ──────────────────────────────────────

export function SvgUserAdd({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><Circle cx="9" cy="7" r="4"/><Line x1="19" y1="8" x2="19" y2="14"/><Line x1="22" y1="11" x2="16" y2="11"/></Svg>;
}
export function SvgPhone({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.67A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></Svg>;
}
export function SvgMessageSquare({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></Svg>;
}
export function SvgCalendar({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="3" y="4" width="18" height="18" rx="2"/><Line x1="16" y1="2" x2="16" y2="6"/><Line x1="8" y1="2" x2="8" y2="6"/><Line x1="3" y1="10" x2="21" y2="10"/></Svg>;
}
export function SvgTemplate({ color }: { color: string }) {
  return <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="3" y="3" width="18" height="18" rx="2"/><Path d="M3 9h18M9 21V9"/></Svg>;
}
export function SvgFileText({ color }: { color: string }) {
  return <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><Polyline points="14 2 14 8 20 8"/><Line x1="16" y1="13" x2="8" y2="13"/><Line x1="16" y1="17" x2="8" y2="17"/><Line x1="10" y1="9" x2="8" y2="9"/></Svg>;
}
export function SvgReceipt({ color }: { color: string }) {
  return <Svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M4 2v20l3-2 2 2 3-2 3 2 2-2 3 2V2l-3 2-2-2-3 2-3-2-2 2z"/><Line x1="9" y1="9" x2="15" y2="9"/><Line x1="9" y1="13" x2="15" y2="13"/></Svg>;
}
export function SvgGitBranch({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Line x1="6" y1="3" x2="6" y2="15"/><Circle cx="18" cy="6" r="3"/><Circle cx="6" cy="18" r="3"/><Path d="M18 9a9 9 0 01-9 9"/></Svg>;
}
export function SvgMegaphone({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M3 11l19-9-9 19-2-8-8-2z"/></Svg>;
}
export function SvgSparkles({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></Svg>;
}
export function SvgClipboard({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><Rect x="8" y="2" width="8" height="4" rx="1"/></Svg>;
}
export function SvgFolder({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></Svg>;
}
export function SvgMessageCircle({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></Svg>;
}
export function SvgTeam({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><Circle cx="9" cy="7" r="4"/><Path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></Svg>;
}
export function SvgPlug({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Path d="M18.36 6.64a9 9 0 11-12.73 0"/><Line x1="12" y1="2" x2="12" y2="12"/></Svg>;
}
export function SvgBarChart({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Line x1="18" y1="20" x2="18" y2="10"/><Line x1="12" y1="20" x2="12" y2="4"/><Line x1="6" y1="20" x2="6" y2="14"/></Svg>;
}
export function SvgCreditCard({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Rect x="1" y="4" width="22" height="16" rx="2"/><Line x1="1" y1="10" x2="23" y2="10"/></Svg>;
}
export function SvgSettings({ color }: { color: string }) {
  return <Svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><Circle cx="12" cy="12" r="3"/><Path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></Svg>;
}

