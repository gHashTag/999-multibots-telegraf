import { TelegramId } from '@/interfaces/telegram.interface'
import { getUserBalance } from '@/core/supabase/balance/getUserBalance'
import { MyContext } from '@/interfaces'
import { BalanceOperationResult } from '@/interfaces/payments.interface'

import { calculateFinalStarPrice } from '@/pricing/calculator'
import { VIDEO_MODELS_CONFIG } from '@/pricing/config/VIDEO_MODELS_CONFIG'
import { logger } from '@/utils/logger'
import { PaymentType } from '@/interfaces/payments.interface'
import { generateImageToVideo } from '@/services/generateImageToVideo'
import { ModeEnum } from '@/interfaces/modes'
import { updateUserStarsBalance } from '@/core/supabase/balance/updateUserStarsBalance'

type VideoModelConfigKey = keyof typeof VIDEO_MODELS_CONFIG

type BalanceOperationProps = {
  ctx: MyContext
  videoModel: VideoModelConfigKey
  telegram_id: TelegramId
  is_ru: boolean
  imageUrl: string
  prompt: string | null
}

export const processBalanceVideoOperation = async ({
  ctx,
  videoModel,
  telegram_id,
  is_ru,
  imageUrl,
  prompt,
}: BalanceOperationProps): Promise<BalanceOperationResult> => {
  try {
    // Получаем имя бота с проверкой
    const botUsername = ctx.botInfo?.username ?? 'unknown_bot'

    // Получаем текущий баланс
    const telegram_id_str = telegram_id.toString()
    const currentBalance = await getUserBalance(telegram_id_str, botUsername)
    if (currentBalance === null) {
      throw new Error('Balance not found')
    }

    const availableModelKeys = Object.keys(
      VIDEO_MODELS_CONFIG
    ) as VideoModelConfigKey[]

    // Проверка корректности модели
    if (!videoModel || !availableModelKeys.includes(videoModel)) {
      await ctx.telegram.sendMessage(
        ctx.from?.id?.toString() || '',
        is_ru
          ? 'Пожалуйста, выберите корректную модель'
          : 'Please choose a valid model'
      )
      return {
        newBalance: currentBalance,
        success: false,
        paymentAmount: 0,
        modePrice: 0,
        error: 'Invalid model',
      }
    }

    const costResult = calculateFinalStarPrice(ModeEnum.ImageToVideo, {
      modelId: videoModel,
    })

    if (!costResult) {
      logger.error('Failed to calculate cost for balance update', {
        telegramId: telegram_id,
        botName: botUsername,
        mode: ModeEnum.ImageToVideo,
        videoModel,
      })
      return {
        success: false,
        newBalance: currentBalance,
        modePrice: 0,
        paymentAmount: 0,
      }
    }

    const modePrice = costResult.stars

    // Проверка достаточности средств
    if (currentBalance < modePrice) {
      logger.warn('Insufficient balance detected during final processing', {
        telegramId: telegram_id,
        currentBalance,
        modePrice,
      })
      return {
        success: false,
        newBalance: currentBalance,
        modePrice,
        paymentAmount: modePrice,
      }
    }

    // Сумма списания (отрицательная)
    const expenseAmount = -modePrice
    // Новый баланс для логов и ответа
    const newBalance = currentBalance - modePrice

    // Формируем описание и метаданные (описание не нужно для updateUserStarsBalance)
    // const description = `Списание за генерацию видео...`;
    // const metadata = { ... };

    // Вызов новой функции обновления баланса звезд
    const updateSuccess = await updateUserStarsBalance(
      telegram_id_str,
      expenseAmount // Передаем отрицательное количество звезд для списания
    )

    // Проверяем результат обновления баланса
    if (!updateSuccess) {
      logger.error('❌ Failed to update user stars balance', {
        telegramId: telegram_id_str,
        amount: expenseAmount,
      })
      // Возвращаем ошибку, сохраняя текущий (старый) баланс
      return {
        success: false,
        newBalance: currentBalance, // Возвращаем баланс до попытки списания
        modePrice,
        paymentAmount: modePrice,
        error: is_ru
          ? 'Ошибка обновления баланса звезд.'
          : 'Failed to update stars balance.',
      }
    }

    logger.info(
      '✅ Balance updated after video generation via updateUserStarsBalance',
      {
        telegramId: telegram_id_str,
        botName: botUsername,
        mode: ModeEnum.ImageToVideo,
        videoModel,
        cost: modePrice,
        oldBalance: currentBalance,
        newBalance, // Рассчитанный новый баланс
      }
    )

    // --- Логика отправки сообщения об успехе ---
    const successMessage = is_ru
      ? `✅ Видео по вашему запросу (модель: ${VIDEO_MODELS_CONFIG[videoModel]?.title || videoModel}) готово!
Промпт: ${prompt || 'по изображению'}\nСписано: ${modePrice}⭐️\nВаш баланс: ${newBalance}⭐️`
      : `✅ Video for your request (model: ${VIDEO_MODELS_CONFIG[videoModel]?.title || videoModel}) is ready!
Prompt: ${prompt || 'by image'}\nCharged: ${modePrice}⭐️\nYour balance: ${newBalance}⭐️`

    await ctx.reply(successMessage)
    // Если нужно отправить и видео, то:
    // await ctx.replyWithVideo(imageUrl, { caption: successMessage });
    // Важно: ctx.replyWithVideo может не работать, если imageUrl - это не прямой URL к файлу,
    // а, например, ссылка на страницу с видео. Нужно проверить формат imageUrl.
    // Если imageUrl - это URL страницы, возможно, лучше просто отправить ссылку в текстовом сообщении.
    // await ctx.reply(`${successMessage}\n\n${imageUrl}`);

    return {
      success: true,
      newBalance, // Возвращаем рассчитанный новый баланс
      paymentAmount: modePrice, // Возвращаем сумму операции (положительную)
      modePrice: modePrice,
    }
  } catch (error) {
    console.error('Error in processBalanceOperation:', error)
    throw error
  }
}
