/**
 * ЕДИНАЯ СИСТЕМА МАППИНГА СЕРВИСОВ
 *
 * Этот файл содержит единую логику для:
 * 1. Маппинга технических деталей в пользовательские сервисы
 * 2. Получения эмодзи для сервисов
 * 3. Категоризации сервисов
 *
 * ПРИНЦИП: Показываем пользователю ПОНЯТНЫЕ сервисы, а не технические детали
 */

/**
 * Пользовательские сервисы первого уровня
 * Это то, что понимает пользователь
 */
export enum UserService {
  // 🖼️ ИЗОБРАЖЕНИЯ
  NeuroPhoto = 'neuro_photo',
  ImageToPrompt = 'image_to_prompt',

  // 🎬 ВИДЕО
  TextToVideo = 'text_to_video',
  ImageToVideo = 'image_to_video',

  // 🎵 АУДИО
  TextToSpeech = 'text_to_speech',
  Voice = 'voice',
  VoiceToText = 'voice_to_text',
  LipSync = 'lip_sync',

  // 🎭 АВАТАРЫ
  DigitalAvatarBody = 'digital_avatar_body',

  // 🎨 ДОПОЛНИТЕЛЬНЫЕ
  TextToImage = 'text_to_image',

  // ⚙️ СИСТЕМНЫЕ
  PaymentOperation = 'payment_operation',
  Other = 'other',
  Unknown = 'unknown',
}

/**
 * Маппинг эмодзи для пользовательских сервисов
 */
export const SERVICE_EMOJI_MAP: Record<UserService, string> = {
  // 🖼️ ИЗОБРАЖЕНИЯ
  [UserService.NeuroPhoto]: '🖼️',
  [UserService.ImageToPrompt]: '📝',

  // 🎬 ВИДЕО
  [UserService.TextToVideo]: '📹',
  [UserService.ImageToVideo]: '🎬',

  // 🎵 АУДИО
  [UserService.TextToSpeech]: '🗣️',
  [UserService.Voice]: '🎤',
  [UserService.VoiceToText]: '🎙️',
  [UserService.LipSync]: '💋',

  // 🎭 АВАТАРЫ
  [UserService.DigitalAvatarBody]: '🎭',

  // 🎨 ДОПОЛНИТЕЛЬНЫЕ
  [UserService.TextToImage]: '🎨',

  // ⚙️ СИСТЕМНЫЕ
  [UserService.PaymentOperation]: '💳',
  [UserService.Other]: '❓',
  [UserService.Unknown]: '❓',
}

/**
 * Получает отображаемое имя сервиса
 * Маппит технические детали в пользовательские сервисы первого уровня
 */
export function getServiceDisplayName(
  serviceType: string | null,
  description: string | null
): UserService {
  // Сначала проверяем описание для промо-операций и системных операций
  if (description) {
    const desc = description.toLowerCase()

    // ПРОМО-ОПЕРАЦИИ → payment_operation (системный сервис)
    if (desc.includes('promo bonus') || desc.includes('🎁')) {
      return UserService.PaymentOperation
    }

    // АВТОАКТИВАЦИЯ ПОДПИСКИ → payment_operation (системный сервис)
    if (
      desc.includes('auto-activated subscription') ||
      desc.includes('🎁 auto-activated')
    ) {
      return UserService.PaymentOperation
    }

    // ВСЕ ВИДЕО ГЕНЕРАЦИИ → text_to_video (пользовательский сервис)
    if (desc.includes('video generation')) {
      return UserService.TextToVideo
    }

    // Тренировка моделей → digital_avatar_body (пользовательский сервис)
    if (
      desc.includes('тренировки модели') ||
      desc.includes('model training') ||
      desc.includes('neuro_train_lora_debit')
    ) {
      return UserService.DigitalAvatarBody
    }

    // Анализ изображений → image_to_prompt (пользовательский сервис)
    if (
      desc.includes('image to prompt') ||
      desc.includes('анализ изображения')
    ) {
      return UserService.ImageToPrompt
    }

    // Генерация изображений → neuro_photo (пользовательский сервис)
    if (desc.includes('generating') && desc.includes('image')) {
      return UserService.NeuroPhoto
    }

    // Платежные операции → payment_operation (системный сервис)
    if (desc === 'payment operation') {
      return UserService.PaymentOperation
    }
  }

  // Если есть service_type, проверяем является ли он пользовательским сервисом
  if (
    serviceType &&
    Object.values(UserService).includes(serviceType as UserService)
  ) {
    return serviceType as UserService
  }

  // Проверяем service_type для системных операций
  if (serviceType) {
    const normalizedServiceType = serviceType.toLowerCase()

    // Системные сцены и операции
    if (
      normalizedServiceType === 'start_scene' ||
      normalizedServiceType === 'main_menu' ||
      normalizedServiceType === 'balance_scene' ||
      normalizedServiceType === 'payment_scene' ||
      normalizedServiceType === 'subscription_scene' ||
      normalizedServiceType === 'top_up_balance' ||
      normalizedServiceType === 'subscribe'
    ) {
      return UserService.PaymentOperation
    }

    // Обработка unknown как отдельного случая
    if (normalizedServiceType === 'unknown') {
      return UserService.Unknown
    }
  }

  return UserService.Other
}

/**
 * Получает эмодзи для сервиса
 */
export function getServiceEmoji(serviceName: string): string {
  // 🛡️ QA FIX: Handle null, undefined, and empty strings gracefully
  if (!serviceName || typeof serviceName !== 'string') {
    return SERVICE_EMOJI_MAP[UserService.Unknown]
  }

  // Проверяем является ли serviceName пользовательским сервисом
  if (Object.values(UserService).includes(serviceName as UserService)) {
    return SERVICE_EMOJI_MAP[serviceName as UserService]
  }

  // Если не является, пытаемся определить по названию
  const normalizedName = serviceName.toLowerCase()

  // Маппинг старых/технических названий в пользовательские сервисы
  const legacyMapping: Record<string, UserService> = {
    // Старые видео сервисы
    kling_video: UserService.TextToVideo,
    haiper_video: UserService.TextToVideo,
    minimax_video: UserService.TextToVideo,
    video_kling_pro: UserService.TextToVideo,
    video_kling_v2: UserService.TextToVideo,
    video_haiper: UserService.TextToVideo,
    video_minimax: UserService.TextToVideo,
    video_ray: UserService.TextToVideo,
    video_standard: UserService.TextToVideo,
    video_wan: UserService.TextToVideo,
    neurovideo: UserService.TextToVideo,
    video_generation: UserService.TextToVideo,
    generate_video: UserService.TextToVideo,
    'text-to-video': UserService.TextToVideo,
    text2video: UserService.TextToVideo,
    
    // Image to video варианты
    'image-to-video': UserService.ImageToVideo,
    image2video: UserService.ImageToVideo,
    img2video: UserService.ImageToVideo,

    // Старые сервисы изображений
    image_generation: UserService.NeuroPhoto,
    image_analysis: UserService.ImageToPrompt,
    generate_image: UserService.NeuroPhoto,
    'text-to-image': UserService.TextToImage,
    text2image: UserService.TextToImage,
    'image-to-prompt': UserService.ImageToPrompt,
    image2prompt: UserService.ImageToPrompt,
    analyze_image: UserService.ImageToPrompt,

    // Старые сервисы аватаров
    model_training: UserService.DigitalAvatarBody,
    train_model: UserService.DigitalAvatarBody,
    neuro_train_lora_debit: UserService.DigitalAvatarBody,
    lora_training: UserService.DigitalAvatarBody,
    avatar_training: UserService.DigitalAvatarBody,
    digital_avatar: UserService.DigitalAvatarBody,
    
    // Аудио сервисы
    'text-to-speech': UserService.TextToSpeech,
    text2speech: UserService.TextToSpeech,
    tts: UserService.TextToSpeech,
    'voice-to-text': UserService.VoiceToText,
    voice2text: UserService.VoiceToText,
    stt: UserService.VoiceToText,
    'lip-sync': UserService.LipSync,
    lipsync: UserService.LipSync,
    lip_synchronization: UserService.LipSync,

    // Системные операции
    system: UserService.PaymentOperation,
    prompts: UserService.Other,
    start_scene: UserService.PaymentOperation,
    main_menu: UserService.PaymentOperation,
    balance_scene: UserService.PaymentOperation,
    payment_scene: UserService.PaymentOperation,
    subscription_scene: UserService.PaymentOperation,
    top_up_balance: UserService.PaymentOperation,
    subscribe: UserService.PaymentOperation,
    promo: UserService.PaymentOperation,
    bonus: UserService.PaymentOperation,
    refund: UserService.PaymentOperation,
    unknown: UserService.Unknown,
    null: UserService.Unknown,
    undefined: UserService.Unknown,
    '': UserService.Unknown,
  }

  const mappedService = legacyMapping[normalizedName]
  if (mappedService) {
    return SERVICE_EMOJI_MAP[mappedService]
  }

  return SERVICE_EMOJI_MAP[UserService.Unknown]
}

/**
 * Получает категорию сервиса
 */
export function getServiceCategory(
  service: UserService
): 'image' | 'video' | 'audio' | 'avatar' | 'system' {
  switch (service) {
    case UserService.NeuroPhoto:
    case UserService.ImageToPrompt:
    case UserService.TextToImage:
      return 'image'

    case UserService.TextToVideo:
    case UserService.ImageToVideo:
      return 'video'

    case UserService.TextToSpeech:
    case UserService.Voice:
    case UserService.VoiceToText:
    case UserService.LipSync:
      return 'audio'

    case UserService.DigitalAvatarBody:
      return 'avatar'

    default:
      return 'system'
  }
}

/**
 * Получает человекочитаемое название сервиса с учетом контекста операции
 */
export function getServiceDisplayTitle(
  service: UserService,
  description?: string,
  isRu = true
): string {
  // Если это платежная операция, пытаемся определить более точное название
  if (service === UserService.PaymentOperation && description) {
    const desc = description.toLowerCase()

    if (desc.includes('promo bonus') || desc.includes('🎁 promo bonus')) {
      return isRu ? 'Промо-бонус' : 'Promo Bonus'
    }

    if (
      desc.includes('auto-activated subscription') ||
      desc.includes('🎁 auto-activated')
    ) {
      return isRu ? 'Активация подписки' : 'Subscription Activation'
    }

    if (desc.includes('subscription') || desc.includes('подписка')) {
      return isRu ? 'Подписка' : 'Subscription'
    }

    if (desc.includes('top-up') || desc.includes('пополнение')) {
      return isRu ? 'Пополнение баланса' : 'Balance Top-up'
    }
  }

  const titlesRu: Record<UserService, string> = {
    // 🖼️ ИЗОБРАЖЕНИЯ
    [UserService.NeuroPhoto]: 'Нейрофото',
    [UserService.ImageToPrompt]: 'Анализ изображений',

    // 🎬 ВИДЕО
    [UserService.TextToVideo]: 'Генерация видео',
    [UserService.ImageToVideo]: 'Изображение в видео',

    // 🎵 АУДИО
    [UserService.TextToSpeech]: 'Озвучка текста',
    [UserService.Voice]: 'Голосовой аватар',
    [UserService.VoiceToText]: 'Распознавание речи',
    [UserService.LipSync]: 'Синхронизация губ',

    // 🎭 АВАТАРЫ
    [UserService.DigitalAvatarBody]: 'Цифровой аватар',

    // 🎨 ДОПОЛНИТЕЛЬНЫЕ
    [UserService.TextToImage]: 'Генерация изображений',

    // ⚙️ СИСТЕМНЫЕ
    [UserService.PaymentOperation]: 'Системная операция',
    [UserService.Other]: 'Другое',
    [UserService.Unknown]: 'Неизвестно',
  }

  const titlesEn: Record<UserService, string> = {
    // 🖼️ IMAGES
    [UserService.NeuroPhoto]: 'NeuroPhoto',
    [UserService.ImageToPrompt]: 'Image Analysis',

    // 🎬 VIDEO
    [UserService.TextToVideo]: 'Video Generation',
    [UserService.ImageToVideo]: 'Image to Video',

    // 🎵 AUDIO
    [UserService.TextToSpeech]: 'Text to Speech',
    [UserService.Voice]: 'Voice Avatar',
    [UserService.VoiceToText]: 'Speech Recognition',
    [UserService.LipSync]: 'Lip Sync',

    // 🎭 AVATARS
    [UserService.DigitalAvatarBody]: 'Digital Avatar',

    // 🎨 ADDITIONAL
    [UserService.TextToImage]: 'Image Generation',

    // ⚙️ SYSTEM
    [UserService.PaymentOperation]: 'System Operation',
    [UserService.Other]: 'Other',
    [UserService.Unknown]: 'Unknown',
  }

  const titles = isRu ? titlesRu : titlesEn
  return titles[service] || titles[UserService.Unknown]
}
