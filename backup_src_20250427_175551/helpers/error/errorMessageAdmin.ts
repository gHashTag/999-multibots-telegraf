import { isDev } from '@/config'
import type { MyContext } from '@/interfaces'

export const errorMessageAdmin = (ctx: MyContext, error: Error) => {
  !isDev &&
    ctx.telegram.sendMessage(
      '@neuro_coder_privat',
      `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
    )
}
