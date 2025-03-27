import { isDev } from '@/config'
import { defaultBot } from '@/core/bot'

export const errorMessageAdmin = (error: Error) => {
  !isDev &&
    defaultBot.telegram.sendMessage(
      '@neuro_coder_privat',
      `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
    )
}
