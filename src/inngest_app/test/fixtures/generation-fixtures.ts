/**
 * GENERATION FUNCTIONS FIXTURES
 *
 * Тестовые данные для generation функций:
 * - neuroImageGeneration
 */

export const neuroImageGenerationData = {
  valid_basic: {
    telegram_id: '123456789',
    prompt: 'Красивый закат над морем',
    model: 'dalle-3',
    aspect_ratio: '16:9',
    quality: 'high',
    style: 'realistic',
  },

  valid_advanced: {
    telegram_id: '123456789',
    prompt: 'Футуристический город с неоновыми огнями',
    model: 'midjourney',
    aspect_ratio: '1:1',
    quality: 'ultra',
    style: 'artistic',
    negative_prompt: 'размыто, низкое качество',
    steps: 50,
    cfg_scale: 7.5,
    seed: 12345,
  },

  valid_with_base_image: {
    telegram_id: '123456789',
    prompt: 'Превратить это в картину в стиле импрессионизма',
    base_image: 'https://example.com/base.jpg',
    model: 'dalle-3',
    strength: 0.8,
  },

  invalid_prompt: {
    telegram_id: '123456789',
    prompt: '',
    model: 'dalle-3',
  },
}

export const generationExpectedResults = {
  success_generation: {
    success: true,
    images: [
      'https://example.com/generated1.jpg',
      'https://example.com/generated2.jpg',
    ],
    prompt: 'Красивый закат над морем',
    model: 'dalle-3',
    generation_time: 15.5,
  },

  success_with_base: {
    success: true,
    images: ['https://example.com/generated_base.jpg'],
    prompt: 'Превратить это в картину',
    model: 'dalle-3',
  },

  error_invalid_prompt: {
    success: false,
    error: 'Prompt is required',
  },

  error_model_unavailable: {
    success: false,
    error: 'Model unavailable',
  },
}

export const generationErrors = {
  invalid_prompt: {
    code: 'INVALID_PROMPT',
    message: 'Недопустимый промпт',
  },

  model_unavailable: {
    code: 'MODEL_UNAVAILABLE',
    message: 'Модель недоступна',
  },

  content_filtered: {
    code: 'CONTENT_FILTERED',
    message: 'Контент заблокирован фильтром',
  },

  generation_failed: {
    code: 'GENERATION_FAILED',
    message: 'Ошибка генерации изображения',
  },

  invalid_base_image: {
    code: 'INVALID_BASE_IMAGE',
    message: 'Недействительное базовое изображение',
  },
}
