/**
 * RENDER FUNCTIONS FIXTURES
 *
 * Тестовые данные для render функций:
 * - render
 * - renderAvatarVideo
 * - renderRiddle
 */

export const renderData = {
  valid_simple: {
    telegram_id: '123456789',
    template_id: 'template_123',
    data: {
      text: 'Hello World',
      color: '#FF0000',
    },
    output_format: 'mp4',
    duration: 30,
  },

  valid_avatar_video: {
    telegram_id: '123456789',
    avatar_id: 'avatar_456',
    script: 'Добро пожаловать в наш сервис!',
    voice_id: 'voice_789',
    background_image: 'https://example.com/bg.jpg',
    quality: 'high',
  },

  valid_riddle: {
    telegram_id: '123456789',
    riddle_text: 'Что это?',
    answer: 'Это загадка!',
    theme: 'animals',
    style: 'funny',
    duration: 15,
  },

  invalid_missing_data: {
    telegram_id: '123456789',
    template_id: '',
  },
}

export const renderExpectedResults = {
  success_render: {
    success: true,
    job_id: 'job_render_123',
    status: 'queued',
    estimated_time: 120,
  },

  success_avatar: {
    success: true,
    job_id: 'job_avatar_456',
    status: 'processing',
    video_url: 'https://example.com/avatar.mp4',
  },

  error_invalid_template: {
    success: false,
    error: 'Template not found',
  },
}

export const renderErrors = {
  template_not_found: {
    code: 'TEMPLATE_NOT_FOUND',
    message: 'Шаблон не найден',
  },

  avatar_not_found: {
    code: 'AVATAR_NOT_FOUND',
    message: 'Аватар не найден',
  },

  invalid_script: {
    code: 'INVALID_SCRIPT',
    message: 'Недопустимый текст для озвучивания',
  },

  render_failed: {
    code: 'RENDER_FAILED',
    message: 'Ошибка рендера',
  },
}
