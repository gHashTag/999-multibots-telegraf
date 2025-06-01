import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { FLUX_KONTEXT_MODELS } from '@/price/models'
import { isRussian } from '@/helpers'
import { Markup } from 'telegraf'
import { handleFluxKontextCommand } from '@/commands/fluxKontextCommand'
import { levels } from '@/menu/mainMenu'
import { getUserBalance } from '@/core/supabase'
import { sendBalanceMessage } from '@/price/helpers'
import { ModeEnum } from '@/interfaces'

// Создание сцены
export const fluxKontextScene = new Scenes.BaseScene<MyContext>(
  'flux_kontext_scene'
)

// Функция для показа моделей с ценами
const showFluxKontextModels = async (ctx: MyContext) => {
  const isRu = isRussian(ctx)

  if (!ctx.from?.id) {
    await ctx.reply(
      isRu ? '❌ Ошибка получения ID пользователя' : '❌ Error getting user ID'
    )
    await ctx.scene.leave()
    return
  }

  // Получаем баланс пользователя
  const userBalance = await getUserBalance(ctx.from.id.toString())

  const proModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-pro']
  const maxModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-max']

  // Показываем баланс пользователя
  if (ctx.botInfo?.username) {
    await sendBalanceMessage(
      ctx,
      userBalance,
      Math.min(proModel.costPerImage, maxModel.costPerImage), // Показываем минимальную цену
      isRu,
      ctx.botInfo.username
    )
  }

  const title = isRu
    ? '🎨 *FLUX Kontext* - AI Редактирование изображений'
    : '🎨 *FLUX Kontext* - AI Image Editing'

  const description = isRu
    ? `✨ *Что можно делать:*
• Изменить стиль изображения
• Добавить/удалить элементы  
• Изменить причёску и одежду
• Заменить фон
• Редактировать текст на изображении
• Художественная стилизация

💰 *Стоимость:*`
    : `✨ *What you can do:*
• Change image style
• Add/remove elements
• Change hairstyle and clothing  
• Replace background
• Edit text in images
• Artistic stylization

💰 *Pricing:*`

  const proInfo = isRu
    ? `💼 **${proModel.shortName}** - ${proModel.costPerImage} ⭐
${proModel.description_ru}`
    : `💼 **${proModel.shortName}** - ${proModel.costPerImage} ⭐
${proModel.description_en}`

  const maxInfo = isRu
    ? `🚀 **${maxModel.shortName}** - ${maxModel.costPerImage} ⭐
${maxModel.description_ru}`
    : `🚀 **${maxModel.shortName}** - ${maxModel.costPerImage} ⭐
${maxModel.description_en}`

  const balanceInfo = isRu
    ? `💰 *Ваш баланс:* ${userBalance} ⭐`
    : `💰 *Your balance:* ${userBalance} ⭐`

  const footer = isRu
    ? '👇 Выберите модель для начала:'
    : '👇 Choose a model to start:'

  const message = `${title}\n\n${description}\n\n${proInfo}\n\n${maxInfo}\n\n${balanceInfo}\n\n${footer}`

  // Проверяем, хватает ли денег хотя бы на самую дешевую модель
  const minPrice = Math.min(proModel.costPerImage, maxModel.costPerImage)
  const canAffordPro = userBalance >= proModel.costPerImage
  const canAffordMax = userBalance >= maxModel.costPerImage

  const keyboard = []

  if (canAffordPro) {
    keyboard.push([
      Markup.button.callback(
        isRu
          ? `💼 FLUX Kontext Pro (${proModel.costPerImage} ⭐)`
          : `💼 FLUX Kontext Pro (${proModel.costPerImage} ⭐)`,
        'flux_kontext_pro'
      ),
    ])
  }

  if (canAffordMax) {
    keyboard.push([
      Markup.button.callback(
        isRu
          ? `🚀 FLUX Kontext Max (${maxModel.costPerImage} ⭐)`
          : `🚀 FLUX Kontext Max (${maxModel.costPerImage} ⭐)`,
        'flux_kontext_max'
      ),
    ])
  }

  keyboard.push([
    Markup.button.callback(
      isRu ? '❌ Отмена' : '❌ Cancel',
      'flux_kontext_cancel'
    ),
  ])

  if (keyboard.length === 1) {
    // Только кнопка отмены
    await ctx.reply(
      isRu
        ? `❌ *Недостаточно средств*\n\nДля использования FLUX Kontext нужно минимум ${minPrice} ⭐\nВаш баланс: ${userBalance} ⭐`
        : `❌ *Insufficient funds*\n\nFLUX Kontext requires at least ${minPrice} ⭐\nYour balance: ${userBalance} ⭐`,
      {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
      }
    )
  } else {
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
    })
  }
}

// Вход в сцену
fluxKontextScene.enter(async ctx => {
  logger.info('FLUX Kontext Scene: Entering scene', {
    telegramId: ctx.from?.id,
  })

  await showFluxKontextModels(ctx)
})

// Обработка выбора модели Pro
fluxKontextScene.action('flux_kontext_pro', async ctx => {
  try {
    await ctx.answerCbQuery()

    if (!ctx.from?.id) {
      await ctx.reply('❌ Error getting user ID')
      await ctx.scene.leave()
      return
    }

    // Проверяем баланс еще раз перед запуском
    const userBalance = await getUserBalance(ctx.from.id.toString())
    const proModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-pro']

    if (userBalance < proModel.costPerImage) {
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств для FLUX Kontext Pro\nТребуется: ${proModel.costPerImage} ⭐\nВаш баланс: ${userBalance} ⭐`
          : `❌ Insufficient funds for FLUX Kontext Pro\nRequired: ${proModel.costPerImage} ⭐\nYour balance: ${userBalance} ⭐`
      )
      await ctx.scene.leave()
      return
    }

    await ctx.scene.leave()

    // Устанавливаем модель в сессии и запускаем команду
    if (ctx.session) {
      ctx.session.kontextSelectedModel = 'pro'
    }

    await handleFluxKontextCommand(ctx)
  } catch (error) {
    logger.error('Error handling FLUX Kontext Pro selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка выбора модели Max
fluxKontextScene.action('flux_kontext_max', async ctx => {
  try {
    await ctx.answerCbQuery()

    if (!ctx.from?.id) {
      await ctx.reply('❌ Error getting user ID')
      await ctx.scene.leave()
      return
    }

    // Проверяем баланс еще раз перед запуском
    const userBalance = await getUserBalance(ctx.from.id.toString())
    const maxModel = FLUX_KONTEXT_MODELS['black-forest-labs/flux-kontext-max']

    if (userBalance < maxModel.costPerImage) {
      const isRu = isRussian(ctx)
      await ctx.reply(
        isRu
          ? `❌ Недостаточно средств для FLUX Kontext Max\nТребуется: ${maxModel.costPerImage} ⭐\nВаш баланс: ${userBalance} ⭐`
          : `❌ Insufficient funds for FLUX Kontext Max\nRequired: ${maxModel.costPerImage} ⭐\nYour balance: ${userBalance} ⭐`
      )
      await ctx.scene.leave()
      return
    }

    await ctx.scene.leave()

    // Устанавливаем модель в сессии и запускаем команду
    if (ctx.session) {
      ctx.session.kontextSelectedModel = 'max'
    }

    await handleFluxKontextCommand(ctx)
  } catch (error) {
    logger.error('Error handling FLUX Kontext Max selection', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

// Обработка отмены
fluxKontextScene.action('flux_kontext_cancel', async ctx => {
  try {
    await ctx.answerCbQuery()
    const isRu = isRussian(ctx)

    await ctx.reply(
      isRu ? '❌ Действие отменено.' : '❌ Action cancelled.',
      Markup.keyboard([
        [
          Markup.button.text(
            isRu ? levels[104].title_ru : levels[104].title_en
          ),
        ],
      ]).resize()
    )

    await ctx.scene.leave()
    // Переходим в главное меню после отмены
    await ctx.scene.enter(ModeEnum.MainMenu)
  } catch (error) {
    logger.error('Error handling FLUX Kontext cancel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      telegramId: ctx.from?.id,
    })
  }
})

export default fluxKontextScene
