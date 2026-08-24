// ===============================
// useLanguage Hook - Jotai-based i18n
// ===============================
// This hook wraps Jotai atoms for easy use in components.
// All translations are stored in atoms/language.ts

import { useAtom, useAtomValue } from 'jotai';
import { languageAtom, translateAtom, type Language } from '@/atoms/language';
import { useEffect, type ReactNode } from 'react';

export type { Language };

// Main hook - provides lang, setLang, and t() function
export function useLanguage() {
  const [lang, setLang] = useAtom(languageAtom);
  const t = useAtomValue(translateAtom);

  /**
   * Держим <html lang> в согласии с языком интерфейса.
   *
   * Замерено в живом приложении: документ отдавал lang="en", пока весь
   * интерфейс был русским, — и менять его не пытался никто (грепом по
   * documentElement.lang во всём src не было НИ ОДНОГО совпадения).
   *
   * Чем это платят: скринридер читает русские подписи английскими
   * правилами произношения, а браузер предлагает перевести страницу,
   * которая уже на языке читателя.
   *
   * Синхронизация живёт здесь, а не в App.tsx, потому что язык и так
   * приходит только через этот хук — вторая точка правды разъехалась бы
   * с первой. Присваивание идемпотентно: у всех вызывающих значение из
   * одного атома, и запись идёт только при реальном расхождении.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.documentElement.lang !== lang) {
      document.documentElement.lang = lang;
    }
  }, [lang]);

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
