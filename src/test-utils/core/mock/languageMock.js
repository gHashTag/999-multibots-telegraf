/**
 * Mock implementation of the language helper module
 * This provides fake language detection and processing utilities for tests
 */

/**
 * Returns the language code from the user's Telegram context
 * For tests, always returns 'en' as default or what was set in the context
 */
function getUserLanguage(ctx) {
  // Check if there's a language set in test context
  if (ctx && ctx.session && ctx.session.language) {
    return ctx.session.language;
  }
  
  // Check if there's a language in the from object
  if (ctx && ctx.from && ctx.from.language_code) {
    return ctx.from.language_code;
  }
  
  // Default to English
  return 'en';
}

/**
 * Determines the appropriate language code based on user preferences or defaults
 * For tests, defaults to English or whatever is in the context
 */
function getLanguage(ctx) {
  return getUserLanguage(ctx);
}

/**
 * Check if the provided text contains only Russian characters
 */
function isRussian(text) {
  if (!text) return false;
  return /^[а-яА-ЯёЁ\s.,!?;:()"'-]+$/.test(text);
}

/**
 * Check if the provided text contains only English characters
 */
function isEnglish(text) {
  if (!text) return false;
  return /^[a-zA-Z\s.,!?;:()"'-]+$/.test(text);
}

/**
 * Detect language from text
 * Simple detection for English or Russian, defaults to English
 */
function detectLanguage(text) {
  if (!text) return 'en';
  
  if (isRussian(text)) {
    return 'ru';
  }
  
  return 'en';
}

/**
 * Set user language in session
 */
function setUserLanguage(ctx, language) {
  if (!ctx || !ctx.session) return;
  
  ctx.session.language = language;
  
  return language;
}

/**
 * Get supported languages list
 */
function getSupportedLanguages() {
  return ['en', 'ru'];
}

/**
 * Check if language code is supported
 */
function isLanguageSupported(langCode) {
  return getSupportedLanguages().includes(langCode);
}

module.exports = {
  getUserLanguage,
  getLanguage,
  isRussian,
  isEnglish,
  detectLanguage,
  setUserLanguage,
  getSupportedLanguages,
  isLanguageSupported
}; 