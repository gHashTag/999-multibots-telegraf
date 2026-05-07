/**
 * EXISTING FUNCTIONS FIXTURES
 *
 * Тестовые данные для existing функций:
 * - generateAIReelsFunction
 * - generateAdvancedLoopingVideoFunction
 * - generateModelTrainingFunction
 */

export const generateAIReelsData = {
  valid_basic: {
    telegram_id: '123456789',
    prompt: 'Красивая природа',
    style: 'realistic',
    duration: 30,
    format: 'mp4',
  },

  valid_custom: {
    telegram_id: '123456789',
    prompt: 'Футуристический город',
    style: 'cinematic',
    duration: 60,
    format: 'mp4',
    resolution: '1080p',
    fps: 30,
  },

  invalid_prompt: {
    telegram_id: '123456789',
    prompt: '',
    style: 'realistic',
    duration: 30,
  },
}

export const generateAdvancedLoopingVideoData = {
  valid_simple: {
    telegram_id: '123456789',
    base_video_url: 'https://example.com/video.mp4',
    loop_duration: 10,
    quality: 'high',
  },

  valid_advanced: {
    telegram_id: '123456789',
    base_video_url: 'https://example.com/video.mp4',
    loop_duration: 30,
    quality: 'ultra',
    effects: ['blur', 'fade'],
    transition_duration: 2,
    output_format: 'mp4',
    fps: 60,
  },

  invalid_video_url: {
    telegram_id: '123456789',
    base_video_url: '',
    loop_duration: 10,
  },
}

export const generateModelTrainingData = {
  valid_basic: {
    telegram_id: '123456789',
    model_type: 'style_transfer',
    training_data_url: 'https://example.com/dataset.zip',
    epochs: 20,
  },

  valid_custom: {
    telegram_id: '123456789',
    model_type: 'custom_model',
    training_data_url: 'https://example.com/dataset.zip',
    epochs: 100,
    batch_size: 8,
    learning_rate: 0.001,
    validation_split: 0.2,
    output_model_name: 'my_custom_model',
  },

  invalid_model_type: {
    telegram_id: '123456789',
    model_type: '',
    training_data_url: 'https://example.com/dataset.zip',
    epochs: 20,
  },
}

export const existingExpectedResults = {
  success_ai_reels: {
    success: true,
    video_url: 'https://example.com/reels.mp4',
    duration: 30,
    format: 'mp4',
    generation_time: 45.5,
  },

  success_looping_video: {
    success: true,
    looped_video_url: 'https://example.com/looped.mp4',
    loop_duration: 10,
    quality: 'high',
    file_size: '15MB',
  },

  success_model_training: {
    success: true,
    model_id: 'model_123',
    status: 'training_queued',
    estimated_time: 7200,
    epochs: 20,
  },

  error_invalid_input: {
    success: false,
    error: 'Invalid input parameters',
  },
}

export const existingErrors = {
  invalid_prompt: {
    code: 'INVALID_PROMPT',
    message: 'Недопустимый промпт',
  },

  video_not_found: {
    code: 'VIDEO_NOT_FOUND',
    message: 'Видео не найдено',
  },

  training_failed: {
    code: 'TRAINING_FAILED',
    message: 'Ошибка обучения модели',
  },

  invalid_model_type: {
    code: 'INVALID_MODEL_TYPE',
    message: 'Неверный тип модели',
  },

  generation_timeout: {
    code: 'GENERATION_TIMEOUT',
    message: 'Превышено время генерации',
  },

  insufficient_quota: {
    code: 'INSUFFICIENT_QUOTA',
    message: 'Недостаточно квоты',
  },
}
