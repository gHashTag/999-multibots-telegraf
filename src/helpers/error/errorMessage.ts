import { MyContext } from '@/interfaces'

export const errorMessage = (ctx: MyContext, error: Error, isRu: boolean) => {
  ctx.telegram.sendMessage(
    ctx.from?.id?.toString() || '',
    isRu
      ? `❌ Произошла ошибка.\n\nОшибка: ${error.message}`
      : `❌ An error occurred.\n\nError: ${error.message}`
  )
}
