import { Scenes, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

const stickerScene = new Scenes.WizardScene<MyContext>(
  'stickerScene',

  // Step 1: Show stickers menu
  async ctx => {
    const isRu = await isRussianFromState(ctx)

    ctx.session.wizardData = {
      step: 1,
      action: null,
    }

    const menu = isRu
      ? '🎭 Выберите действие со стикером:'
      : '🎭 Choose sticker action:'

    const keyboard = isRu
      ? Markup.inlineKeyboard([
          [Markup.button.callback('📊 Анализ стикера', 'analyze')],
          [Markup.button.callback('🖼️ Конвертировать в фото', 'convert')],
          [Markup.button.callback('ℹ️ Информация о стикере', 'info')],
          [Markup.button.callback('➕ Добавить в набор', 'add_to_set')],
          [Markup.button.callback('❌ Отмена', 'cancel')],
        ])
      : Markup.inlineKeyboard([
          [Markup.button.callback('📊 Analyze sticker', 'analyze')],
          [Markup.button.callback('🖼️ Convert to photo', 'convert')],
          [Markup.button.callback('ℹ️ Sticker info', 'info')],
          [Markup.button.callback('➕ Add to set', 'add_to_set')],
          [Markup.button.callback('❌ Cancel', 'cancel')],
        ])

    await ctx.reply(menu, keyboard)
    return ctx.wizard.next()
  },

  // Step 2: Handle action selection
  async ctx => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) {
      await ctx.reply('❌ Ошибка выбора')
      return ctx.scene.leave()
    }

    const action = (ctx.callbackQuery as any).data
    ctx.session.wizardData.action = action

    // Answer callback query first
    await ctx.answerCbQuery()

    if (action === 'cancel') {
      await ctx.reply('✅ Отменено')
      return ctx.scene.leave()
    }

    const isRu = await isRussianFromState(ctx)

    if (action === 'analyze') {
      const msg = isRu
        ? '📤 Отправьте стикер для анализа'
        : '📤 Send sticker to analyze'
      await ctx.reply(msg)
    } else if (action === 'convert') {
      const msg = isRu
        ? '📤 Отправьте стикер для конвертации в изображение'
        : '📤 Send sticker to convert to image'
      await ctx.reply(msg)
    } else if (action === 'info') {
      const msg = isRu
        ? '📤 Отправьте стикер для получения информации'
        : '📤 Send sticker to get info'
      await ctx.reply(msg)
    } else if (action === 'add_to_set') {
      const msg = isRu
        ? '📤 Отправьте стикер и укажите название набора'
        : '📤 Send sticker and specify set name'
      await ctx.reply(msg)
    }

    return ctx.wizard.next()
  },

  // Step 3: Process sticker
  async ctx => {
    if (!ctx.message) {
      const isRu = await isRussianFromState(ctx)
      await ctx.reply(isRu ? '❌ Нет сообщения' : '❌ No message')
      return
    }

    const action = ctx.session.wizardData.action
    const isRu = await isRussianFromState(ctx)

    try {
      // Check if message has sticker
      if (!('sticker' in ctx.message)) {
        await ctx.reply(
          isRu
            ? '❌ Пожалуйста, отправьте стикер (не изображение или документ)'
            : '❌ Please send a sticker (not image or document)'
        )
        return
      }

      const sticker = ctx.message.sticker
      logger.info('[STICKER SCENE] Processing sticker', {
        action,
        fileId: sticker.file_id,
        emoji: sticker.emoji,
      })

      let response = ''

      if (action === 'analyze') {
        response = isRu
          ? `📊 Анализ стикера:\n\n` +
            `🎭 Тип: ${sticker.is_video ? 'Видео-стикер' : 'Статичный'}\n` +
            `😀 Эмодзи: ${sticker.emoji || 'Нет'}\n` +
            `🆔 ID: ${sticker.file_id.substring(0, 20)}...\n` +
            `📐 Размер: ${sticker.width}x${sticker.height}\n` +
            `💾 Размер файла: ${(sticker.file_size / 1024).toFixed(1)} KB`
          : `📊 Sticker Analysis:\n\n` +
            `🎭 Type: ${sticker.is_video ? 'Video sticker' : 'Static'}\n` +
            `😀 Emoji: ${sticker.emoji || 'None'}\n` +
            `🆔 ID: ${sticker.file_id.substring(0, 20)}...\n` +
            `📐 Size: ${sticker.width}x${sticker.height}\n` +
            `💾 File size: ${(sticker.file_size / 1024).toFixed(1)} KB`
      } else if (action === 'info') {
        response = isRu
          ? `ℹ️ Информация о стикере:\n\n` +
            `📦 Набор: ${sticker.set_name || 'Не указан'}\n` +
            `😀 Эмодзи: ${sticker.emoji || 'Нет'}\n` +
            `🆔 File ID: ${sticker.file_id}\n` +
            `📐 Размеры: ${sticker.width}x${sticker.height}`
          : `ℹ️ Sticker Info:\n\n` +
            `📦 Set: ${sticker.set_name || 'Not specified'}\n` +
            `😀 Emoji: ${sticker.emoji || 'None'}\n` +
            `🆔 File ID: ${sticker.file_id}\n` +
            `📐 Dimensions: ${sticker.width}x${sticker.height}`
      } else if (action === 'convert') {
        response = isRu
          ? `🔄 Стикер отправлен на конвертацию...\n\n` +
            `📝 Стикер будет конвертирован в PNG изображение\n` +
            `⏳ Время обработки: ~30 секунд\n` +
            `💰 Стоимость: 10 звезд`
          : `🔄 Sticker sent for conversion...\n\n` +
            `📝 Sticker will be converted to PNG image\n` +
            `⏳ Processing time: ~30 seconds\n` +
            `💰 Cost: 10 stars`

        // TODO: Add actual conversion logic here
        // This would involve downloading the sticker and converting it
      } else if (action === 'add_to_set') {
        response = isRu
          ? `➕ Для добавления в набор нужно:\n\n` +
            `1. Указать название набора\n` +
            `2. Стикер уже загружен\n\n` +
            `📝 Введите название набора:`
          : `➕ To add to set:\n\n` +
            `1. Specify set name\n` +
            `2. Sticker already uploaded\n\n` +
            `📝 Enter set name:`
      }

      await ctx.reply(response)

      // Show continue or finish options
      const keyboard = isRu
        ? Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Еще один стикер', 'repeat')],
            [Markup.button.callback('❌ Завершить', 'finish')],
          ])
        : Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Another sticker', 'repeat')],
            [Markup.button.callback('❌ Finish', 'finish')],
          ])

      await ctx.reply(isRu ? '🔄 Что дальше?' : '🔄 What next?', keyboard)
    } catch (error) {
      logger.error('[STICKER SCENE] Error processing sticker', { error })
      await ctx.reply(
        isRu ? '❌ Ошибка при обработке стикера' : '❌ Error processing sticker'
      )
    }
  }
)

// Action handlers
stickerScene.action('analyze', async ctx => {
  await ctx.answerCbQuery()
  ctx.session.wizardData.action = 'analyze'
  const isRu = await isRussianFromState(ctx)
  await ctx.reply(
    isRu ? '📤 Отправьте стикер для анализа' : '📤 Send sticker to analyze'
  )
  return ctx.wizard.next()
})

stickerScene.action('convert', async ctx => {
  await ctx.answerCbQuery()
  ctx.session.wizardData.action = 'convert'
  const isRu = await isRussianFromState(ctx)
  await ctx.reply(
    isRu ? '📤 Отправьте стикер для конвертации' : '📤 Send sticker to convert'
  )
  return ctx.wizard.next()
})

stickerScene.action('info', async ctx => {
  await ctx.answerCbQuery()
  ctx.session.wizardData.action = 'info'
  const isRu = await isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? '📤 Отправьте стикер для получения информации'
      : '📤 Send sticker to get info'
  )
  return ctx.wizard.next()
})

stickerScene.action('add_to_set', async ctx => {
  await ctx.answerCbQuery()
  ctx.session.wizardData.action = 'add_to_set'
  const isRu = await isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? '📤 Отправьте стикер и укажите название набора'
      : '📤 Send sticker and specify set name'
  )
  return ctx.wizard.next()
})

stickerScene.action('cancel', async ctx => {
  await ctx.answerCbQuery()
  await ctx.reply('✅ Отменено')
  return ctx.scene.leave()
})

stickerScene.action('repeat', async ctx => {
  await ctx.answerCbQuery()
  ctx.session.wizardData.action = null
  const isRu = await isRussianFromState(ctx)

  const menu = isRu
    ? '🎭 Выберите действие со стикером:'
    : '🎭 Choose sticker action:'

  const keyboard = isRu
    ? Markup.inlineKeyboard([
        [Markup.button.callback('📊 Анализ стикера', 'analyze')],
        [Markup.button.callback('🖼️ Конвертировать в фото', 'convert')],
        [Markup.button.callback('ℹ️ Информация о стикере', 'info')],
        [Markup.button.callback('➕ Добавить в набор', 'add_to_set')],
        [Markup.button.callback('❌ Отмена', 'cancel')],
      ])
    : Markup.inlineKeyboard([
        [Markup.button.callback('📊 Analyze sticker', 'analyze')],
        [Markup.button.callback('🖼️ Convert to photo', 'convert')],
        [Markup.button.callback('ℹ️ Sticker info', 'info')],
        [Markup.button.callback('➕ Add to set', 'add_to_set')],
        [Markup.button.callback('❌ Cancel', 'cancel')],
      ])

  await ctx.reply(menu, keyboard)
  return ctx.wizard.next()
})

stickerScene.action('finish', async ctx => {
  await ctx.answerCbQuery()
  await ctx.reply('✅ Завершено')
  return ctx.scene.leave()
})

export default stickerScene
