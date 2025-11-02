/**
 * ЦЕНТРАЛИЗОВАННЫЕ КОНСТАНТЫ ДЛЯ ВСЕХ SCENE IDs
 *
 * ИСПОЛЬЗУЙТЕ ЭТИ КОНСТАНТЫ ВМЕСТО СТРОК ВЕЗДЕ В КОДЕ!
 *
 * Проблема: раньше scene IDs были разбросаны по коду как строки
 * Решение: единый файл с константами для всех scene IDs
 */

// === МЕНЮ И НАВИГАЦИЯ ===
export const SCENES = {
  // Базовые сцены
  START_SCENE: 'start_scene',
  MAIN_MENU: 'main_menu',
  HELP_SCENE: 'helpScene',
  INVITE_SCENE: 'invite_scene',
  BALANCE_SCENE: 'balanceScene',

  // Платежи
  PAYMENT_SCENE: 'paymentScene',
  RUBLE_PAYMENT_SCENE: 'rublePaymentScene',
  STAR_PAYMENT_SCENE: 'starPaymentScene',

  // Подписки
  SUBSCRIPTION_SCENE: 'subscriptionScene',
  SUBSCRIPTION_CHECK_SCENE: 'subscription_check_scene',
  CHECK_BALANCE_SCENE: 'check_balance_scene',

  // Генерация изображений
  NEURO_PHOTO: 'neuro_photo',
  NEURO_PHOTO_V2: 'neuro_photo_v2',
  TEXT_TO_IMAGE: 'text_to_image',
  IMAGE_TO_PROMPT: 'image_to_prompt',
  IMAGE_UPSCALER: 'image_upscaler',
  IMPROVE_PROMPT_WIZARD: 'improve_prompt_wizard',
  SIZE_WIZARD: 'size_wizard',

  // Генерация видео
  TEXT_TO_VIDEO: 'text_to_video',
  IMAGE_TO_VIDEO: 'image_to_video',

  // AI обработка
  AI_PHOTOSHOP_SCENE: 'ai_photoshop_scene',
  FACE_SWAP_WIZARD: 'faceSwapWizard',
  MORPHING_WIZARD: 'morphing_wizard',
  VIDEO_TRANSCRIPTION_WIZARD: 'video_transcription',

  // Аватары
  AVATAR_TRANSFORM_SCENE: 'avatarTransformScene',
  AVATAR_BRAIN_WIZARD: 'avatar',
  CHAT_WITH_AVATAR_WIZARD: 'chat_with_avatar',
  DIGITAL_AVATAR_BODY_WIZARD: 'digital_avatar_body',
  DIGITAL_AVATAR_BODY_V2_WIZARD: 'digital_avatar_body_2',

  // Голос
  VOICE_WIZARD: 'voice',
  TEXT_TO_SPEECH_WIZARD: 'text_to_speech',
  LIP_SYNC_WIZARD: 'lip_sync',
  VEED_FABRIC_WIZARD: 'veed_fabric_lipsync',

  // Модели
  SELECT_MODEL_WIZARD: 'select_model',

  // AI Рилс
  AI_REELS_WIZARD: 'ai_reels_wizard',
  AI_REELS_ENTRY_WIZARD: 'ai_reels_entry',
  AI_REELS_RENDER_WIZARD: 'ai_reels_render_wizard',

  // Instagram
  INSTAGRAM_PARSER_SCENE: 'instagram_parser_scene',

  // Служебные
  TRAIN_FLUX_MODEL_WIZARD: 'trainFluxModelWizard',
  UPLOAD_TRAIN_FLUX_MODEL_SCENE: 'uploadTrainFluxModelScene',
  UPLOAD_VIDEO_SCENE: 'video_in_url',
  AUTO_FIXER_CONFIG_SCENE: 'autofixer_config',
  GET_RU_BILL_WIZARD: 'getRuBillWizard',
  LEVEL_QUEST_WIZARD: 'levelQuestWizard',
  CREATE_USER_SCENE: 'create_user_scene',
  NEURO_CODER_SCENE: 'neuroCoderScene',
  INSTAGRAM_SCRAPING_WIZARD: 'instagram_scraping_wizard',
} as const

// Экспортируем все ID для удобства
export type SceneId = typeof SCENES[keyof typeof SCENES]

// Делаем константы доступными напрямую
export const {
  START_SCENE,
  MAIN_MENU,
  HELP_SCENE,
  INVITE_SCENE,
  BALANCE_SCENE,
  PAYMENT_SCENE,
  RUBLE_PAYMENT_SCENE,
  STAR_PAYMENT_SCENE,
  SUBSCRIPTION_SCENE,
  SUBSCRIPTION_CHECK_SCENE,
  CHECK_BALANCE_SCENE,
  NEURO_PHOTO,
  NEURO_PHOTO_V2,
  TEXT_TO_IMAGE,
  IMAGE_TO_PROMPT,
  IMAGE_UPSCALER,
  IMPROVE_PROMPT_WIZARD,
  SIZE_WIZARD,
  TEXT_TO_VIDEO,
  IMAGE_TO_VIDEO,
  AI_PHOTOSHOP_SCENE,
  FACE_SWAP_WIZARD,
  MORPHING_WIZARD,
  VIDEO_TRANSCRIPTION_WIZARD,
  AVATAR_TRANSFORM_SCENE,
  AVATAR_BRAIN_WIZARD,
  CHAT_WITH_AVATAR_WIZARD,
  DIGITAL_AVATAR_BODY_WIZARD,
  DIGITAL_AVATAR_BODY_V2_WIZARD,
  VOICE_WIZARD,
  TEXT_TO_SPEECH_WIZARD,
  LIP_SYNC_WIZARD,
  VEED_FABRIC_WIZARD,
  SELECT_MODEL_WIZARD,
  AI_REELS_WIZARD,
  AI_REELS_ENTRY_WIZARD,
  AI_REELS_RENDER_WIZARD,
  INSTAGRAM_PARSER_SCENE,
  TRAIN_FLUX_MODEL_WIZARD,
  UPLOAD_TRAIN_FLUX_MODEL_SCENE,
  UPLOAD_VIDEO_SCENE,
  AUTO_FIXER_CONFIG_SCENE,
  GET_RU_BILL_WIZARD,
  LEVEL_QUEST_WIZARD,
  CREATE_USER_SCENE,
  NEURO_CODER_SCENE,
  INSTAGRAM_SCRAPING_WIZARD,
} = SCENES
