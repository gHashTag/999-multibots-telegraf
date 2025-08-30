import axios from 'axios'
import {
  getUserByTelegramIdString,
  updateUserLevelPlusOne,
} from '@/core/supabase'
import {
  sendServiceErrorToUser,
  sendServiceErrorToAdmin,
} from '@/helpers/error'
// import { Telegraf } from 'telegraf' // Telegraf import removed
import { MyContext } from '@/interfaces'
import { modeCosts } from '@/price/helpers/modelsCost'
import { levels } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'
import { Markup } from 'telegraf'
import { replicate } from '@/core/replicate'

import { directPaymentProcessor } from '@/core/supabase/directPayment'

export async function generateImageToPrompt(
  imageUrl: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  ctx: MyContext,
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

    // bot.telegram.sendMessage(
    await ctx.telegram.sendMessage(
      // Changed to ctx.telegram.sendMessage
      telegram_id,
      is_ru ? '⏳ Генерация промпта...' : '⏳ Generating prompt...'
    )

    try {
      // Используем CLIP Interrogator от Replicate для анализа изображения
      console.log('Using Replicate CLIP Interrogator for image analysis...')
      
      const output = await replicate.run(
        "pharmapsychotic/clip-interrogator:8151e1c9f47e696fa316146a2e35812ccf79cfc9ebb255ae6f7dda6ae5b65de5",
        {
          input: {
            image: imageUrl,
            mode: "best", // "best" для максимально детального описания, "fast" для быстрого
            clip_model_name: "ViT-L-14/openai" // Лучшая модель для детального описания
          }
        }
      )

      const caption = output as string
      
      if (!caption) {
        throw new Error('No caption generated from Replicate API')
      }

      console.log('Generated caption:', caption)

      // Экранируем специальные символы для MarkdownV2
      const escapedCaption = caption.replace(/[_*\[\]()~`>#\+\-=|{}.!]/g, '\\$&')

      // Отправляем результат пользователю
      await ctx.telegram.sendMessage(
        telegram_id,
        '```\n' + escapedCaption + '\n```',
        {
          parse_mode: 'MarkdownV2',
          ...Markup.keyboard([
            [
              Markup.button.text(
                is_ru ? levels[104].title_ru : levels[104].title_en
              ),
            ],
          ]).resize(),
        }
      )

      if (costPerImage !== undefined && newBalance !== undefined) {
        await ctx.telegram.sendMessage(
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

      return caption
    } catch (apiError) {
      console.error('Error calling Replicate API:', apiError)
      
      // Fallback на альтернативную модель Replicate
      console.log('Trying alternative Replicate model img2prompt...')
      
      try {
        // Пробуем альтернативную модель img2prompt
        const alternativeOutput = await replicate.run(
          "methexis-inc/img2prompt:50adaf2d3ad20a6f911a8a9e3ccf777b263b8596fbd2c8fc26e8888f8a0edbb5",
          {
            input: {
              image: imageUrl
            }
          }
        )

        const caption = alternativeOutput as string
        
        if (!caption) {
          throw new Error('No caption from alternative Replicate model')
        }

        console.log('Alternative model caption:', caption)

        const escapedCaption = caption.replace(/[_*\[\]()~`>#\+\-=|{}.!]/g, '\\$&')

        await ctx.telegram.sendMessage(
          telegram_id,
          '```\n' + escapedCaption + '\n```',
          {
            parse_mode: 'MarkdownV2',
            ...Markup.keyboard([
              [
                Markup.button.text(
                  is_ru ? levels[104].title_ru : levels[104].title_en
                ),
              ],
            ]).resize(),
          }
        )

        if (costPerImage !== undefined && newBalance !== undefined) {
          await ctx.telegram.sendMessage(
            telegram_id,
            is_ru
              ? `Стоимость: ${costPerImage.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(2)} ⭐️`
              : `Cost: ${costPerImage.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(2)} ⭐️`
          )
        }

        return caption
      } catch (altReplicateError) {
        console.error('Alternative Replicate model also failed:', altReplicateError)
        
        // Последний fallback на HuggingFace API
        console.log('Final fallback to HuggingFace API...')
        
        const initResponse = await axios.post(
          'https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat',
          {
            data: [
              { path: imageUrl },
              'Descriptive',
              'long',
              ['Describe the image in detail, including colors, style, mood, and composition.'],
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
            timeout: 30000, // 30 секунд таймаут
          }
        )

        const eventId = initResponse.data?.event_id || initResponse.data
        
        if (!eventId) {
          throw new Error('No event ID in HuggingFace response')
        }

        // Ждем немного перед запросом результата
        await new Promise(resolve => setTimeout(resolve, 2000))

        const resultResponse = await axios.get(
          `https://fancyfeast-joy-caption-alpha-two.hf.space/call/stream_chat/${eventId}`,
          {
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000,
          }
        )

        if (!resultResponse.data) {
          throw new Error('No data in HuggingFace response')
        }

        const responseText = resultResponse.data as string
        const lines = responseText.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (Array.isArray(data) && data.length > 1) {
                const caption = data[1]
                
                await ctx.telegram.sendMessage(
                  telegram_id,
                  '```\n' + caption + '\n```',
                  {
                    parse_mode: 'MarkdownV2',
                    ...Markup.keyboard([
                      [
                        Markup.button.text(
                          is_ru ? levels[104].title_ru : levels[104].title_en
                        ),
                      ],
                    ]).resize(),
                  }
                )

                if (costPerImage !== undefined && newBalance !== undefined) {
                  await ctx.telegram.sendMessage(
                    telegram_id,
                    is_ru
                      ? `Стоимость: ${costPerImage.toFixed(2)} ⭐️\nВаш баланс: ${newBalance.toFixed(2)} ⭐️`
                      : `Cost: ${costPerImage.toFixed(2)} ⭐️\nYour balance: ${newBalance.toFixed(2)} ⭐️`
                  )
                }

                return caption
              }
            } catch (e) {
              console.error('Error parsing HuggingFace response:', e)
            }
          }
        }
        
        throw new Error('Failed to extract caption from HuggingFace response')
      }
    }
  } catch (error) {
    console.error('Error in generateImageToPrompt:', error)
    // await sendServiceErrorToUser(bot, telegram_id, error as Error, is_ru)
    await sendServiceErrorToUser(ctx, telegram_id, error as Error, is_ru) // Changed to pass ctx
    // await sendServiceErrorToAdmin(bot, telegram_id, error as Error)
    await sendServiceErrorToAdmin(ctx, telegram_id, error as Error) // Changed to pass ctx

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
        // await bot.telegram.sendMessage(
        await ctx.telegram.sendMessage(
          // Changed to ctx.telegram.sendMessage
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
        // await sendServiceErrorToAdmin(
        await sendServiceErrorToAdmin(
          // Changed to pass ctx
          // bot,
          ctx, // Pass ctx
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
