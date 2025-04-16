import { createVoiceAvatar as PlanBCreateVoiceAvatar } from './plan_b/createVoiceAvatar'
import { MyContext } from '@/interfaces'
import { getBotByName } from '@/core/bot'
import { TelegramId } from '@/interfaces/telegram.interface'

// TODO: добавить тесты (unit/integration) после ручной проверки
export async function generateVoiceAvatar(
  fileUrl: string,
  telegram_id: TelegramId,
  ctx: MyContext,
  isRu: boolean,
  botName: string
): Promise<{ voiceId: string }> {
  try {
    const username = ctx.from?.username || telegram_id.toString()
    // Получаем Telegraf<MyContext> инстанс
    // @ts-ignore
    let bot = ctx.bot || ctx.__bot
    if (!bot) {
      const botResult = getBotByName(botName)
      if (!botResult.bot) {
        throw new Error('Telegraf instance (bot) not found in context or by botName')
      }
      bot = botResult.bot
    }
    // Вызов Direct-версии (Plan B)
    return await PlanBCreateVoiceAvatar(
      fileUrl,
      telegram_id.toString(),
      username,
      isRu,
      bot
    )
  } catch (error) {
    throw error
  }
}
