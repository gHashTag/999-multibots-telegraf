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

  // Modes that reached the ledger after this enum was written. Measured on the
  // live ledger 2026-09-09: without them 949 of the owner's 3163 expense rows
  // displayed as "other" and 353 as "unknown" although metadata and the
  // description named the service.
  AiPhotoshop = 'ai_photoshop_scene',
  FluxKontext = 'flux_kontext',
  ImageUpscaler = 'image_upscaler',
  FaceSwap = 'face_swap',
  AvatarTransform = 'avatar_transform',
  AiReels = 'ai_reels',
  VideoTranscription = 'video_transcription',
  MusicGeneration = 'music_generation',
  AiCover = 'ai_cover',
  ChatWithAvatar = 'chat_with_avatar',
  InstagramParser = 'instagram_parser',

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

  [UserService.AiPhotoshop]: '🪄',
  [UserService.FluxKontext]: '🖌️',
  [UserService.ImageUpscaler]: '🔍',
  [UserService.FaceSwap]: '🔄',
  [UserService.AvatarTransform]: '✨',
  [UserService.AiReels]: '🎞️',
  [UserService.VideoTranscription]: '📃',
  [UserService.MusicGeneration]: '🎵',
  [UserService.AiCover]: '🎼',
  [UserService.ChatWithAvatar]: '💬',
  [UserService.InstagramParser]: '📊',

  // ⚙️ СИСТЕМНЫЕ
  [UserService.PaymentOperation]: '💳',
  [UserService.Other]: '❓',
  [UserService.Unknown]: '❓',
}

/**
 * Technical / legacy spellings of a service, keyed lowercase. Shared by the
 * emoji, the title and the display-name resolver so the three cannot disagree.
 */
export const LEGACY_SERVICE_ALIASES: Record<string, UserService> = {
  // legacy video modes
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

  // image-to-video spellings
  'image-to-video': UserService.ImageToVideo,
  image2video: UserService.ImageToVideo,
  img2video: UserService.ImageToVideo,

  // legacy image modes
  image_generation: UserService.NeuroPhoto,
  image_analysis: UserService.ImageToPrompt,
  generate_image: UserService.NeuroPhoto,
  'text-to-image': UserService.TextToImage,
  text2image: UserService.TextToImage,
  'image-to-prompt': UserService.ImageToPrompt,
  image2prompt: UserService.ImageToPrompt,
  analyze_image: UserService.ImageToPrompt,

  // legacy avatar modes
  model_training: UserService.DigitalAvatarBody,
  train_model: UserService.DigitalAvatarBody,
  neuro_train_lora_debit: UserService.DigitalAvatarBody,
  lora_training: UserService.DigitalAvatarBody,
  avatar_training: UserService.DigitalAvatarBody,
  digital_avatar: UserService.DigitalAvatarBody,

  // audio modes
  'text-to-speech': UserService.TextToSpeech,
  text2speech: UserService.TextToSpeech,
  tts: UserService.TextToSpeech,
  'voice-to-text': UserService.VoiceToText,
  voice2text: UserService.VoiceToText,
  stt: UserService.VoiceToText,
  'lip-sync': UserService.LipSync,
  lipsync: UserService.LipSync,
  lip_synchronization: UserService.LipSync,

  // system operations
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

  // Session modes (ModeEnum values) the ledger carries under other spellings.
  ai_photoshop: UserService.AiPhotoshop,
  faceswapwizard: UserService.FaceSwap,
  avatartransform: UserService.AvatarTransform,
  ai_reels_render: UserService.AiReels,
  ai_reels_template_1: UserService.AiReels,
  ai_reels_wizard: UserService.AiReels,
  ai_reels_entry: UserService.AiReels,
  hedra_render_wizard: UserService.AiReels,
  heygen_render_wizard: UserService.AiReels,
  fal_render_wizard: UserService.AiReels,
  veed_fabric_lipsync: UserService.LipSync,
  instagram_parser_scene: UserService.InstagramParser,
  instagram_parser_wizard: UserService.InstagramParser,
  instagram_scraping_wizard: UserService.InstagramParser,
  music_generation_wizard: UserService.MusicGeneration,
  voice_training_wizard: UserService.Voice,
  ai_cover_wizard: UserService.AiCover,
}

/**
 * What processBalanceOperation writes in front of the session mode in the
 * description of every expense row: "Payment for service: ai_photoshop_scene".
 *
 * WHY THE DESCRIPTION CARRIES IT. A database trigger on payments_v2 rewrites
 * service_type into a short whitelist (measured 2026-09-09: ai_photoshop_scene,
 * face_swap, avatar_transform, chat_with_avatar all became 'other';
 * flux_kontext and image_upscaler became 'neuro_photo'; ai_reels became
 * 'text_to_video'). The trigger leaves description alone, so this is the one
 * field where the real service survives the write.
 */
export const SERVICE_DESCRIPTION_PREFIX = 'Payment for service: '

/**
 * The service named in a description written with SERVICE_DESCRIPTION_PREFIX,
 * or null when the description is something else or names nothing we know.
 */
export function serviceFromDescription(
  description: string | null | undefined
): UserService | null {
  if (!description || !description.startsWith(SERVICE_DESCRIPTION_PREFIX)) {
    return null
  }
  const mode = description.slice(SERVICE_DESCRIPTION_PREFIX.length).trim()
  const resolved = resolveKnownService(mode)
  return resolved === UserService.Unknown || resolved === UserService.Other
    ? null
    : resolved
}

/** An exact enum value or a known alias; Unknown for anything else. */
function resolveKnownService(name: string | null | undefined): UserService {
  if (!name || typeof name !== 'string') return UserService.Unknown
  if (Object.values(UserService).includes(name as UserService)) {
    return name as UserService
  }
  return LEGACY_SERVICE_ALIASES[name.toLowerCase()] ?? UserService.Unknown
}

/**
 * One answer to "which service was this row for", in this order:
 *   1. the description written by the app (trigger-proof, see above);
 *   2. the service_type column, exact or via a known alias;
 *   3. Unknown.
 */
export function resolveUserService(
  serviceType: string | null | undefined,
  description?: string | null
): UserService {
  return serviceFromDescription(description) ?? resolveKnownService(serviceType)
}

/**
 * Получает отображаемое имя сервиса
 * Маппит технические детали в пользовательские сервисы первого уровня
 */
export function getServiceDisplayName(
  serviceType: string | null,
  description: string | null
): UserService {
  // The app's own label beats every heuristic below.
  const named = serviceFromDescription(description)
  if (named) return named

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
  const aliased = serviceType
    ? LEGACY_SERVICE_ALIASES[serviceType.toLowerCase()]
    : undefined
  if (
    aliased &&
    aliased !== UserService.Other &&
    aliased !== UserService.Unknown
  ) {
    return aliased
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
export function getServiceEmoji(
  serviceName: string,
  description?: string | null
): string {
  const named = serviceFromDescription(description)
  if (named) return SERVICE_EMOJI_MAP[named]
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

  const mappedService = LEGACY_SERVICE_ALIASES[normalizedName]
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
    case UserService.AiPhotoshop:
    case UserService.FluxKontext:
    case UserService.ImageUpscaler:
    case UserService.FaceSwap:
    case UserService.AvatarTransform:
    case UserService.InstagramParser:
      return 'image'

    case UserService.TextToVideo:
    case UserService.ImageToVideo:
    case UserService.AiReels:
    case UserService.VideoTranscription:
      return 'video'

    case UserService.TextToSpeech:
    case UserService.Voice:
    case UserService.VoiceToText:
    case UserService.LipSync:
    case UserService.MusicGeneration:
    case UserService.AiCover:
      return 'audio'

    case UserService.DigitalAvatarBody:
    case UserService.ChatWithAvatar:
      return 'avatar'

    default:
      return 'system'
  }
}

/**
 * Получает человекочитаемое название сервиса с учетом контекста операции
 */
export function getServiceDisplayTitle(
  service: UserService | string,
  description?: string | null,
  isRu = true
): string {
  const resolved = resolveUserService(service, description)
  // Если это платежная операция, пытаемся определить более точное название
  if (resolved === UserService.PaymentOperation && description) {
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

    [UserService.AiPhotoshop]: 'AI Photoshop',
    [UserService.FluxKontext]: 'Редактирование фото (Flux Kontext)',
    [UserService.ImageUpscaler]: 'Улучшение качества фото',
    [UserService.FaceSwap]: 'Замена лица',
    [UserService.AvatarTransform]: 'Преображение аватара',
    [UserService.AiReels]: 'AI Reels',
    [UserService.VideoTranscription]: 'Транскрибация видео',
    [UserService.MusicGeneration]: 'Генерация музыки',
    [UserService.AiCover]: 'AI-кавер',
    [UserService.ChatWithAvatar]: 'Чат с аватаром',
    [UserService.InstagramParser]: 'Парсер Instagram',

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

    [UserService.AiPhotoshop]: 'AI Photoshop',
    [UserService.FluxKontext]: 'Photo Editing (Flux Kontext)',
    [UserService.ImageUpscaler]: 'Image Upscaling',
    [UserService.FaceSwap]: 'Face Swap',
    [UserService.AvatarTransform]: 'Avatar Transform',
    [UserService.AiReels]: 'AI Reels',
    [UserService.VideoTranscription]: 'Video Transcription',
    [UserService.MusicGeneration]: 'Music Generation',
    [UserService.AiCover]: 'AI Cover',
    [UserService.ChatWithAvatar]: 'Chat with Avatar',
    [UserService.InstagramParser]: 'Instagram Parser',

    // ⚙️ SYSTEM
    [UserService.PaymentOperation]: 'System Operation',
    [UserService.Other]: 'Other',
    [UserService.Unknown]: 'Unknown',
  }

  const titles = isRu ? titlesRu : titlesEn
  return titles[resolved] || titles[UserService.Unknown]
}
