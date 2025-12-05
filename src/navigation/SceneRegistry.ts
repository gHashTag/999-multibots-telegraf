/**
 * 🎭 ЕДИНЫЙ РЕЕСТР СЦЕН
 *
 * Центральный источник правды для всех сцен в системе.
 * Содержит метаданные, зависимости, разрешения и правила навигации.
 */

import { ModeEnum } from '@/interfaces/modes'

/**
 * Типы сцен по функциональному назначению
 */
export enum SceneCategory {
  SYSTEM = 'system',           // Системные сцены (меню, справка)
  GENERATION = 'generation',   // Генерация контента (изображения, видео)
  PAYMENT = 'payment',         // Платежные операции
  WIZARD = 'wizard',           // Пошаговые мастера
  TOOLS = 'tools',             // Инструменты (парсинг, анализ)
  AVATAR = 'avatar',           // Аватары и персонажи
  ADMIN = 'admin',             // Админ-панели
  UTILITY = 'utility'          // Вспомогательные сцены
}

/**
 * Уровень доступа к сцене
 */
export enum AccessLevel {
  PUBLIC = 'public',         // Доступно всем
  SUBSCRIBER = 'subscriber', // Требует подписки
  PREMIUM = 'premium',       // Требует премиум подписку
  ADMIN = 'admin',           // Только для админов
  STAFF = 'staff'            // Для персонала
}

/**
 * Статус сцены в системе
 */
export enum SceneStatus {
  ACTIVE = 'active',         // Активная сцена
  DEPRECATED = 'deprecated', // Устарела, но доступна
  DISABLED = 'disabled',     // Отключена
  PLANNED = 'planned'        // В разработке
}

/**
 * Метаданные сцены
 */
export interface SceneMetadata {
  /** Уникальный ID сцены (должен совпадать с scene.id) */
  id: string

  /** Человекочитаемое название */
  name: string

  /** Описание функциональности */
  description: string

  /** Категория сцены */
  category: SceneCategory

  /** Уровень доступа */
  accessLevel: AccessLevel

  /** Статус в системе */
  status: SceneStatus

  /** Соответствующий ModeEnum (если есть) */
  modeEnum?: ModeEnum | string

  /** Стоимость входа/использования (звезды) */
  cost?: number

  /** Требуемые права доступа */
  permissions?: string[]

  /** Родительские сцены (откуда можно прийти) */
  allowedParents?: string[]

  /** Дочерние сцены (куда можно перейти) */
  allowedChildren?: string[]

  /** Заблокированные переходы (куда НЕЛЬЗЯ перейти) */
  blockedTransitions?: string[]

  /** Нужна ли подписка для доступа */
  requiresSubscription?: boolean

  /** Поддерживаемые языки */
  supportedLanguages?: ('ru' | 'en')[]

  /** Теги для поиска и фильтрации */
  tags?: string[]

  /** URL для дополнительной информации */
  helpUrl?: string

  /** Версия сцены */
  version?: string

  /** Дата создания */
  createdAt?: string

  /** Последнее обновление */
  updatedAt?: string
}

/**
 * Реестр всех сцен в системе
 */
export const SCENE_REGISTRY: Record<string, SceneMetadata> = {
  // ========================================
  // СИСТЕМНЫЕ СЦЕНЫ
  // ========================================

  menuScene: {
    id: 'menuScene',
    name: 'Главное меню',
    description: 'Основное меню бота с доступом ко всем функциям',
    category: SceneCategory.SYSTEM,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.MenuScene,
    supportedLanguages: ['ru', 'en'],
    tags: ['menu', 'main', 'navigation'],
    version: '1.0.0'
  },

  helpScene: {
    id: 'helpScene',
    name: 'Справка и помощь',
    description: 'Информация о возможностях бота и инструкции',
    category: SceneCategory.SYSTEM,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.Help,
    supportedLanguages: ['ru', 'en'],
    tags: ['help', 'info', 'guide'],
    version: '1.0.0'
  },

  techSupportScene: {
    id: 'techSupportScene',
    name: 'Техподдержка',
    description: 'Контакты техподдержки и обращения за помощью',
    category: SceneCategory.SYSTEM,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['support', 'help', 'contact'],
    version: '1.0.0'
  },

  checkBalanceScene: {
    id: 'checkBalanceScene',
    name: 'Проверка баланса',
    description: 'Проверка баланса пользователя и переход к функциям',
    category: SceneCategory.SYSTEM,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.CheckBalanceScene,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['balance', 'check', 'access'],
    version: '1.0.0'
  },

  // ========================================
  // ПЛАТЕЖНЫЕ ОПЕРАЦИИ
  // ========================================

  subscriptionScene: {
    id: 'subscriptionScene',
    name: 'Оформление подписки',
    description: 'Выбор и оформление подписки на бота',
    category: SceneCategory.PAYMENT,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.SubscriptionScene,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['subscription', 'payment', 'plan'],
    version: '1.0.0'
  },

  paymentScene: {
    id: 'paymentScene',
    name: 'Платежная система',
    description: 'Обработка платежей за услуги',
    category: SceneCategory.PAYMENT,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.PaymentScene,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['payment', 'billing'],
    version: '1.0.0'
  },

  rublePaymentScene: {
    id: 'rublePaymentScene',
    name: 'Оплата рублями',
    description: 'Оплата через российские платежные системы',
    category: SceneCategory.PAYMENT,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.RublePaymentScene,
    cost: 0,
    supportedLanguages: ['ru'],
    tags: ['payment', 'rubles', 'robokassa'],
    version: '1.0.0'
  },

  starPaymentScene: {
    id: 'starPaymentScene',
    name: 'Оплата звездами',
    description: 'Оплата через Telegram Stars',
    category: SceneCategory.PAYMENT,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.StarPaymentScene,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['payment', 'stars', 'telegram'],
    version: '1.0.0'
  },

  // ========================================
  // ГЕНЕРАЦИЯ КОНТЕНТА
  // ========================================

  neuroPhotoWizard: {
    id: 'neuroPhotoWizard',
    name: 'Генерация фото',
    description: 'Создание изображений с помощью ИИ',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.NeuroPhoto,
    requiresSubscription: true,
    cost: 10,
    supportedLanguages: ['ru', 'en'],
    tags: ['photo', 'generation', 'ai'],
    version: '2.0.0'
  },

  neuroPhotoWizardV2: {
    id: 'neuroPhotoWizardV2',
    name: 'Генерация фото v2',
    description: 'Улучшенная версия генерации изображений',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.NeuroPhotoV2,
    requiresSubscription: true,
    cost: 15,
    supportedLanguages: ['ru', 'en'],
    tags: ['photo', 'generation', 'ai', 'v2'],
    version: '2.0.0'
  },

  textToImageWizard: {
    id: 'textToImageWizard',
    name: 'Текст в изображение',
    description: 'Генерация изображений из текстового описания',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.TextToImage,
    requiresSubscription: true,
    cost: 8,
    supportedLanguages: ['ru', 'en'],
    tags: ['text', 'image', 'generation'],
    version: '1.0.0'
  },

  textToVideoWizard: {
    id: 'textToVideoWizard',
    name: 'Текст в видео',
    description: 'Генерация видео из текстового описания',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.TextToVideo,
    requiresSubscription: true,
    cost: 50,
    supportedLanguages: ['ru', 'en'],
    tags: ['text', 'video', 'generation'],
    version: '1.0.0'
  },

  imageToVideoWizard: {
    id: 'imageToVideoWizard',
    name: 'Изображение в видео',
    description: 'Создание видео из изображения',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.ImageToVideo,
    requiresSubscription: true,
    cost: 40,
    supportedLanguages: ['ru', 'en'],
    tags: ['image', 'video', 'generation'],
    version: '1.0.0'
  },

  // ========================================
  // МАСТЕРА (WIZARDS)
  // ========================================

  selectModelWizard: {
    id: 'selectModelWizard',
    name: 'Язык аватара',
    description: 'Мастер выбора языка аватара для генерации',
    category: SceneCategory.WIZARD,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.SelectModelWizard,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['wizard', 'model', 'selection'],
    version: '1.0.0'
  },

  improvePromptWizard: {
    id: 'improvePromptWizard',
    name: 'Улучшение промпта',
    description: 'Мастер для улучшения промптов для ИИ',
    category: SceneCategory.WIZARD,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.ImprovePromptWizard,
    cost: 2,
    supportedLanguages: ['ru', 'en'],
    tags: ['prompt', 'improve', 'ai'],
    version: '1.0.0'
  },

  sizeWizard: {
    id: 'sizeWizard',
    name: 'Выбор размера',
    description: 'Мастер выбора размера для генерации',
    category: SceneCategory.WIZARD,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.SizeWizard,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['size', 'wizard', 'selection'],
    version: '1.0.0'
  },

  // ========================================
  // ИНСТРУМЕНТЫ
  // ========================================

  instagramScrapingWizard: {
    id: 'instagramScrapingWizard',
    name: 'Парсинг Instagram',
    description: 'Инструмент для парсинга контента из Instagram',
    category: SceneCategory.TOOLS,
    accessLevel: AccessLevel.ADMIN,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.InstagramScrapingWizard,
    requiresSubscription: false,
    cost: 0,
    allowedParents: ['menuScene'],
    supportedLanguages: ['ru', 'en'],
    tags: ['instagram', 'parsing', 'tool'],
    version: '1.0.0'
  },

  instagramParserWizard: {
    id: 'instagramParserWizard',
    name: 'Парсер Instagram',
    description: 'Парсер для анализа постов Instagram',
    category: SceneCategory.TOOLS,
    accessLevel: AccessLevel.ADMIN,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.InstagramParserWizard,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['instagram', 'parser', 'analysis'],
    version: '1.0.0'
  },

  // ========================================
  // АВАТАРЫ
  // ========================================

  avatarTransformScene: {
    id: 'avatarTransformScene',
    name: 'Трансформация аватара',
    description: 'Создание и трансформация цифровых аватаров',
    category: SceneCategory.AVATAR,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.AvatarTransform,
    requiresSubscription: true,
    cost: 20,
    supportedLanguages: ['ru', 'en'],
    tags: ['avatar', 'transform', 'digital'],
    version: '1.0.0'
  },

  digitalAvatarBodyWizard: {
    id: 'digitalAvatarBodyWizard',
    name: 'Цифровое тело',
    description: 'Создание цифрового тела для аватара',
    category: SceneCategory.AVATAR,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.DigitalAvatarBody,
    requiresSubscription: true,
    cost: 100,
    supportedLanguages: ['ru', 'en'],
    tags: ['avatar', 'body', 'digital'],
    version: '1.0.0'
  },

  lipSyncWizard: {
    id: 'lipSyncWizard',
    name: 'Lip Sync',
    description: 'Синхронизация губ с аудио',
    category: SceneCategory.GENERATION,
    accessLevel: AccessLevel.SUBSCRIBER,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.LipSync,
    requiresSubscription: true,
    cost: 30,
    supportedLanguages: ['ru', 'en'],
    tags: ['lip', 'sync', 'video', 'audio'],
    version: '1.0.0'
  },

  // ========================================
  // УТИЛИТЫ
  // ========================================

  balanceScene: {
    id: 'balanceScene',
    name: 'Баланс',
    description: 'Просмотр баланса и истории операций',
    category: SceneCategory.UTILITY,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.BalanceScene,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['balance', 'wallet', 'history'],
    version: '1.0.0'
  },

  inviteScene: {
    id: 'inviteScene',
    name: 'Приглашение друзей',
    description: 'Реферальная система и приглашения',
    category: SceneCategory.UTILITY,
    accessLevel: AccessLevel.PUBLIC,
    status: SceneStatus.ACTIVE,
    modeEnum: ModeEnum.Invite,
    cost: 0,
    supportedLanguages: ['ru', 'en'],
    tags: ['invite', 'referral', 'friends'],
    version: '1.0.0'
  }
}

/**
 * Получить все активные сцены
 */
export function getActiveScenes(): SceneMetadata[] {
  return Object.values(SCENE_REGISTRY).filter(
    scene => scene.status === SceneStatus.ACTIVE
  )
}

/**
 * Получить сцены по категории
 */
export function getScenesByCategory(category: SceneCategory): SceneMetadata[] {
  return Object.values(SCENE_REGISTRY).filter(
    scene => scene.category === category && scene.status === SceneStatus.ACTIVE
  )
}

/**
 * Получить сцены по уровню доступа
 */
export function getScenesByAccessLevel(
  accessLevel: AccessLevel
): SceneMetadata[] {
  return Object.values(SCENE_REGISTRY).filter(
    scene => scene.accessLevel === accessLevel && scene.status === SceneStatus.ACTIVE
  )
}

/**
 * Найти сцену по ID
 */
export function getSceneById(id: string): SceneMetadata | undefined {
  return SCENE_REGISTRY[id]
}

/**
 * Найти сцену по ModeEnum
 */
export function getSceneByModeEnum(modeEnum: ModeEnum | string): SceneMetadata | undefined {
  return Object.values(SCENE_REGISTRY).find(
    scene => scene.modeEnum === modeEnum
  )
}

/**
 * Проверить доступность сцены для пользователя
 */
export function isSceneAccessible(
  scene: SceneMetadata,
  userAccessLevel: AccessLevel,
  hasSubscription: boolean = false
): boolean {
  // Проверяем статус
  if (scene.status !== SceneStatus.ACTIVE) {
    return false
  }

  // Проверяем уровень доступа
  if (scene.accessLevel === AccessLevel.ADMIN && userAccessLevel !== AccessLevel.ADMIN) {
    return false
  }

  if (scene.accessLevel === AccessLevel.STAFF &&
      ![AccessLevel.ADMIN, AccessLevel.STAFF].includes(userAccessLevel)) {
    return false
  }

  if (scene.accessLevel === AccessLevel.SUBSCRIBER && !hasSubscription) {
    return false
  }

  return true
}

/**
 * Получить все доступные переходы для сцены
 */
export function getAllowedTransitions(sceneId: string): string[] {
  const scene = SCENE_REGISTRY[sceneId]
  if (!scene) {
    return []
  }

  const transitions = new Set<string>()

  // Добавляем разрешенных детей
  if (scene.allowedChildren) {
    scene.allowedChildren.forEach(childId => {
      if (SCENE_REGISTRY[childId]) {
        transitions.add(childId)
      }
    })
  }

  // Добавляем системные переходы
  transitions.add('menuScene') // Всегда можно вернуться в меню
  transitions.add('helpScene') // Всегда можно получить помощь

  return Array.from(transitions)
}

/**
 * Проверить разрешен ли переход из одной сцены в другую
 */
export function isTransitionAllowed(fromSceneId: string, toSceneId: string): boolean {
  const fromScene = SCENE_REGISTRY[fromSceneId]
  if (!fromScene) {
    return false
  }

  // Проверяем заблокированные переходы
  if (fromScene.blockedTransitions?.includes(toSceneId)) {
    return false
  }

  // Проверяем разрешенных детей
  if (fromScene.allowedChildren &&
      !fromScene.allowedChildren.includes(toSceneId)) {
    return false
  }

  // Проверяем что целевая сцена существует
  const toScene = SCENE_REGISTRY[toSceneId]
  if (!toScene) {
    return false
  }

  return true
}

export default SCENE_REGISTRY
