/**
 * Centralized Button Mapping Utilities
 *
 * This module provides robust utilities for handling button mapping, text normalization,
 * and callback data management to prevent BUTTON_DATA_INVALID errors.
 */

import { logger } from './logger'

export interface ButtonMappingOptions {
  /**
   * Maximum length for callback_data (Telegram limit is 64 bytes)
   */
  maxCallbackLength?: number

  /**
   * Whether to enable debug logging
   */
  debug?: boolean

  /**
   * Prefix to add to generated IDs
   */
  prefix?: string

  /**
   * Whether to use emoji-safe encoding
   */
  emojiSafe?: boolean
}

export interface ButtonMapping {
  text: string
  callback_data: string
  originalId?: string
  shortId?: string
}

/**
 * Normalizes text by removing extra whitespace, trimming, and handling emojis
 */
export function normalizeButtonText(text: string, options: ButtonMappingOptions = {}): string {
  if (!text || typeof text !== 'string') {
    logger.warn('[ButtonMapping] Invalid text input for normalization', { text, type: typeof text })
    return ''
  }

  let normalized = text
    // Remove multiple whitespace and normalize
    .replace(/\s+/g, ' ')
    .trim()

  if (options.emojiSafe) {
    // Remove or normalize problematic characters that might cause encoding issues
    normalized = normalized
      .replace(/[^\u0000-\u007F\u00A0-\u017F\u0100-\u024F\u1E00-\u1EFF\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2400-\u243F\u2440-\u245F\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2900-\u297F\u2B00-\u2BFF\u3000-\u303F]/g, '')
  }

  if (options.debug) {
    logger.debug('[ButtonMapping] Text normalized', {
      original: text,
      normalized,
      length: normalized.length
    })
  }

  return normalized
}

/**
 * Generates a safe callback_data string that respects Telegram's limits
 */
export function generateSafeCallbackData(
  prefix: string,
  id: string | number,
  options: ButtonMappingOptions = {}
): string {
  const maxLength = options.maxCallbackLength || 60 // Leave some margin from 64
  const idString = id.toString()
  const fullCallback = `${prefix}_${idString}`

  if (fullCallback.length <= maxLength) {
    if (options.debug) {
      logger.debug('[ButtonMapping] Full callback fits', {
        prefix,
        id: idString,
        fullCallback,
        length: fullCallback.length
      })
    }
    return fullCallback
  }

  // If too long, use a deterministic short ID based on the last 8 characters
  const shortId = idString.slice(-8)
  const shortCallback = `${prefix}_${shortId}`

  if (options.debug) {
    logger.debug('[ButtonMapping] Using short callback', {
      prefix,
      originalId: idString,
      shortId,
      shortCallback,
      length: shortCallback.length
    })
  }

  return shortCallback
}

/**
 * Creates a button mapping with consistent text and callback handling
 */
export function createButtonMapping(
  text: string,
  callbackPrefix: string,
  id: string | number,
  options: ButtonMappingOptions = {}
): ButtonMapping {
  const normalizedText = normalizeButtonText(text, options)
  const callbackData = generateSafeCallbackData(callbackPrefix, id, options)
  const idString = id.toString()
  const isShortened = callbackData !== `${callbackPrefix}_${idString}`

  const mapping: ButtonMapping = {
    text: normalizedText,
    callback_data: callbackData,
    originalId: idString
  }

  if (isShortened) {
    mapping.shortId = idString.slice(-8)
  }

  if (options.debug) {
    logger.debug('[ButtonMapping] Created button mapping', mapping)
  }

  return mapping
}

/**
 * Finds an item by callback_data, handling both full and short IDs
 */
export function findByCallbackData<T extends { id: string | number }>(
  items: T[],
  callbackData: string,
  prefix: string,
  options: ButtonMappingOptions = {}
): T | undefined {
  if (!callbackData.startsWith(`${prefix}_`)) {
    if (options.debug) {
      logger.debug('[ButtonMapping] Callback data does not match prefix', {
        callbackData,
        prefix,
        expectedStart: `${prefix}_`
      })
    }
    return undefined
  }

  const extractedId = callbackData.replace(`${prefix}_`, '')

  if (options.debug) {
    logger.debug('[ButtonMapping] Searching for item', {
      callbackData,
      extractedId,
      itemCount: items.length
    })
  }

  // First, try to find by exact ID match
  const exactMatch = items.find(item => item.id.toString() === extractedId)
  if (exactMatch) {
    if (options.debug) {
      logger.debug('[ButtonMapping] Found exact match', {
        extractedId,
        foundId: exactMatch.id
      })
    }
    return exactMatch
  }

  // If no exact match and the extracted ID is 8 characters (indicating it was shortened),
  // look for items whose ID ends with this value
  if (extractedId.length === 8) {
    const shortMatch = items.find(item => item.id.toString().endsWith(extractedId))
    if (shortMatch) {
      if (options.debug) {
        logger.debug('[ButtonMapping] Found short ID match', {
          extractedId,
          foundId: shortMatch.id
        })
      }
      return shortMatch
    }
  }

  if (options.debug) {
    logger.debug('[ButtonMapping] No match found', {
      callbackData,
      extractedId,
      searchedIds: items.map(item => item.id.toString())
    })
  }

  return undefined
}

/**
 * Validates callback_data format and content
 */
export function validateCallbackData(
  callbackData: string,
  expectedPrefix?: string,
  options: ButtonMappingOptions = {}
): { isValid: boolean; error?: string; extractedId?: string } {
  if (!callbackData || typeof callbackData !== 'string') {
    return { isValid: false, error: 'Callback data is empty or not a string' }
  }

  if (callbackData.length > 64) {
    return { isValid: false, error: 'Callback data exceeds Telegram limit of 64 bytes' }
  }

  if (expectedPrefix && !callbackData.startsWith(`${expectedPrefix}_`)) {
    return {
      isValid: false,
      error: `Callback data does not start with expected prefix: ${expectedPrefix}`
    }
  }

  const extractedId = expectedPrefix
    ? callbackData.replace(`${expectedPrefix}_`, '')
    : callbackData

  if (!extractedId) {
    return { isValid: false, error: 'No ID found after prefix' }
  }

  if (options.debug) {
    logger.debug('[ButtonMapping] Callback data validation passed', {
      callbackData,
      expectedPrefix,
      extractedId
    })
  }

  return { isValid: true, extractedId }
}

/**
 * Sanitizes user input to prevent injection attacks
 */
export function sanitizeInput(input: string, maxLength: number = 100): string {
  if (!input || typeof input !== 'string') {
    return ''
  }

  return input
    .trim()
    .slice(0, maxLength)
    // Remove potentially dangerous characters
    .replace(/[<>\"'&]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
}

/**
 * Creates keyboard buttons with consistent mapping
 */
export function createKeyboardButtons<T extends { id: string | number }>(
  items: T[],
  textSelector: (item: T) => string,
  callbackPrefix: string,
  options: ButtonMappingOptions & { maxColumns?: number } = {}
): Array<Array<{ text: string; callback_data: string }>> {
  const buttons = items.map(item => {
    const mapping = createButtonMapping(
      textSelector(item),
      callbackPrefix,
      item.id,
      options
    )
    return {
      text: mapping.text,
      callback_data: mapping.callback_data
    }
  })

  // Arrange buttons in rows
  const maxColumns = options.maxColumns || 2
  const rows: Array<Array<{ text: string; callback_data: string }>> = []

  for (let i = 0; i < buttons.length; i += maxColumns) {
    rows.push(buttons.slice(i, i + maxColumns))
  }

  if (options.debug) {
    logger.debug('[ButtonMapping] Created keyboard buttons', {
      itemCount: items.length,
      buttonCount: buttons.length,
      rowCount: rows.length,
      maxColumns
    })
  }

  return rows
}

/**
 * Error recovery function that provides safe fallbacks
 */
export function handleButtonError(
  error: Error,
  context: string,
  fallbackAction?: () => Promise<void> | void
): void {
  logger.error(`[ButtonMapping] Error in ${context}`, {
    error: error.message,
    stack: error.stack,
    context
  })

  if (fallbackAction) {
    try {
      const result = fallbackAction()
      if (result instanceof Promise) {
        result.catch(fallbackError => {
          logger.error(`[ButtonMapping] Fallback action failed in ${context}`, {
            error: fallbackError.message,
            context
          })
        })
      }
    } catch (fallbackError) {
      logger.error(`[ButtonMapping] Fallback action failed in ${context}`, {
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        context
      })
    }
  }
}