import { processBalanceOperation, sendBalanceMessage } from '@/price/helpers'
import axios from 'axios'
import { getUserByTelegramId, updateUserLevelPlusOne } from '@/core/supabase'
import { errorMessage, errorMessageAdmin } from '@/helpers'
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { modeCosts } from '@/price/helpers/modelsCost'
import { levels } from '@/menu'
import { ModeEnum } from '@/interfaces/modes'
import { TransactionType } from '@/interfaces/payments.interface'

export async function generateImageToPrompt(
  imageUrl: string,
  telegram_id: string,
  username: string,
  is_ru: boolean,
  bot: Telegraf<MyContext>,
  bot_name: string
): Promise<string> {
  console.log('generateImageToPrompt', imageUrl, telegram_id, username, is_ru)
  try {
    const userExists = await getUserByTelegramId(telegram_id)
    console.log('userExists', userExists)
    if (!userExists) {
      throw new Error(`User with ID ${telegram_id} does not exist.`)
    }
    const level = userExists.level
    if (level === 2) {
      await updateUserLevelPlusOne(telegram_id, level)
    }
    let costPerImage: number
    if (typeof modeCosts[ModeEnum.ImageToPrompt] === 'function') {
      costPerImage = modeCosts[ModeEnum.ImageToPrompt](1)
    } else {
      costPerImage = modeCosts[ModeEnum.ImageToPrompt]
    }
    const balanceCheck = await processBalanceOperation({
      telegram_id,
      amount: costPerImage,
      is_ru,
      bot,
      bot_name,
      description: 'Payment for image to prompt',
      type: TransactionType.MONEY_EXPENSE,
    })
    if (!balanceCheck.success) {
      const msg = is_ru
        ? `❌ Недостаточно звёзд. Необходимо: ${costPerImage} ⭐️`
        : `❌ Insufficient stars. Required: ${costPerImage} ⭐️`
      await bot.telegram.sendMessage(telegram_id, msg)
      throw new Error('Not enough stars')
    }

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

    console.log('Init response data:', JSON.stringify(initResponse.data, null, 2))

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

    console.log('Result response data:', JSON.stringify(resultResponse.data, null, 2))

    if (!resultResponse.data) {
      console.error('Image to prompt: No data in response', resultResponse)
      throw new Error('Image to prompt: No data in response')
    }

    const responseText = resultResponse.data as string
    const lines = responseText.split('\n')
    console.log('Lines:', lines)

    let foundCaption = false;
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

            await sendBalanceMessage(
              telegram_id,
              balanceCheck.newBalance ?? 0,
              costPerImage,
              is_ru,
              bot.telegram
            )
            foundCaption = true;
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
    }

    throw new Error('No valid caption found in response')
  } catch (error) {
    console.error('Joy Caption API error:', error)
    errorMessage(error as Error, telegram_id.toString(), is_ru)
    errorMessageAdmin(error as Error)
    throw error
  }
}
