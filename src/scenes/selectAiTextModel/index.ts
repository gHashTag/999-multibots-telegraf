import { Scenes, Markup } from 'telegraf'
import { MyContext } from '../../interfaces'
import { getAvailableModels } from '../../commands/selectModelCommand/getAvailableModels'
import { sendGenericErrorMessage } from '@/menu'
import { isRussian } from '@/helpers/language'
import { getUserByTelegramIdString, setModel } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { updateUserLevelPlusOne } from '@/core/supabase'
import { ModeEnum } from '@/price/types/modes'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/getUserBalance'
import { inngest } from '@/inngest-functions/clients'
import { TransactionType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'

// Конфигурация платных моделей
interface PaidModelConfig {
  name: string
  price: number
  isPremium: boolean
}

// Определяем, какие модели платные и сколько стоят
const PAID_MODELS: PaidModelConfig[] = [
  { name: 'GPT-4', price: 10, isPremium: true },
  { name: 'Claude-3', price: 15, isPremium: true },
  { name: 'Gemini Pro', price: 8, isPremium: true },
  // Другие платные модели можно добавить сюда
]

/**
 * Проверяет, является ли модель платной и возвращает её конфигурацию
 */
function getPaidModelConfig(modelName: string): PaidModelConfig | null {
  return PAID_MODELS.find(model => model.name === modelName) || null
}

export const selectAiTextModel = new Scenes.WizardScene<MyContext>(
  ModeEnum.SelectAiTextModel,
  async ctx => {
    const isRu = ctx.from?.language_code === 'ru'

    try {
      const models = await getAvailableModels()
      logger.info('🔄 Получены доступные модели:', {
        description: 'Available models fetched',
        models,
      })

      // Создаем кнопки для каждой модели, по 3 в ряд
      const buttons: string[][] = []
      for (let i = 0; i < models.length; i += 3) {
        const row: string[] = []
        if (models[i]) {
          // Добавляем маркер для платных моделей
          const model1Config = getPaidModelConfig(models[i])
          row.push(model1Config?.isPremium ? `${models[i]} ⭐` : models[i])
        }
        if (models[i + 1]) {
          const model2Config = getPaidModelConfig(models[i + 1])
          row.push(
            model2Config?.isPremium ? `${models[i + 1]} ⭐` : models[i + 1]
          )
        }
        if (models[i + 2]) {
          const model3Config = getPaidModelConfig(models[i + 2])
          row.push(
            model3Config?.isPremium ? `${models[i + 2]} ⭐` : models[i + 2]
          )
        }
        buttons.push(row)
      }

      // Добавляем кнопки "Отмена" и "Справка по команде" в конце
      const cancelHelpButtons = [
        isRu ? 'Справка по команде' : 'Help for the command',
        isRu ? 'Отмена' : 'Cancel',
      ]
      buttons.push(cancelHelpButtons)

      const keyboard = Markup.keyboard(buttons).resize().oneTime()

      // Объясняем что звездочка означает платную модель
      const modelSelectionText = isRu
        ? '🧠 Выберите модель:\n\n⭐ - платные модели'
        : '🧠 Select AI Model:\n\n⭐ - paid models'

      await ctx.reply(modelSelectionText, keyboard)

      return ctx.wizard.next()
    } catch (error) {
      logger.error('❌ Ошибка при создании меню выбора модели:', {
        description: 'Error creating model selection menu',
        error: error instanceof Error ? error.message : String(error),
      })
      await ctx.reply(
        isRu
          ? '❌ Ошибка при получении списка моделей'
          : '❌ Error fetching models list'
      )
      return ctx.scene.leave()
    }
  },
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const isCancel = await handleHelpCancel(ctx)
    if (isCancel) {
      return ctx.scene.leave()
    }

    // Очищаем текст от маркера платной модели
    const selectedModel = message.text.replace(' ⭐', '')
    const models = await getAvailableModels()

    if (!models.includes(selectedModel)) {
      await ctx.reply(isRu ? '❌ Модель не найдена' : '❌ Model not found')
      return ctx.scene.leave()
    }

    const telegramId = ctx.from?.id.toString()
    if (!telegramId) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить ID пользователя'
          : '❌ Error: User ID not found'
      )
      return ctx.scene.leave()
    }

    try {
      // Проверяем существование пользователя
      const user = await getUserByTelegramIdString(telegramId)
      if (!user) {
        logger.error('❌ Пользователь не найден:', {
          description: 'User not found',
          telegramId,
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка: пользователь не найден'
            : '❌ Error: User not found'
        )
        return ctx.scene.leave()
      }

      // Проверяем, является ли модель платной
      const modelConfig = getPaidModelConfig(selectedModel)

      if (modelConfig && modelConfig.isPremium) {
        logger.info('💰 Выбрана платная модель:', {
          description: 'Paid model selected',
          model: selectedModel,
          price: modelConfig.price,
        })

        // Получаем текущий баланс пользователя
        const currentBalance = await getUserBalance(telegramId)

        // Проверяем достаточность средств
        if (currentBalance < modelConfig.price) {
          logger.warn('⚠️ Недостаточно средств для выбора платной модели:', {
            description: 'Insufficient funds for paid model',
            model: selectedModel,
            price: modelConfig.price,
            currentBalance,
          })

          await ctx.reply(
            isRu
              ? `❌ Недостаточно средств для выбора модели ${selectedModel}.\nТребуется: ${modelConfig.price} звезд\nВаш баланс: ${currentBalance} звезд`
              : `❌ Insufficient funds to select model ${selectedModel}.\nRequired: ${modelConfig.price} stars\nYour balance: ${currentBalance} stars`
          )
          return ctx.scene.leave()
        }

        // Предупреждаем пользователя о списании средств и запрашиваем подтверждение
        const confirmMessage = isRu
          ? `⚠️ Выбор модели ${selectedModel} стоит ${modelConfig.price} звезд.\nВаш текущий баланс: ${currentBalance} звезд.\n\nПодтвердить выбор?`
          : `⚠️ Selecting model ${selectedModel} costs ${modelConfig.price} stars.\nYour current balance: ${currentBalance} stars.\n\nConfirm selection?`

        await ctx.reply(
          confirmMessage,
          Markup.keyboard([
            [isRu ? 'Подтвердить' : 'Confirm'],
            [isRu ? 'Отмена' : 'Cancel'],
          ])
            .oneTime()
            .resize()
        )

        // Сохраняем выбранную модель в контексте для использования в следующем шаге
        ctx.session.selectedModel = selectedModel

        return ctx.wizard.next()
      }

      // Если модель бесплатная, сразу устанавливаем её
      await setModel(telegramId, selectedModel)
      logger.info('✅ Модель успешно установлена:', {
        description: 'Model successfully set',
        telegramId,
        model: selectedModel,
      })

      // Обновляем уровень пользователя если нужно
      if (user.level === 5) {
        await updateUserLevelPlusOne(telegramId, user.level)
        logger.info('✅ Уровень пользователя обновлен:', {
          description: 'User level updated',
          telegramId,
          newLevel: user.level + 1,
        })
      }

      await ctx.reply(
        isRu
          ? `✅ Модель успешно изменена на ${selectedModel}`
          : `✅ Model successfully changed to ${selectedModel}`,
        {
          reply_markup: {
            remove_keyboard: true,
          },
        }
      )

      // Переходим в сцену чата с аватаром
      return ctx.scene.enter(ModeEnum.ChatWithAvatar)
    } catch (error) {
      logger.error('❌ Ошибка при установке модели:', {
        description: 'Error setting model',
        error: error instanceof Error ? error.message : String(error),
        telegramId,
        model: selectedModel,
      })
      await ctx.reply(
        isRu ? '❌ Ошибка при установке модели' : '❌ Error setting model'
      )
      return ctx.scene.leave()
    }
  },
  // Обработка подтверждения для платной модели
  async ctx => {
    const isRu = isRussian(ctx)
    const message = ctx.message

    if (!message || !('text' in message)) {
      await sendGenericErrorMessage(ctx, isRu)
      return ctx.scene.leave()
    }

    const response = message.text
    const telegramId = ctx.from?.id.toString()
    const selectedModel = ctx.session.selectedModel

    if (!telegramId || !selectedModel) {
      await ctx.reply(
        isRu
          ? '❌ Ошибка: не удалось получить данные пользователя или модели'
          : '❌ Error: Failed to get user data or model'
      )
      return ctx.scene.leave()
    }

    // Если пользователь отменил
    if (response === (isRu ? 'Отмена' : 'Cancel')) {
      await ctx.reply(
        isRu ? '❌ Выбор модели отменен' : '❌ Model selection cancelled',
        { reply_markup: { remove_keyboard: true } }
      )
      return ctx.scene.leave()
    }

    // Если пользователь подтвердил выбор
    if (response === (isRu ? 'Подтвердить' : 'Confirm')) {
      try {
        const modelConfig = getPaidModelConfig(selectedModel)

        if (!modelConfig) {
          await ctx.reply(
            isRu
              ? '❌ Ошибка: модель не найдена или не является платной'
              : '❌ Error: Model not found or is not paid'
          )
          return ctx.scene.leave()
        }

        // Создаем уникальный ID операции
        const operationId = `model-select-${Date.now()}-${uuidv4()}`

        // Отправляем событие платежа
        await inngest.send({
          name: 'payment/process',
          data: {
            telegram_id: telegramId,
            amount: modelConfig.price,
            stars: modelConfig.price,
            type: TransactionType.MONEY_EXPENSE,
            description: isRu
              ? `🎯 Выбор модели ${selectedModel}`
              : `🎯 Model selection ${selectedModel}`,
            bot_name: ctx.botInfo?.username || 'unknown_bot',
            service_type: ModeEnum.SelectAiTextModel,
            metadata: {
              model_name: selectedModel,
              operation_id: operationId,
            },
          },
        })

        logger.info('💸 Отправлено событие платежа за выбор модели:', {
          description: 'Payment event sent for model selection',
          telegramId,
          model: selectedModel,
          price: modelConfig.price,
          operationId,
        })

        // Устанавливаем модель
        await setModel(telegramId, selectedModel)

        // Уведомляем пользователя об успешном выборе модели и списании средств
        await ctx.reply(
          isRu
            ? `✅ Модель успешно изменена на ${selectedModel}\n💸 С вашего баланса списано ${modelConfig.price} звезд`
            : `✅ Model successfully changed to ${selectedModel}\n💸 ${modelConfig.price} stars have been deducted from your balance`,
          { reply_markup: { remove_keyboard: true } }
        )

        // Переходим в сцену чата с аватаром
        return ctx.scene.enter(ModeEnum.ChatWithAvatar)
      } catch (error) {
        logger.error('❌ Ошибка при обработке платежа за модель:', {
          description: 'Error processing payment for model',
          error: error instanceof Error ? error.message : String(error),
          telegramId,
          model: selectedModel,
        })

        await ctx.reply(
          isRu
            ? '❌ Ошибка при обработке платежа за выбор модели'
            : '❌ Error processing payment for model selection',
          { reply_markup: { remove_keyboard: true } }
        )
        return ctx.scene.leave()
      }
    }

    // Если получен неизвестный ответ
    await ctx.reply(
      isRu
        ? '❌ Неизвестный ответ. Пожалуйста, выберите "Подтвердить" или "Отмена"'
        : '❌ Unknown response. Please choose "Confirm" or "Cancel"'
    )
    return
  }
)

export default selectAiTextModel
