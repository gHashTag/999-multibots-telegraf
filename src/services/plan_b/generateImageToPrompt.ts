import axios from 'axios'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { levels } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'
import { Markup } from 'telegraf'

import { replicate } from '@/core/replicate'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase/balance/getUserBalance'
import { calculateFinalStarPrice } from '@/pricing/calculator'
import { getBotByName } from '@/core/bot'
import {
  directPaymentProcessor,
  DirectPaymentParams,
} from '@/core/supabase/directPayment'

export async function generateImageToPrompt(
  ctx: MyContext,
  imageUrl: string,
  prompt: string | null
) {
  const userId = ctx.from?.id?.toString() ?? ''
  const username = ctx.from?.username ?? ''
  const isRu = ctx.from?.language_code === 'ru'
  const botInfo = ctx.botInfo

  if (!userId) {
    logger.error('generateImageToPrompt: Cannot find userId')
    return
  }
  if (!botInfo) {
    logger.error('generateImageToPrompt: Cannot find botInfo')
    return
  }

  const botName = botInfo.username
  const botResult = getBotByName(botName as any)
  if (!botResult.bot) {
    logger.error('Bot instance not found in planBGenerateImageToPrompt', {
      botName,
      userId,
    })
    throw new Error(`Telegraf instance (bot) not found for botName: ${botName}`)
  }
  const bot = botResult.bot

  console.log('generateImageToPrompt', imageUrl, userId, username, isRu)
  let costPerImage: number | undefined = undefined
  let newBalance: number | undefined = undefined

  try {
    const userExists = await getUserByTelegramIdString(userId)
    console.log('userExists', userExists)
    if (!userExists) {
      throw new Error(`User with ID ${userId} does not exist.`)
    }
    const level = userExists.level
    if (level === 2) {
      await updateUserLevelPlusOne(userId, level)
    }

    const costResult = calculateFinalStarPrice(ModeEnum.ImageToPrompt)
    if (!costResult) {
      logger.error('Failed to calculate cost for ImageToPrompt', { userId })
      await ctx.reply('Error calculating cost.')
      return
    }
    costPerImage = costResult.stars

    const currentBalance = await getUserBalance(userId, botInfo.username)

    if (currentBalance < costPerImage) {
      logger.warn('Insufficient balance for ImageToPrompt', {
        userId,
        currentBalance,
        costPerImage,
      })
      await ctx.reply(
        isRu
          ? `😕 Недостаточно звезд (${costPerImage} ★). Ваш баланс: ${currentBalance} ★.`
          : `😕 Insufficient stars (${costPerImage} ★). Your balance: ${currentBalance} ★.`
      )
      return
    }

    const paymentOperationId = `payment-${userId}-${Date.now()}-${uuidv4()}`
    const paymentParams: DirectPaymentParams = {
      telegram_id: userId,
      amount: costPerImage ?? 0,
      type: PaymentType.MONEY_OUTCOME,
      description: 'Payment for image to prompt',
      bot_name: botInfo.username,
      service_type: ModeEnum.ImageToPrompt,
      inv_id: paymentOperationId,
      metadata: { is_ru: isRu },
    }
    const paymentResult = await directPaymentProcessor(paymentParams)

    if (!paymentResult.success) {
      throw new Error(
        paymentResult.error || 'Failed to process payment for ImageToPrompt'
      )
    }
    newBalance = paymentResult.balanceChange?.after

    ctx.telegram.sendMessage(
      userId,
      isRu ? '⏳ Генерация промпта...' : '⏳ Generating prompt...'
    )

    const replicateOutput = await replicate.run(
      'methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5',
      {
        input: {
          image: imageUrl,
        },
      }
    )

    let data: string | null = null
    if (typeof replicateOutput === 'string') {
      data = replicateOutput
    } else if (
      Array.isArray(replicateOutput) &&
      typeof replicateOutput[0] === 'string'
    ) {
      data = replicateOutput[0]
    } else if (
      typeof replicateOutput === 'object' &&
      replicateOutput !== null &&
      'output' in replicateOutput &&
      typeof replicateOutput.output === 'string'
    ) {
      data = replicateOutput.output
    }

    if (data) {
      const caption = data
      console.log('Found caption:', caption)
      await ctx.telegram.sendMessage(userId, '```\n' + caption + '\n```', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isRu ? levels[104].title_ru : levels[104].title_en,
              'do_nothing'
            ),
          ],
        ]).reply_markup,
      })

      if (costPerImage !== undefined && newBalance !== undefined) {
        await ctx.telegram.sendMessage(
          userId,
          isRu
            ? `Стоимость: ${costPerImage.toFixed(
                2
              )} ★. Баланс: ${newBalance.toFixed(2)} ★`
            : `Cost: ${costPerImage.toFixed(
                2
              )} ★. Balance: ${newBalance.toFixed(2)} ★`,
          {
            reply_markup: Markup.removeKeyboard().reply_markup,
          }
        )
      }
    } else {
      logger.error('Failed to get prompt from Replicate', {
        userId,
        imageUrl,
        replicateOutput,
      })
      throw new Error('Failed to get prompt from Replicate')
    }
  } catch (error) {
    console.error('Error in generateImageToPrompt:', error)
    await sendServiceErrorToUser(bot, userId, error as Error, isRu)
    await sendServiceErrorToAdmin(bot, userId, error as Error)

    if (newBalance !== undefined && costPerImage !== undefined) {
      try {
        const refundParams: DirectPaymentParams = {
          telegram_id: userId,
          amount: costPerImage ?? 0,
          type: PaymentType.REFUND,
          description: 'Refund for failed image-to-prompt',
          bot_name: botInfo.username,
          service_type: ModeEnum.ImageToPrompt,
          inv_id: `refund-${userId}-${Date.now()}-${uuidv4()}`,
          metadata: { is_ru: isRu },
        }
        await directPaymentProcessor(refundParams)
        console.log(`Refunded ${costPerImage} stars to user ${userId}`)
        await ctx.telegram.sendMessage(
          userId,
          isRu
            ? 'Средства возвращены из-за ошибки.'
            : 'Funds refunded due to error.'
        )
      } catch (refundError) {
        console.error('Error during refund:', refundError)
        await sendServiceErrorToAdmin(
          bot,
          userId,
          new Error(
            `Failed refund check! User: ${userId}, Amount: ${costPerImage}. Original error: ${(error as Error).message}. Refund error: ${(refundError as Error).message}`
          )
        )
      }
    }
  }
}
