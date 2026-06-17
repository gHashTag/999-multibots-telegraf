import { isDev } from '@/config'
import { MyContext } from '@/interfaces'

export const errorMessageAdmin = (ctx: MyContext | null, error: Error) => {
  if (!ctx || !ctx.telegram) {
    console.error('Admin error (no context):', error.message)
    return
  }
  !isDev &&
    ctx.telegram.sendMessage(
      '@neuro_coder_privat',
      `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
    )
}
