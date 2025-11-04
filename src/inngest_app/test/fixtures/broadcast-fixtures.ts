/**
 * BROADCAST FUNCTIONS FIXTURES
 *
 * Тестовые данные для broadcast функций:
 * - broadcastMessage
 */

export const broadcastMessageData = {
  valid_text_only: {
    telegram_id: '123456789',
    text_ru: 'Привет! Новая функция уже доступна',
    text_en: 'Hello! New feature is now available',
    content_type: 'text',
    bot_name: 'ai_koshey_bot',
    sender_telegram_id: '987654321',
    test_mode: false,
  },

  valid_with_image: {
    telegram_id: '123456789',
    text_ru: 'Посмотрите наше новое видео',
    text_en: 'Check out our new video',
    image_url: 'https://example.com/image.jpg',
    content_type: 'photo',
    bot_name: 'ai_koshey_bot',
    sender_telegram_id: '987654321',
    test_mode: false,
  },

  valid_with_video: {
    telegram_id: '123456789',
    text_ru: 'Новое обучающее видео',
    text_en: 'New tutorial video',
    video_url: 'https://example.com/video.mp4',
    content_type: 'video',
    bot_name: 'ai_koshey_bot',
    sender_telegram_id: '987654321',
    test_mode: false,
  },

  valid_with_link: {
    telegram_id: '123456789',
    text_ru: 'Читайте новую статью',
    text_en: 'Read our new article',
    link_url: 'https://example.com/article',
    content_type: 'link',
    bot_name: 'ai_koshey_bot',
    sender_telegram_id: '987654321',
    test_mode: false,
  },

  valid_test_mode: {
    telegram_id: '123456789',
    text_ru: 'Тестовое сообщение',
    text_en: 'Test message',
    content_type: 'text',
    bot_name: 'ai_koshey_bot',
    sender_telegram_id: '987654321',
    test_mode: true,
    test_telegram_id: '111111111',
  },

  invalid_missing_text: {
    telegram_id: '123456789',
    text_ru: '',
    text_en: '',
    content_type: 'text',
  },
}

export const broadcastExpectedResults = {
  success_text: {
    success: true,
    message: 'Broadcast completed',
    statistics: {
      total_users: 1000,
      success_count: 985,
      error_count: 15,
      sent_count: 985,
      failed_count: 15,
    },
  },

  success_with_media: {
    success: true,
    message: 'Media broadcast completed',
    statistics: {
      total_users: 1000,
      success_count: 970,
      error_count: 30,
    },
  },

  success_test_mode: {
    success: true,
    message: 'Test broadcast completed',
    statistics: {
      total_users: 1,
      success_count: 1,
      error_count: 0,
    },
  },

  error_no_users: {
    success: false,
    error: 'No users found',
  },

  error_no_permission: {
    success: false,
    error: 'No permission to broadcast',
  },
}

export const broadcastErrors = {
  no_users: {
    code: 'NO_USERS',
    message: 'Пользователи не найдены',
  },

  no_permission: {
    code: 'NO_PERMISSION',
    message: 'Нет прав на рассылку',
  },

  invalid_content: {
    code: 'INVALID_CONTENT',
    message: 'Неверный контент',
  },

  rate_limited: {
    code: 'RATE_LIMITED',
    message: 'Слишком много рассылок',
  },

  broadcast_failed: {
    code: 'BROADCAST_FAILED',
    message: 'Ошибка рассылки',
  },

  invalid_bot: {
    code: 'INVALID_BOT',
    message: 'Неверный бот',
  },
}
