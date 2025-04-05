import { Request } from 'express'

interface ValidationResult {
  isValid: boolean
  message?: string
  missingParams?: string[]
}

interface UserParams {
  username: string
  telegram_id: TelegramId
  is_ru: boolean
}

export const validateUserParams = (req: Request): ValidationResult => {
  const { username, telegram_id, is_ru } = req.body as UserParams
  const missingParams = []

  if (!username) {
    missingParams.push('username')
  }

  if (!telegram_id) {
    missingParams.push('telegram_id')
  }

  if (is_ru === undefined) {
    missingParams.push('is_ru')
  }

  if (missingParams.length > 0) {
    throw new Error(`Missing required parameters: ${missingParams.join(', ')}`)
  }

  return { isValid: true }
}
