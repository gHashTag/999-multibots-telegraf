import { isDev } from '@/config'
import bot from '@/core/bot'

export const errorMessageAdmin = (error: Error) => {
  !isDev &&
    bot.telegram.sendMessage(
      '@neuro_coder_privat',
      `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
    )
}
