/**
 * Is this Telegram language code Russian?
 *
 * Telegram sends an IETF tag in `from.language_code`, and that tag carries an
 * optional region: 'ru', but also 'ru-RU', 'ru-UA', 'ru-KZ'. Thirty places in
 * this repository compared it with `=== 'ru'`, so every one of those users was
 * answered in English -- including the three branches of languageMiddleware,
 * which is the single point where the raw code becomes the internal
 * 'ru' | 'en' that the rest of the code reads. A new user with a regional
 * Russian locale and no row in the database therefore got an English bot.
 *
 * Two implementations of isRussianFromState already disagreed about exactly
 * this: the copy with 103 consumers compared strictly, the copy with 2
 * accepted the 'ru-' prefix. This is the strict side moved to the lenient one.
 *
 * Deliberately NOT used for the `language_code` COLUMN in the users table --
 * that is a stored, already-normalised 'ru' | 'en', and widening its
 * validation would let unnormalised values through.
 */
export function isRussianLanguageCode(
  code: string | null | undefined
): boolean {
  if (!code) return false
  const tag = code.toLowerCase()
  // Exactly 'ru', or 'ru' followed by a subtag separator. A bare prefix test
  // would also accept 'rue' (Rusyn), which is a different language.
  return tag === 'ru' || tag.startsWith('ru-') || tag.startsWith('ru_')
}
