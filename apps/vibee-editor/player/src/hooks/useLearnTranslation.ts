import { useLanguage } from './useLanguage';
import { learnTranslations, type Language } from '@/i18n/learn-translations';

export function useLearnTranslation() {
  const { language } = useLanguage();
  
  // Map language codes to supported learn languages
  const learnLangMap: Record<string, Language> = {
    'en': 'en',
    'ru': 'ru',
    'es': 'es',
    'zh': 'zh',
    'fr': 'fr',
    'de': 'de',
    'ja': 'ja',
  };
  
  const learnLang = learnLangMap[language] || 'en';
  const t = learnTranslations[learnLang];
  
  return { t, language: learnLang };
}
