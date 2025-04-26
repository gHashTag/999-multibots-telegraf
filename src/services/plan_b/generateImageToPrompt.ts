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
import type { MyContext } from '@/interfaces'
import { modeCosts } from '@/price/helpers/modelsCost'
import { levels } from '@/menu'
import type { ModeEnum } from '@/interfaces/modes'
import type { PaymentType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'

import { directPaymentProcessor } from '@/core/supabase/directPayment'

export async function generateImageToPrompt(
  imageUrl: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  bot_name: string
): Promise<string> {
  console.log('generateImageToPrompt', imageUrl, telegram_id, username, is_ru)
  let costPerImage: number | undefined = undefined
  let newBalance: number | undefined = undefined

  try {
    const userExists = await getUserByTelegramIdString(telegram_id)
    console.log('userExists', userExists)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 2) {
      await updateUserLevelPlusOne(telegram_id, level)
    }

    if (typeof modeCosts[ModeEnum.ImageToPrompt] === 'function') {
      costPerImage = modeCosts[ModeEnum.ImageToPrompt](1)
    } else {
      costPerImage = modeCosts[ModeEnum.ImageToPrompt]
    }

    const paymentOperationId = `payment-${telegram_id}-${Date.now()}-${uuidv4()}`
    const paymentResult = await directPaymentProcessor({
      telegram_id,
      amount: costPerImage,
      type: PaymentType.MONEY_OUTCOME,
      description: 'Payment for image to prompt',
      bot_name,
      service_type: ModeEnum.ImageToPrompt,
      inv_id: paymentOperationId,
      metadata: { is_ru },
    })

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || 'Payment failed')
    }

    newBalance = paymentResult.balanceChange?.after

    bot.telegram.sendMessage(
      telegram_id,
      is_ru ? '⏳ Генерация промпта...' : '⏳ Generating prompt...'
    )

    const initResponse = await axios.post(
      'https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat',
      {
        data: [
          { path: imageUrl },
          'Descriptive',
          'long',
          [
            'Describe the image in detail, including colors, style, mood, and composition.',
          ],
          '',
          '',
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    )

    console.log(
      'Init response data:',
      JSON.stringify(initResponse.data, null, 2)
    )

    const eventId = initResponse.data?.event_id || initResponse.data
    console.log('eventId', eventId)
    if (!eventId) {
      console.error('No event ID in response:', initResponse.data)
      throw new Error('No event ID in response')
    }

    const resultResponse = await axios.get(
      `https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat/${eventId}`,
      {
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    )

    console.log(
      'Result response data:',
      JSON.stringify(resultResponse.data, null, 2)
    )

    if (!resultResponse.data) {
      console.error('Image to prompt: No data in response', resultResponse)
      throw new Error('Image to prompt: No data in response')
    }

    const responseText = resultResponse.data as string
    const lines = responseText.split('\n')
    console.log('Lines:', lines)

    let foundCaption = false
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          console.log('Parsed data:', data)
          if (Array.isArray(data) && data.length > 1) {
            const caption = data[1]
            console.log('Found caption:', caption)
            await bot.telegram.sendMessage(
              telegram_id,
              '```\n' + caption + '\n```',
              {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                  keyboard: [
                    [
                      {
                        text: is_ru
                          ? levels[104].title_ru
                          : levels[104].title_en,
                      },
                    ],
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: false,
                },
              }
            )

            if (costPerImage !== undefined && newBalance !== undefined) {
              await bot.telegram.sendMessage(
                telegram_id,
                is_ru
                  ? `Стоимость: ${costPerImage.toFixed(
                      2
                    )} ⭐️\nВаш баланс: ${newBalance.toFixed(2)} ⭐️`
                  : `Cost: ${costPerImage.toFixed(
                      2
                    )} ⭐️\nYour balance: ${newBalance.toFixed(2)} ⭐️`
              )
            }
            foundCaption = true
            return caption
          }
        } catch (e) {
          console.error('Error parsing JSON from line:', line, e)
        }
      } else {
        console.log('Skipped line:', line)
      }
    }

    if (!foundCaption) {
      console.error('No valid caption found in response. All lines:', lines)
      throw new Error('No valid caption found in response')
    }

    throw new Error('Internal error: Caption processing failed')
  } catch (error) {
    console.error('Error in generateImageToPrompt:', error)
    await sendServiceErrorToUser(bot, telegram_id, error as Error, is_ru)
    await sendServiceErrorToAdmin(bot, telegram_id, error as Error)

    if (newBalance !== undefined && costPerImage !== undefined) {
      try {
        await directPaymentProcessor({
          telegram_id,
          amount: costPerImage,
          type: PaymentType.REFUND,
          description: 'Refund for failed image-to-prompt',
          bot_name,
          service_type: ModeEnum.ImageToPrompt,
          inv_id: `refund-${telegram_id}-${Date.now()}-${uuidv4()}`,
          metadata: { is_ru },
        })
        console.log(`Refunded ${costPerImage} stars to user ${telegram_id}`)
        await bot.telegram.sendMessage(
          telegram_id,
          is_ru
            ? 'Средства возвращены из-за ошибки.'
            : 'Funds refunded due to error.'
        )
      } catch (refundError) {
        console.error(
          'CRITICAL: Failed to refund user after error:',
          refundError
        )
        await sendServiceErrorToAdmin(
          bot,
          telegram_id,
          new Error(
            `Failed refund check! User: ${telegram_id}, Amount: ${costPerImage}. Original error: ${
              (error as Error).message
            }. Refund error: ${(refundError as Error).message}`
          )
        )
      }
    }

    throw error
  }
}
