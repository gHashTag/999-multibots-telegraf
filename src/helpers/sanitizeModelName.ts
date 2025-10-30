/**
 * Sanitizes model name to match Replicate API requirements
 *
 * Replicate requirements:
 * - Only lowercase letters, numbers, dashes, underscores, or periods
 * - Cannot start or end with dash, underscore, or period
 * - Maximum 64 characters
 *
 * @param input - Raw model name from user input
 * @returns Sanitized model name safe for Replicate API
 */
export function sanitizeModelName(input: string): string {
  console.log('[sanitizeModelName] INPUT:', input)

  if (!input) {
    throw new Error('Model name cannot be empty')
  }

  // Step 1: Convert to lowercase
  let sanitized = input.toLowerCase()
  console.log('[sanitizeModelName] After toLowerCase:', sanitized)

  // Step 2: Transliterate Cyrillic characters to Latin
  sanitized = transliterateCyrillic(sanitized)
  console.log('[sanitizeModelName] After transliterate:', sanitized)

  // Step 3: Replace spaces with dashes
  sanitized = sanitized.replace(/\s+/g, '-')

  // Step 4: Remove all characters except lowercase letters, numbers, dashes, underscores, periods
  sanitized = sanitized.replace(/[^a-z0-9\-_.]/g, '')

  // Step 5: Replace multiple consecutive dashes/underscores with single dash
  sanitized = sanitized.replace(/[-_]+/g, '-')

  // Step 6: Remove leading/trailing dashes, underscores, or periods
  sanitized = sanitized.replace(/^[-_.]+|[-_.]+$/g, '')

  // Step 7: Ensure minimum length (at least 2 characters)
  if (sanitized.length < 2) {
    sanitized = `model-${Date.now()}`
  }

  // Step 8: Truncate to maximum 64 characters (Replicate limit)
  if (sanitized.length > 64) {
    sanitized = sanitized.substring(0, 64)
    // Remove trailing dash/underscore/period after truncation
    sanitized = sanitized.replace(/[-_.]+$/, '')
  }

  console.log('[sanitizeModelName] FINAL RESULT:', sanitized)
  return sanitized
}

/**
 * Transliterates Cyrillic (Russian) characters to Latin
 */
function transliterateCyrillic(text: string): string {
  const cyrillicToLatin: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
    'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya'
  }

  return text
    .split('')
    .map(char => cyrillicToLatin[char] || char)
    .join('')
}

/**
 * Validates if a model name matches Replicate requirements
 * @param name - Model name to validate
 * @returns true if valid, false otherwise
 */
export function isValidReplicateModelName(name: string): boolean {
  // Must contain only lowercase letters, numbers, dashes, underscores, periods
  const validCharsRegex = /^[a-z0-9\-_.]+$/
  if (!validCharsRegex.test(name)) {
    return false
  }

  // Must not start or end with dash, underscore, or period
  const invalidStartEndRegex = /^[-_.]|[-_.]$/
  if (invalidStartEndRegex.test(name)) {
    return false
  }

  // Must be between 2 and 64 characters
  if (name.length < 2 || name.length > 64) {
    return false
  }

  return true
}
