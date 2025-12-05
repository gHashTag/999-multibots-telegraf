/**
 * 🎯 КОНФИГУРАЦИЯ КАТЕГОРИЙ НАВИГАЦИИ
 * 
 * Определяет структуру главного меню и подменю категорий.
 * Все категории и их функции описаны в одном месте.
 */

import { ModeEnum } from '@/interfaces/modes'

/**
 * Конфигурация функции внутри категории
 */
export interface NavigationItem {
  /** Уникальный ID функции */
  id: string
  /** Текст кнопки на русском */
  ru: string
  /** Текст кнопки на английском */
  en: string
  /** Иконка */
  icon: string
  /** Режим/сцена для перехода */
  mode: string | ModeEnum
  /** Требует подписку */
  requiresSubscription?: boolean
  /** Только для админов */
  adminOnly?: boolean
  /** Прямой переход без CheckBalanceScene */
  directScene?: boolean
}

/**
 * Конфигурация категории
 */
export interface CategoryConfig {
  /** Уникальный ID категории */
  id: string
  /** Название на русском */
  ru: string
  /** Название на английском */
  en: string
  /** Иконка */
  icon: string
  /** ID сцены категории */
  sceneId: string
  /** Функции в категории */
  items: NavigationItem[]
}

/**
 * Конфигурация всех категорий
 */
export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'photo',
    ru: '📸 Фото',
    en: '📸 Photo',
    icon: '📸',
    sceneId: 'photo_category',
    items: [
      {
        id: 'neuro_photo',
        ru: '📸 Нейрофото',
        en: '📸 NeuroPhoto',
        icon: '📸',
        mode: ModeEnum.NeuroPhoto,
        requiresSubscription: true,
      },
      {
        id: 'text_to_image',
        ru: '🖼️ Текст в фото',
        en: '🖼️ Text to Photo',
        icon: '🖼️',
        mode: ModeEnum.TextToImage,
        requiresSubscription: true,
      },
      {
        id: 'image_to_prompt',
        ru: '🔍 Промпт из фото',
        en: '🔍 Prompt from Photo',
        icon: '🔍',
        mode: ModeEnum.ImageToPrompt,
        requiresSubscription: true,
      },
      {
        id: 'ai_photoshop',
        ru: '🎨 ИИ Фотошоп',
        en: '🎨 AI Photoshop',
        icon: '🎨',
        mode: ModeEnum.AiPhotoshop,
        requiresSubscription: true,
        directScene: true,
      },
      {
        id: 'image_upscaler',
        ru: '⬆️ Увеличить качество',
        en: '⬆️ Upscale Quality',
        icon: '⬆️',
        mode: ModeEnum.ImageUpscaler,
        requiresSubscription: true,
      },
      {
        id: 'face_swap',
        ru: '🎭 Замена лица',
        en: '🎭 Face Swap',
        icon: '🎭',
        mode: ModeEnum.FaceSwap,
        requiresSubscription: true,
      },
      {
        id: 'morphing',
        ru: '🌀 Infinity Морфинг',
        en: '🌀 Infinity Morphing',
        icon: '🌀',
        mode: ModeEnum.MorphingWizard,
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'video',
    ru: '🎥 Видео',
    en: '🎥 Video',
    icon: '🎥',
    sceneId: 'video_category',
    items: [
      {
        id: 'text_to_video',
        ru: '🎥 Видео из текста',
        en: '🎥 Text to Video',
        icon: '🎥',
        mode: ModeEnum.TextToVideo,
        requiresSubscription: true,
      },
      {
        id: 'image_to_video',
        ru: '🎥 Фото в видео',
        en: '🎥 Photo to Video',
        icon: '🎥',
        mode: ModeEnum.ImageToVideo,
        requiresSubscription: true,
      },
      {
        id: 'ai_reels',
        ru: '🎬 ИИ Рилс',
        en: '🎬 AI Reels',
        icon: '🎬',
        mode: 'ai_reels',
        requiresSubscription: true,
      },
      {
        id: 'lip_sync',
        ru: '🎤 Синхронизация губ',
        en: '🎤 Lip Sync',
        icon: '🎤',
        mode: ModeEnum.LipSync,
        requiresSubscription: true,
        adminOnly: true,
      },
    ],
  },
  {
    id: 'audio',
    ru: '🎙️ Аудио',
    en: '🎙️ Audio',
    icon: '🎙️',
    sceneId: 'audio_category',
    items: [
      {
        id: 'voice_avatar',
        ru: '🎤 Голос аватара',
        en: '🎤 Avatar Voice',
        icon: '🎤',
        mode: ModeEnum.Voice,
        requiresSubscription: true,
      },
      {
        id: 'text_to_speech',
        ru: '🎙️ Текст в голос',
        en: '🎙️ Text to Speech',
        icon: '🎙️',
        mode: ModeEnum.TextToSpeech,
        requiresSubscription: true,
      },
      {
        id: 'video_transcription',
        ru: '📺 Транскрибация',
        en: '📺 Transcription',
        icon: '📺',
        mode: ModeEnum.VideoTranscription,
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'avatars',
    ru: '🤖 Аватары',
    en: '🤖 Avatars',
    icon: '🤖',
    sceneId: 'avatars_category',
    items: [
      {
        id: 'digital_body',
        ru: '🤖 Цифровое тело',
        en: '🤖 Digital Body',
        icon: '🤖',
        mode: ModeEnum.DigitalAvatarBody,
        requiresSubscription: true,
      },
      {
        id: 'avatar_brain',
        ru: '🧠 Мозг аватара',
        en: '🧠 Avatar Brain',
        icon: '🧠',
        mode: ModeEnum.Avatar,
        requiresSubscription: true,
      },
      {
        id: 'chat_with_avatar',
        ru: '💭 Чат с аватаром',
        en: '💭 Chat with Avatar',
        icon: '💭',
        mode: ModeEnum.ChatWithAvatar,
        requiresSubscription: true,
      },
      {
        id: 'select_model',
        ru: '🤖 Язык аватара',
        en: '🤖 Avatar Language',
        icon: '🤖',
        mode: ModeEnum.SelectModel,
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'tools',
    ru: '🛠️ Инструменты',
    en: '🛠️ Tools',
    icon: '🛠️',
    sceneId: 'tools_category',
    items: [
      {
        id: 'ai_heroes',
        ru: '🦸‍♂️ ИИ Герои',
        en: '🦸‍♂️ AI Heroes',
        icon: '🦸‍♂️',
        mode: ModeEnum.AIHeroes,
        requiresSubscription: true,
      },
      {
        id: 'instagram_parsing',
        ru: '🔍 Парсинг Instagram',
        en: '🔍 Instagram Parsing',
        icon: '🔍',
        mode: ModeEnum.InstagramScrapingWizard,
        adminOnly: true,
      },
    ],
  },
  {
    id: 'profile',
    ru: '👤 Профиль',
    en: '👤 Profile',
    icon: '👤',
    sceneId: 'profile_category',
    items: [
      {
        id: 'balance',
        ru: '💰 Баланс',
        en: '💰 Balance',
        icon: '💰',
        mode: ModeEnum.Balance,
        requiresSubscription: false,
        directScene: true,
      },
      {
        id: 'top_up',
        ru: '💎 Пополнить баланс',
        en: '💎 Top up Balance',
        icon: '💎',
        mode: ModeEnum.TopUpBalance,
        requiresSubscription: false,
        directScene: true,
      },
      {
        id: 'subscription',
        ru: '💫 Оформить подписку',
        en: '💫 Subscribe',
        icon: '💫',
        mode: ModeEnum.SubscriptionScene,
        directScene: true,
      },
      {
        id: 'invite',
        ru: '👥 Пригласить друга',
        en: '👥 Invite Friend',
        icon: '👥',
        mode: ModeEnum.Invite,
        directScene: true,
      },
      {
        id: 'support',
        ru: '💬 Техподдержка',
        en: '💬 Tech Support',
        icon: '💬',
        mode: 'techSupportScene',
        directScene: true,
      },
      {
        id: 'language',
        ru: '🌐 Язык',
        en: '🌐 Language',
        icon: '🌐',
        mode: 'changeLanguageScene',
        directScene: true,
      },
    ],
  },
]

/**
 * Получить категорию по ID
 */
export function getCategoryById(id: string): CategoryConfig | undefined {
  return CATEGORIES.find(cat => cat.id === id)
}

/**
 * Получить функцию по ID из всех категорий
 */
export function getNavigationItemById(id: string): NavigationItem | undefined {
  for (const category of CATEGORIES) {
    const item = category.items.find(i => i.id === id)
    if (item) return item
  }
  return undefined
}

/**
 * Получить все функции для категории
 */
export function getCategoryItems(categoryId: string): NavigationItem[] {
  const category = getCategoryById(categoryId)
  return category?.items || []
}

/**
 * Получить текст категории по языку
 */
export function getCategoryText(category: CategoryConfig, isRussian: boolean): string {
  return isRussian ? category.ru : category.en
}

/**
 * Получить текст функции по языку
 */
export function getItemText(item: NavigationItem, isRussian: boolean): string {
  return isRussian ? item.ru : item.en
}
