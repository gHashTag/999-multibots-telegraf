/**
 * 🔒 Text Validation Helper
 *
 * Centralized validation for user text input in Telegram scenes.
 * Prevents processing empty messages, whitespace-only input, and invalid text.
 */

import { MyContext } from '@/interfaces'

export interface TextValidationResult {
  isValid: boolean
  text: string
  error?: {
    ru: string
    en: string
  }
}

export interface TextValidationOptions {
  minLength?: number
  maxLength?: number
  allowEmpty?: boolean
  trimWhitespace?: boolean
}

const DEFAULT_OPTIONS: TextValidationOptions = {
  minLength: 1,
  maxLength: 4096,
  allowEmpty: false,
  trimWhitespace: true,
}

/**
 * Validate text input from user message
 *
 * @param ctx - Telegram context
 * @param options - Validation options
 * @returns Validation result with cleaned text or error messages
 *
 * @example
 * const result = validateTextInput(ctx, { minLength: 3, maxLength: 500 })
 * if (!result.isValid) {
 *   await ctx.reply(isRu ? result.error.ru : result.error.en)
 *   return
 * }
 * const prompt = result.text // Safe to use
 */
export function validateTextInput(
  ctx: MyContext,
  options: TextValidationOptions = {}
): TextValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // Check if message exists and has text
  if (!ctx.message || !('text' in ctx.message)) {
    return {
      isValid: false,
      text: '',
      error: {
        ru: '❌ Пожалуйста, отправьте текстовое сообщение.',
        en: '❌ Please send a text message.',
      },
    }
  }

  let text = ctx.message.text

  // Trim whitespace if enabled
  if (opts.trimWhitespace) {
    text = text.trim()
  }

  // Check for empty text
  if (!opts.allowEmpty && (!text || text.length === 0)) {
    return {
      isValid: false,
      text: '',
      error: {
        ru: '❌ Сообщение не может быть пустым. Пожалуйста, введите текст.',
        en: '❌ Message cannot be empty. Please enter some text.',
      },
    }
  }

  // Check minimum length
  if (opts.minLength && text.length < opts.minLength) {
    return {
      isValid: false,
      text,
      error: {
        ru: `❌ Текст слишком короткий. Минимум ${opts.minLength} символов.`,
        en: `❌ Text is too short. Minimum ${opts.minLength} characters.`,
      },
    }
  }

  // Check maximum length
  if (opts.maxLength && text.length > opts.maxLength) {
    return {
      isValid: false,
      text: text.slice(0, opts.maxLength),
      error: {
        ru: `❌ Текст слишком длинный. Максимум ${opts.maxLength} символов.`,
        en: `❌ Text is too long. Maximum ${opts.maxLength} characters.`,
      },
    }
  }

  return {
    isValid: true,
    text,
  }
}

/**
 * Quick check if message has valid non-empty text
 *
 * @param ctx - Telegram context
 * @returns true if message has non-empty text after trimming
 */
export function hasValidText(ctx: MyContext): boolean {
  if (!ctx.message || !('text' in ctx.message)) return false
  return ctx.message.text.trim().length > 0
}

/**
 * Get trimmed text from message or empty string
 *
 * @param ctx - Telegram context
 * @returns Trimmed text or empty string
 */
export function getTextOrEmpty(ctx: MyContext): string {
  if (!ctx.message || !('text' in ctx.message)) return ''
  return ctx.message.text.trim()
}

/**
 * Validate number input from text message
 *
 * @param ctx - Telegram context
 * @param options - Number validation options
 * @returns Validation result with parsed number or error
 */
export function validateNumberInput(
  ctx: MyContext,
  options: { min?: number; max?: number; allowedValues?: number[] } = {}
): { isValid: boolean; value: number; error?: { ru: string; en: string } } {
  const textResult = validateTextInput(ctx)

  if (!textResult.isValid) {
    return {
      isValid: false,
      value: 0,
      error: textResult.error,
    }
  }

  const value = parseInt(textResult.text, 10)

  if (isNaN(value)) {
    return {
      isValid: false,
      value: 0,
      error: {
        ru: '❌ Пожалуйста, введите число.',
        en: '❌ Please enter a number.',
      },
    }
  }

  // Check allowed values
  if (options.allowedValues && !options.allowedValues.includes(value)) {
    return {
      isValid: false,
      value,
      error: {
        ru: `❌ Пожалуйста, выберите одно из значений: ${options.allowedValues.join(', ')}`,
        en: `❌ Please choose one of: ${options.allowedValues.join(', ')}`,
      },
    }
  }

  // Check min
  if (options.min !== undefined && value < options.min) {
    return {
      isValid: false,
      value,
      error: {
        ru: `❌ Минимальное значение: ${options.min}`,
        en: `❌ Minimum value: ${options.min}`,
      },
    }
  }

  // Check max
  if (options.max !== undefined && value > options.max) {
    return {
      isValid: false,
      value,
      error: {
        ru: `❌ Максимальное значение: ${options.max}`,
        en: `❌ Maximum value: ${options.max}`,
      },
    }
  }

  return {
    isValid: true,
    value,
  }
}
