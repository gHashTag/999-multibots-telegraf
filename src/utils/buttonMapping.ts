/**
 * Button mapping utilities
 */

import { MyContext } from '@/interfaces'

export function validateCallbackData(data: string): boolean {
  // Заглушка для валидации callback data
  return !!data
}

export function handleButtonError(ctx: MyContext, error: any, callback?: () => Promise<void>): void {
  console.error('Button error:', error)
  if (callback) {
    callback().catch(console.error)
  }
}

export function sanitizeInput(input: string): string {
  return input.trim()
}