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
  /** Только для владельцев ботов (и админов) */
  ownerOnly?: boolean
  /** Прямой переход без CheckBalanceScene */
  directScene?: boolean
  /** Скрыть кнопку из меню (deprecated функционал) */
  hidden?: boolean
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
        id: 'ai_heroes',
        ru: '🦸‍♂️ ИИ Герои',
        en: '🦸‍♂️ AI Heroes',
        icon: '🦸‍♂️',
        mode: ModeEnum.AvatarTransform,
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
        id: 'morphing',
        ru: '🌀 Infinity Морфинг',
        en: '🌀 Infinity Morphing',
        icon: '🌀',
        mode: ModeEnum.MorphingWizard,
        requiresSubscription: true,
      },
      {
        id: 'ai_reels',
        ru: '🎬 ИИ Рилс',
        en: '🎬 AI Reels',
        icon: '🎬',
        mode: 'ai_reels',
        requiresSubscription: true,
        adminOnly: true,
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
    id: 'top_up',
    ru: '💎 Пополнить',
    en: '💎 Top up',
    icon: '💎',
    sceneId: ModeEnum.PaymentScene, // Прямой переход в PaymentScene
    items: [], // Пустой - это кнопка быстрого доступа, не категория с подменю
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
        hidden: true, // ✅ СКРЫТО: Пользователям не нужна подписка, только пополнение баланса
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
      {
        id: 'instagram_parsing',
        ru: '🔍 Парсинг Instagram',
        en: '🔍 Instagram Parsing',
        icon: '🔍',
        mode: ModeEnum.InstagramScrapingWizard,
        adminOnly: true,
      },
      {
        id: 'bot_stats',
        ru: '📊 Статистика бота',
        en: '📊 Bot Statistics',
        icon: '📊',
        mode: 'stats_menu_scene',
        ownerOnly: true,
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

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ ДЛЯ ВАРИАНТОВ КНОПОК
// Все варианты текстов генерируются из CATEGORIES автоматически
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Удалить эмодзи из текста
 */
function removeEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu, '').trim()
}

/**
 * Генерирует все варианты текста кнопки навигации для матчинга
 * Включает: оригинал ru, оригинал en, без эмодзи ru, без эмодзи en
 *
 * NOTE: Отличается от getButtonVariants в buttons.config.ts, которая работает с ButtonConfig
 */
export function getNavigationItemVariants(item: NavigationItem): string[] {
  const variants = new Set<string>()

  // Оригинальные тексты с эмодзи
  variants.add(item.ru)
  variants.add(item.en)

  // Без эмодзи
  const ruNoEmoji = removeEmoji(item.ru)
  const enNoEmoji = removeEmoji(item.en)
  if (ruNoEmoji) variants.add(ruNoEmoji)
  if (enNoEmoji) variants.add(enNoEmoji)

  return Array.from(variants)
}

/**
 * Получить варианты кнопки навигации по её ID
 */
export function getButtonVariantsById(itemId: string): string[] {
  const item = getNavigationItemById(itemId)
  return item ? getNavigationItemVariants(item) : []
}

/**
 * Получить варианты для категории по её ID
 */
export function getCategoryButtonVariants(categoryId: string): string[] {
  const category = getCategoryById(categoryId)
  if (!category) return []

  const variants = new Set<string>()

  // Оригинальные тексты с эмодзи
  variants.add(category.ru)
  variants.add(category.en)

  // Без эмодзи
  const ruNoEmoji = removeEmoji(category.ru)
  const enNoEmoji = removeEmoji(category.en)
  if (ruNoEmoji) variants.add(ruNoEmoji)
  if (enNoEmoji) variants.add(enNoEmoji)

  return Array.from(variants)
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 ПРЕДГЕНЕРИРОВАННЫЕ ВАРИАНТЫ ДЛЯ БЫСТРОГО ДОСТУПА
// Используются в middleware для матчинга кнопок
// ═══════════════════════════════════════════════════════════════════════════

/** Варианты для кнопки "Главное меню" - включает ВСЕ эмодзи, используемые в сценах */
export const MAIN_MENU_VARIANTS = [
  // Стандартный стиль (основной)
  '🏠 Главное меню',
  '🏠 Main menu',
  // Альтернативные эмодзи (для совместимости со старыми сценами)
  '🚪 Главное меню',
  '🚪 Main menu',
  // Без эмодзи
  'Главное меню',
  'Main menu',
  'главное меню',
  'main menu',
  // Команды
  '/menu',
  'меню',
  'menu'
]

/** Варианты для кнопки "Отмена" */
export const CANCEL_VARIANTS = [
  'Отмена',
  'Cancel',
  '/cancel',
  'отмена',
  'cancel'
]

/** Варианты для кнопки "Назад" - включает ВСЕ эмодзи, используемые в сценах */
export const BACK_VARIANTS = [
  // Стандартный стиль (основной)
  '◀️ Назад',
  '◀️ Back',
  // Альтернативные эмодзи (для совместимости со старыми сценами)
  '🔙 Назад',
  '🔙 Back',
  '⬅️ Назад',
  '⬅️ Back',
  // Без эмодзи
  'Назад',
  'Back',
  // Дополнительные варианты
  '⬅️ Назад в меню',
  '⬅️ Back to Menu',
  '🔙 Назад в меню',
  '🔙 Back to menu',
]

// Динамически генерируемые варианты из CATEGORIES

/** Варианты для "Пригласить друга" - из CATEGORIES */
export const INVITE_VARIANTS = getButtonVariantsById('invite')

/** Варианты для "Техподдержка" - из CATEGORIES */
export const SUPPORT_VARIANTS = getButtonVariantsById('support')

/** Варианты для "Баланс" - из CATEGORIES */
export const BALANCE_VARIANTS = [
  ...getButtonVariantsById('balance'),
  ...getButtonVariantsById('top_up')
]

/** Варианты для "Подписка" - из CATEGORIES */
export const SUBSCRIPTION_VARIANTS = getButtonVariantsById('subscription')

/** Варианты для "Язык" - из CATEGORIES */
export const LANGUAGE_VARIANTS = getButtonVariantsById('language')

/** Варианты для "Язык аватара" - из CATEGORIES */
export const AVATAR_LANGUAGE_VARIANTS = getButtonVariantsById('select_model')

/** Варианты для категории "Профиль" - из CATEGORIES */
export const PROFILE_CATEGORY_VARIANTS = getCategoryButtonVariants('profile')

/** Варианты для "Статистика бота" - из CATEGORIES (ownerOnly) */
export const BOT_STATS_VARIANTS = getButtonVariantsById('bot_stats')
