/**
 * ПРОСТОЕ ЦЕНТРАЛЬНОЕ МЕНЮ БЕЗ УРОВНЕЙ
 *
 * Простая система для показа всех доступных сцен и перехода в них
 * БЕЗ сложной логики levels и subscriptionLevelsMap
 */

import { Markup } from 'telegraf'
import { MyContext } from './interfaces'
import { isRussianFromState } from './helpers/centralizedLanguage'
import { MAIN_MENU } from './constants/sceneIds'
import { checkSubscriptionGuard } from './helpers/subscriptionGuard'
import { ADMIN_IDS_ARRAY } from './config'

// ✅ РЕАЛЬНЫЕ ID СЦЕН из registerCommands.ts
export const ALL_SCENES = [
  // Генерация изображений
  { sceneId: 'neuroPhotoWizard', nameRu: '📸 Нейрофото', nameEn: '📸 NeuroPhoto', needsSubscription: true },
  { sceneId: 'textToImageWizard', nameRu: '🖼️ Текст в фото', nameEn: '🖼️ Text to Photo', needsSubscription: true },
  { sceneId: 'imageUpscalerWizard', nameRu: '⬆️ Увеличить качество', nameEn: '⬆️ Upscale Quality', needsSubscription: true },
  { sceneId: 'imageToPromptWizard', nameRu: '🔍 Промпт из фото', nameEn: '🔍 Prompt from Photo', needsSubscription: true },

  // Генерация видео
  { sceneId: 'imageToVideoWizard', nameRu: '🎥 Фото в видео', nameEn: '🎥 Photo to Video', needsSubscription: true },
  { sceneId: 'textToVideoWizard', nameRu: '🎥 Видео из текста', nameEn: '🎥 Text to Video', needsSubscription: true },

  // AI обработка
  { sceneId: 'aiPhotoshopScene', nameRu: '🎨 ИИ Фотошоп', nameEn: '🎨 AI Photoshop', needsSubscription: true },
  { sceneId: 'morphingWizard', nameRu: '🌀 Морфинг', nameEn: '🌀 Morphing', needsSubscription: true },
  { sceneId: 'faceSwapWizard', nameRu: '🎭 Замена лица', nameEn: '🎭 Face Swap', needsSubscription: true },

  // Аватары
  { sceneId: 'avatarTransformScene', nameRu: '🦸‍♂️ ИИ Герои', nameEn: '🦸‍♂️ AI Heroes', needsSubscription: true },
  { sceneId: 'avatarBrainWizard', nameRu: '🧠 Мозг аватара', nameEn: '🧠 Avatar Brain', needsSubscription: true },
  { sceneId: 'chatWithAvatarWizard', nameRu: '💭 Чат с аватаром', nameEn: '💭 Chat with Avatar', needsSubscription: true },

  // Голос
  { sceneId: 'voice', nameRu: '🎤 Голос аватара', nameEn: '🎤 Avatar Voice', needsSubscription: true },
  { sceneId: 'textToSpeechWizard', nameRu: '🎙️ Текст в голос', nameEn: '🎙️ Text to Speech', needsSubscription: true },

  // Транскрибация
  { sceneId: 'videoTranscriptionWizard', nameRu: '📺 Транскрибация Reels', nameEn: '📺 Transcribe Reels', needsSubscription: true },

  // Служебные
  { sceneId: 'balanceScene', nameRu: '💰 Баланс', nameEn: '💰 Balance', needsSubscription: true },
  { sceneId: 'paymentScene', nameRu: '💎 Пополнить баланс', nameEn: '💎 Top Up Balance', needsSubscription: true },
  { sceneId: 'inviteScene', nameRu: '👥 Пригласить друга', nameEn: '👥 Invite Friend', needsSubscription: false },
  { sceneId: 'helpScene', nameRu: '💬 Техподдержка', nameEn: '💬 Support', needsSubscription: false },
  { sceneId: 'subscriptionScene', nameRu: '💫 Оформить подписку', nameEn: '💫 Subscribe', needsSubscription: false },

  // Админские
  { sceneId: 'instagramParserScene', nameRu: '🔍 Мониторинг конкурентов', nameEn: '🔍 Competitor Monitoring', needsSubscription: true, adminOnly: true },
  { sceneId: 'ai_reels_entry', nameRu: '🎬 ИИ Рилс', nameEn: '🎬 AI Reels', needsSubscription: true, adminOnly: true },
]

export async function showSimpleSceneMenu(ctx: MyContext) {
  console.log('🔍 [showSimpleSceneMenu] START', { telegramId: ctx.from?.id })
  try {
    const isRu = isRussianFromState(ctx)
    const telegramId = ctx.from?.id?.toString() || ''
    const isAdmin = telegramId && ADMIN_IDS_ARRAY.includes(parseInt(telegramId))

    console.log('🔍 [showSimpleSceneMenu] Parsed params:', { isRu, telegramId, isAdmin })

  // Создаем кнопки для каждой сцены
  const keyboard: any[][] = []

  for (const scene of ALL_SCENES) {
    // Пропускаем админские сцены для не-админов
    if (scene.adminOnly && !isAdmin) {
      continue
    }

    const buttonText = isRu ? scene.nameRu : scene.nameEn
    keyboard.push([Markup.button.callback(buttonText, `go_to_${scene.sceneId}`)])
  }

  // Кнопки навигации
  keyboard.push([Markup.button.callback('❌ Отмена', 'cancel')])

  const message = isRu
    ? '🏠 <b>Главное меню</b>\n\nВыберите нужную функцию 👇'
    : '🏠 <b>Main Menu</b>\n\nSelect a function 👇'

  await ctx.replyWithHTML(message, {
    reply_markup: Markup.inlineKeyboard(keyboard),
  })
  console.log('✅ [showSimpleSceneMenu] Menu sent successfully')
  } catch (error) {
    console.error('❌ [showSimpleSceneMenu] ERROR:', error)
    await ctx.reply('❌ Ошибка при показе меню. Попробуйте /start')
  }
}

// Обработчик для callback кнопок меню
export function setupSceneMenuCallbacks(bot: any) {
  bot.on('callback_query', async (ctx: MyContext) => {
    const query = ctx.callbackQuery
    if (!query || !('data' in query)) return

    const data = query.data as string
    const telegramId = ctx.from?.id?.toString() || ''
    const isAdmin = telegramId && ADMIN_IDS_ARRAY.includes(parseInt(telegramId))

    // Отменяем callback
    await ctx.answerCbQuery()

    // Обработка отмены
    if (data === 'cancel') {
      await ctx.scene.leave()
      await ctx.scene.enter(MAIN_MENU)
      return
    }

    // Обработка перехода в сцену
    if (data.startsWith('go_to_')) {
      const sceneId = data.replace('go_to_', '')

      // Находим сцену в списке
      const scene = ALL_SCENES.find(s => s.sceneId === sceneId)
      if (!scene) {
        await ctx.reply(isRussianFromState(ctx) ? '❌ Сцена не найдена' : '❌ Scene not found')
        return
      }

      // Проверка админ доступа
      if (scene.adminOnly && !isAdmin) {
        await ctx.reply(isRussianFromState(ctx) ? '❌ Доступ только для админов' : '❌ Admin access only')
        return
      }

      // Проверка подписки
      if (scene.needsSubscription) {
        const hasSubscription = await checkSubscriptionGuard(ctx, isRussianFromState(ctx) ? scene.nameRu : scene.nameEn)
        if (!hasSubscription) {
          return // checkSubscriptionGuard уже перенаправил в subscriptionScene
        }
      }

      // Переходим в сцену
      await ctx.scene.leave()
      await ctx.scene.enter(sceneId as any)
    }
  })
}
