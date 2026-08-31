import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { escapeMarkdownV2CodeBlock } from '@/helpers/escapeMarkdown'

const TELEGRAM_MESSAGE_LIMIT = 4000 // Оставляем буфер в 96 символов для форматирования

/**
 * Безопасно отправляет длинные сообщения, разбивая их на части если необходимо
 * @param ctx Контекст Telegraf
 * @param text Текст для отправки
 * @param options Опции отправки сообщения
 * @returns Promise<void>
 */
export async function sendLongMessage(
  ctx: MyContext,
  text: string,
  options?: any
): Promise<void> {
  try {
    // Если сообщение помещается в лимит, отправляем как есть
    if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
      await ctx.reply(text, options)
      return
    }

    logger.info('📏 [LONG MESSAGE] Разбивка длинного сообщения на части', {
      originalLength: text.length,
      limit: TELEGRAM_MESSAGE_LIMIT,
      telegramId: ctx.from?.id,
    })

    // Разбиваем на части
    const chunks = splitTextIntoChunks(text, TELEGRAM_MESSAGE_LIMIT)

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      const isLast = i === chunks.length - 1

      // Применяем опции только к последнему сообщению (для клавиатуры)
      const chunkOptions = isLast ? options : undefined

      await ctx.reply(chunk, chunkOptions)

      // Небольшая задержка между сообщениями
      if (!isLast) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    logger.info('✅ [LONG MESSAGE] Длинное сообщение отправлено частями', {
      chunksCount: chunks.length,
      telegramId: ctx.from?.id,
    })
  } catch (error) {
    logger.error('❌ [LONG MESSAGE] Ошибка при отправке длинного сообщения', {
      error: error instanceof Error ? error.message : 'Unknown error',
      textLength: text.length,
      telegramId: ctx.from?.id,
    })

    // Fallback: отправляем сокращенную версию
    const truncatedText =
      text.slice(0, TELEGRAM_MESSAGE_LIMIT - 50) +
      '...\n\n[Сообщение сокращено]'
    await ctx.reply(truncatedText, options)
  }
}

/**
 * Разбивает текст на части, учитывая границы слов и markdown форматирование
 * @param text Исходный текст
 * @param maxLength Максимальная длина каждой части
 * @returns Массив частей текста
 */
function splitTextIntoChunks(text: string, maxLength: number): string[] {
  const chunks: string[] = []
  let remainingText = text

  while (remainingText.length > maxLength) {
    let splitIndex = maxLength

    // Ищем последний разрыв строки или пробел в пределах лимита
    const lastNewline = remainingText.lastIndexOf('\n', maxLength)
    const lastSpace = remainingText.lastIndexOf(' ', maxLength)

    if (lastNewline > maxLength * 0.7) {
      splitIndex = lastNewline
    } else if (lastSpace > maxLength * 0.7) {
      splitIndex = lastSpace
    }

    // Проверяем, не разрываем ли мы markdown код блок
    const beforeSplit = remainingText.slice(0, splitIndex)
    const codeBlockCount = (beforeSplit.match(/```/g) || []).length

    // Если нечетное количество ```, значит мы внутри блока кода
    if (codeBlockCount % 2 === 1) {
      // Ищем закрывающий ``` или начало блока
      const nextCodeBlock = remainingText.indexOf('```', splitIndex)
      const prevCodeBlock = remainingText.lastIndexOf('```', splitIndex)

      if (nextCodeBlock !== -1 && nextCodeBlock < maxLength * 1.5) {
        splitIndex = nextCodeBlock + 3
      } else if (prevCodeBlock !== -1) {
        splitIndex = prevCodeBlock
      }
    }

    chunks.push(remainingText.slice(0, splitIndex).trim())
    remainingText = remainingText.slice(splitIndex).trim()
  }

  if (remainingText.length > 0) {
    chunks.push(remainingText)
  }

  return chunks
}

/**
 * Безопасно отправляет улучшенный промпт с правильным форматированием
 * @param ctx Контекст Telegraf
 * @param improvedPrompt Улучшенный промпт
 * @param isRu Русский ли интерфейс
 * @param options Опции для сообщения
 */
export async function sendImprovedPrompt(
  ctx: MyContext,
  improvedPrompt: string,
  isRu: boolean,
  options?: any
): Promise<void> {
  const header = isRu ? 'Улучшенный промпт:' : 'Improved prompt:'
  const codeBlockStart = '```'
  const codeBlockEnd = '```'

  // Проверяем, поместится ли весь текст
  // improvedPrompt is LLM output: a backtick or backslash would break the
  // MarkdownV2 code fence and make Telegram reject the message, so escape it.
  const safePrompt = escapeMarkdownV2CodeBlock(improvedPrompt)
  const fullText = `${header}\n${codeBlockStart}\n${safePrompt}\n${codeBlockEnd}`

  if (fullText.length <= TELEGRAM_MESSAGE_LIMIT) {
    // Отправляем как есть
    await ctx.reply(fullText, options)
    return
  }

  logger.info(
    '📏 [IMPROVED PROMPT] Промпт слишком длинный, отправляем частями',
    {
      promptLength: improvedPrompt.length,
      fullTextLength: fullText.length,
      telegramId: ctx.from?.id,
    }
  )

  // Отправляем заголовок отдельно
  await ctx.reply(header)

  // Разбиваем промпт на части и отправляем в блоках кода
  const promptChunks = splitTextIntoChunks(
    improvedPrompt,
    TELEGRAM_MESSAGE_LIMIT - 20
  )

  for (let i = 0; i < promptChunks.length; i++) {
    const chunk = promptChunks[i]
    const isLast = i === promptChunks.length - 1
    const chunkText = `${codeBlockStart}\n${escapeMarkdownV2CodeBlock(chunk)}\n${codeBlockEnd}`

    // Применяем опции только к последнему сообщению
    const chunkOptions = isLast ? options : undefined

    await ctx.reply(chunkText, chunkOptions)

    if (!isLast) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}
