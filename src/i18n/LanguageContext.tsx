import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/contexts/AuthContext";
import { fetchPreferences } from "@/api/preferences";
import { hi } from "./hi";

export const LANGUAGE_KEY = "app_language";

// Languages that actually have translations. Anything else stays in English.
const DICTIONARIES: Record<string, Record<string, string>> = { hi };
export const TRANSLATED_LANGUAGES = ["en", ...Object.keys(DICTIONARIES)];

type Vars = Record<string, string | number>;

interface LanguageContextValue {
  language: string;
  /** Translate English app text. Unknown text comes back unchanged, so screens never break. */
  t: (text: string, vars?: Vars) => string;
  /** Switch the language on this phone straight away. Saving it to the account is the caller's job. */
  setLanguage: (code: string) => void;
}

// Kept on `globalThis` so Fast Refresh (editing this file or hi.ts while Metro runs) reuses the same context object.
// Without it the reload makes a second context: the Provider keeps the old one, screens read the new one, and
// every useT() throws "must be used inside LanguageProvider" until the app is fully reloaded.
const CONTEXT_KEY = "__curveleadLanguageContext";
const LanguageContext: React.Context<LanguageContextValue | undefined> =
  ((globalThis as Record<string, unknown>)[CONTEXT_KEY] as React.Context<LanguageContextValue | undefined> | undefined)
  ?? createContext<LanguageContextValue | undefined>(undefined);
(globalThis as Record<string, unknown>)[CONTEXT_KEY] = LanguageContext;

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

// Shown if a screen ever renders outside the provider: plain English, never a crash.
const ENGLISH_FALLBACK: LanguageContextValue = { language: "en", t: (text, vars) => fill(text, vars), setLanguage: () => {} };

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState("en");

  const setLanguage = useCallback((code: string) => {
    const next = TRANSLATED_LANGUAGES.includes(code) ? code : "en";
    setLanguageState(next);
    AsyncStorage.setItem(LANGUAGE_KEY, next).catch(() => {});
  }, []);

  // Use the last choice immediately so the app never flashes English first.
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      if (stored && TRANSLATED_LANGUAGES.includes(stored)) setLanguageState(stored);
    }).catch(() => {});
  }, []);

  // After signing in, follow the language saved on the account (so a new phone gets it too).
  useEffect(() => {
    if (!user) return;
    fetchPreferences()
      .then((prefs) => { if (prefs?.language && TRANSLATED_LANGUAGES.includes(prefs.language)) setLanguage(prefs.language); })
      .catch(() => {});
  }, [user?.id, setLanguage]);

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = DICTIONARIES[language];
    return {
      language,
      setLanguage,
      t: (text, vars) => fill((dictionary && dictionary[text]) || text, vars),
    };
  }, [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext) ?? ENGLISH_FALLBACK;
}
