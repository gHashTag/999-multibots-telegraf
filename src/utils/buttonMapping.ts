/**
 * Button mapping utilities
 */

import { MyContext } from '@/interfaces'

export function validateCallbackData(data: string): { isValid: boolean; error?: string } {
  if (!data || typeof data !== 'string') {
    return { isValid: false, error: 'Callback data is empty or not a string' }
  }
  if (data.length > 64) {
    return { isValid: false, error: 'Callback data exceeds 64 bytes' }
  }
  // Add more validation rules as needed
  return { isValid: true }
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