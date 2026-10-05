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

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function fill(text: string, vars?: Vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

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
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useT must be used inside LanguageProvider");
  return context;
}
