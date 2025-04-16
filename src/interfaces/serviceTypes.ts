/**
 * Типы сервисов, доступные для оплаты
 */
export enum ServiceType {
  // Генерация контента
  NeuroPhoto = 'neuro_photo',
  NeuroPhotoV2 = 'neuro_photo_v2',
  TextToImage = 'text_to_image',
  TextToSpeech = 'text_to_speech',
  ImageToVideo = 'image_to_video',
  TextToVideo = 'text_to_video',
  VoiceToText = 'voice_to_text',

  // Аватары
  DigitalAvatarBody = 'digital_avatar_body',
  DigitalAvatarBodyV2 = 'digital_avatar_body_v2',
  ChatWithAvatar = 'chat_with_avatar',
  LipSync = 'lip_sync',
  Voice = 'voice',

  // Анализ
  ImageToPrompt = 'image_to_prompt',
  ImprovePrompt = 'improve_prompt',

  // Системные операции
  TopUpBalance = 'top_up_balance',
  Subscribe = 'subscribe',
}

/**
 * Группы сервисов для удобной категоризации
 */
export const ServiceGroups = {
  Content: [
    ServiceType.NeuroPhoto,
    ServiceType.NeuroPhotoV2,
    ServiceType.TextToImage,
    ServiceType.TextToSpeech,
    ServiceType.ImageToVideo,
    ServiceType.TextToVideo,
    ServiceType.VoiceToText,
  ],

  Avatars: [
    ServiceType.DigitalAvatarBody,
    ServiceType.DigitalAvatarBodyV2,
    ServiceType.ChatWithAvatar,
    ServiceType.LipSync,
    ServiceType.Voice,
  ],

  Analysis: [ServiceType.ImageToPrompt, ServiceType.ImprovePrompt],

  System: [ServiceType.TopUpBalance, ServiceType.Subscribe],
} as const
