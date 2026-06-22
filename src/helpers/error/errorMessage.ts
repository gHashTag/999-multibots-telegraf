import { MyContext } from '@/interfaces'

export const errorMessage = (ctx: MyContext | null, error: Error, isRu?: boolean) => {
  if (!ctx || !ctx.from?.id) {
    console.error('Cannot send error message - no context:', error.message)
    return
  }
  ctx.telegram.sendMessage(
    ctx.from?.id?.toString() || '',
    isRu
      ? `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
      : `❌ An error occurred.\n\nError: ${error.message}`
  )
}
