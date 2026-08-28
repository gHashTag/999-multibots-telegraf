/**
 * 🎯 СЦЕНЫ КАТЕГОРИЙ
 *
 * Эти сцены показывают подменю для каждой категории.
 * Вся логика навигации управляется через NavigationService.
 */

import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { showCategoryMenu } from '@/navigation'
import { ModeEnum } from '@/interfaces/modes'

/**
 * Сцена категории "Фото"
 */
export const photoCategoryScene = new Scenes.WizardScene<MyContext>(
  'photo_category',
  async ctx => {
    await showCategoryMenu(ctx, 'photo')
    return ctx.scene.leave()
  }
)

/**
 * Сцена категории "Видео"
 */
export const videoCategoryScene = new Scenes.WizardScene<MyContext>(
  'video_category',
  async ctx => {
    await showCategoryMenu(ctx, 'video')
    return ctx.scene.leave()
  }
)

/**
 * Сцена категории "Аудио"
 */
export const audioCategoryScene = new Scenes.WizardScene<MyContext>(
  'audio_category',
  async ctx => {
    await showCategoryMenu(ctx, 'audio')
    return ctx.scene.leave()
  }
)

/**
 * Сцена категории "Аватары"
 */
export const avatarsCategoryScene = new Scenes.WizardScene<MyContext>(
  'avatars_category',
  async ctx => {
    await showCategoryMenu(ctx, 'avatars')
    return ctx.scene.leave()
  }
)

/**
 * Сцена категории "Профиль"
 */
export const profileCategoryScene = new Scenes.WizardScene<MyContext>(
  'profile_category',
  async ctx => {
    await showCategoryMenu(ctx, 'profile')
    return ctx.scene.leave()
  }
)

// Экспорт всех сцен категорий
export const categoryScenes = [
  photoCategoryScene,
  videoCategoryScene,
  audioCategoryScene,
  avatarsCategoryScene,
  profileCategoryScene,
]
