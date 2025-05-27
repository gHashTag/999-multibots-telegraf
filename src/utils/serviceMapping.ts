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
  // Если есть service_type, проверяем является ли он пользовательским сервисом
  if (
    serviceType &&
    Object.values(UserService).includes(serviceType as UserService)
  ) {
    return serviceType as UserService
  }

  // Если нет service_type или он не является пользовательским, определяем по description
  if (description) {
    const desc = description.toLowerCase()

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

  return UserService.Other
}

/**
 * Получает эмодзи для сервиса
 */
export function getServiceEmoji(serviceName: string): string {
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
    neurobase: UserService.TextToVideo,

    // Старые сервисы изображений
    image_generation: UserService.NeuroPhoto,
    image_analysis: UserService.ImageToPrompt,

    // Старые сервисы аватаров
    model_training: UserService.DigitalAvatarBody,

    // Системные
    system: UserService.Other,
    prompts: UserService.Other,
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
 * Получает человекочитаемое название сервиса
 */
export function getServiceDisplayTitle(service: UserService): string {
  const titles: Record<UserService, string> = {
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
    [UserService.PaymentOperation]: 'Платежная операция',
    [UserService.Other]: 'Другое',
    [UserService.Unknown]: 'Неизвестно',
  }

  return titles[service] || titles[UserService.Unknown]
}
