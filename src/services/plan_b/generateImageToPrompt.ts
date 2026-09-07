import axios from 'axios'
import FormData from 'form-data'
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
import { ModeEnum } from '@/interfaces/modes'
import { PaymentType } from '@/interfaces/payments.interface'
import { v4 as uuidv4 } from 'uuid'
import { Markup } from 'telegraf'

import { directPaymentProcessor } from '@/core/supabase/directPayment'
import { escapeMarkdownV2CodeBlock } from '@/helpers/escapeMarkdown'

const CAPTION_SPACE = 'https://fancyfeast-joy-caption-alpha-two.hf.space'
const CAPTION_ATTEMPTS = 3
const CAPTION_RETRY_DELAY_MS = 3000

/**
 * Ошибка внешнего сервиса подписей (Gradio Space).
 * Отделена от программных ошибок, чтобы показывать пользователю
 * внятное сообщение вместо «No valid caption found in response».
 */
class CaptionServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CaptionServiceError'
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Экранирование для MarkdownV2 внутри ``` блока:
 * Telegram требует экранировать только обратный слэш и обратную кавычку.
 */
// escapeForMarkdownV2CodeBlock moved to @/helpers/escapeMarkdown (canonical, shared)

/**
 * Space не всегда может скачать файл по ссылке api.telegram.org  telegram-api-root-ok cyrillic-ok
 * (сеть HF, приватность, размер) — в этом случае stream_chat отдаёт
 * `event: error` / `data: null`. Поэтому скачиваем картинку сами
 * и загружаем её в Space через /upload.
 *
 * Побочный плюс: токен бота (он входит в ссылку getFileLink)
 * больше не уходит стороннему сервису.
 */
async function uploadImageToSpace(imageUrl: string): Promise<string> {
  const download = await axios.get<Buffer>(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 60_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })

  const form = new FormData()
  form.append('files', Buffer.from(download.data), {
    filename: 'image.jpg',
    contentType:
      (download.headers['content-type'] as string | undefined) || 'image/jpeg',
  })

  const upload = await axios.post<string[]>(`${CAPTION_SPACE}/upload`, form, {
    headers: form.getHeaders(),
    timeout: 120_000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  })

  const uploadedPath = Array.isArray(upload.data) ? upload.data[0] : undefined
  if (!uploadedPath) {
    throw new CaptionServiceError(
      `Upload to caption space returned no path: ${JSON.stringify(
        upload.data
      )?.slice(0, 300)}`
    )
  }

  return uploadedPath
}

/**
 * Разбор SSE-ответа Gradio. Поток выглядит так:
 *   event: complete
 *   data: ["<prompt>", "<caption>"]
 * либо, при сбое на стороне Space:
 *   event: error
 *   data: null
 */
function parseCaptionStream(responseText: string): string {
  const lines = responseText.split('\n')
  let currentEvent = ''
  let caption: string | null = null

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice('event:'.length).trim()
      continue
    }

    if (!line.startsWith('data:')) continue

    const raw = line.slice('data:'.length).trim()

    if (currentEvent === 'error') {
      throw new CaptionServiceError(
        `Caption space returned an error event: ${raw || 'no details'}`
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      console.error('Error parsing JSON from line:', line, e)
      continue
    }

    // Промежуточные (generating) и финальный (complete) кадры имеют
    // одинаковую форму — берём последний непустой.
    if (Array.isArray(parsed) && parsed.length > 1) {
      const value = parsed[1]
      if (typeof value === 'string' && value.trim().length > 0) {
        caption = value
      }
    }
  }

  if (!caption) {
    throw new CaptionServiceError(
      `No valid caption in caption space response: ${responseText.slice(0, 500)}`
    )
  }

  return caption
}

/**
 * Один проход: загрузка изображения в Space -> запуск stream_chat -> чтение результата.
 */
async function requestCaption(imageUrl: string): Promise<string> {
  const uploadedPath = await uploadImageToSpace(imageUrl)
  console.log('Uploaded image to caption space:', uploadedPath)

  const initResponse = await axios.post(
    `${CAPTION_SPACE}/call/stream_chat`,
    {
      data: [
        { path: uploadedPath, meta: { _type: 'gradio.FileData' } },
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
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  )

  const eventId = initResponse.data?.event_id
  console.log('eventId', eventId)
  if (!eventId) {
    throw new CaptionServiceError(
      `No event ID in response: ${JSON.stringify(initResponse.data)?.slice(
        0,
        300
      )}`
    )
  }

  const resultResponse = await axios.get<string>(
    `${CAPTION_SPACE}/call/stream_chat/${eventId}`,
    {
      responseType: 'text',
      timeout: 300_000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    }
  )

  if (!resultResponse.data) {
    throw new CaptionServiceError('Caption space returned an empty response')
  }

  return parseCaptionStream(String(resultResponse.data))
}

/**
 * Space периодически падает (ZeroGPU quota, холодный старт, сетевые сбои),
 * поэтому повторяем несколько раз, прежде чем возвращать деньги.
 */
async function requestCaptionWithRetries(imageUrl: string): Promise<string> {
  let lastError: unknown

  for (let attempt = 1; attempt <= CAPTION_ATTEMPTS; attempt++) {
    try {
      return await requestCaption(imageUrl)
    } catch (error) {
      lastError = error
      console.error(
        `Caption attempt ${attempt}/${CAPTION_ATTEMPTS} failed:`,
        (error as Error).message
      )
      if (attempt < CAPTION_ATTEMPTS) {
        await sleep(CAPTION_RETRY_DELAY_MS * attempt)
      }
    }
  }

  throw lastError
}

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

    const caption = await requestCaptionWithRetries(imageUrl)
    console.log('Found caption:', caption)

    await ctx.telegram.sendMessage(
      telegram_id,
      '```\n' + escapeMarkdownV2CodeBlock(caption) + '\n```',
      {
        parse_mode: 'MarkdownV2',
        ...Markup.keyboard([
          [Markup.button.text(is_ru ? '🏠 Главное меню' : '🏠 Main menu')],
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
  } catch (error) {
    console.error('Error in generateImageToPrompt:', error)

    // Пользователю — понятный текст, админу — полная диагностика.
    const userFacingError =
      error instanceof CaptionServiceError
        ? new Error(
            is_ru
              ? 'Сервис распознавания изображений временно недоступен. Попробуйте ещё раз через несколько минут.'
              : 'The image captioning service is temporarily unavailable. Please try again in a few minutes.'
          )
        : (error as Error)

    await sendServiceErrorToUser(ctx, telegram_id, userFacingError, is_ru)
    await sendServiceErrorToAdmin(ctx, telegram_id, error as Error)

    if (newBalance !== undefined && costPerImage !== undefined) {
      try {
        // Результат проверяем: directPaymentProcessor при неудаче НЕ бросает,
        // а возвращает success: false. Без проверки человеку сообщали бы о
        // возврате, которого не было, и никто бы не узнал.
        const refund = await directPaymentProcessor({
          telegram_id,
          amount: costPerImage,
          type: PaymentType.REFUND,
          description: 'Refund for failed image-to-prompt',
          bot_name,
          service_type: ModeEnum.ImageToPrompt,
          inv_id: `refund-${telegram_id}-${Date.now()}-${uuidv4()}`,
          metadata: { is_ru },
        })

        if (!refund.success) {
          console.error(
            '💸❌ REFUND FAILED — деньги НЕ возвращены',
            telegram_id,
            costPerImage,
            refund.error
          )
        }

        await ctx.telegram.sendMessage(
          telegram_id,
          refund.success
            ? is_ru
              ? 'Средства возвращены из-за ошибки.'
              : 'Funds refunded due to error.'
            : is_ru
              ? 'Произошла ошибка. Вернуть звёзды автоматически не удалось — напишите в поддержку.'
              : 'An error occurred. Automatic refund failed — please contact support.'
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
