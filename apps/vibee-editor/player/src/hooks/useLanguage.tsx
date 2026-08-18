// ===============================
// useLanguage Hook - Jotai-based i18n
// ===============================
// This hook wraps Jotai atoms for easy use in components.
// All translations are stored in atoms/language.ts

import { useAtom, useAtomValue } from 'jotai';
import { languageAtom, translateAtom, type Language } from '@/atoms/language';
import { type ReactNode } from 'react';

export type { Language };

// Main hook - provides lang, setLang, and t() function
export function useLanguage() {
  const [lang, setLang] = useAtom(languageAtom);
  const t = useAtomValue(translateAtom);

  return { lang, setLang, t };
}

// ===============================
// Legacy LanguageProvider (for backwards compatibility)
// ===============================
// Landing page components may still use this, but it's now a passthrough
// that relies on JotaiProvider which wraps the entire app.

export function LanguageProvider({ children }: { children: ReactNode }) {
  // No-op wrapper - Jotai atoms work globally through JotaiProvider
  return <>{children}</>;
}
