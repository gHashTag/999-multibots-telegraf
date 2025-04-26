import type { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers/language'
import { Markup } from 'telegraf'
// import { sendToSupportChat } from '@/core/telegram/sendToSupportChat' // <-- Временно закомментировано

export const handleTechSupport = async (ctx: MyContext) => {
  // Временное логирование для отладки тестов
  console.log(
    '[DEBUG handleTechSupport] Context received:',
    JSON.stringify(ctx?.from, null, 2)
  )

  const isRu = isRussian(ctx)

  // Временное логирование
  console.log(`[DEBUG handleTechSupport] isRussian result: ${isRu}`)

  const message = isRu
    ? '🛠 Для обращения в техподдержку, напишите @neuro_sage\n\n' +
      'Пожалуйста, опишите вашу проблему максимально подробно.\n\nДля возврата в главное меню, нажмите /menu'
    : '🛠 To contact tech support, write to @neuro_sage\n\n' +
      'Please describe your problem in as much detail as possible.\n\nTo return to the main menu, click /menu'

  await ctx.reply(message, Markup.removeKeyboard())
}
