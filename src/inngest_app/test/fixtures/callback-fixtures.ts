/**
 * CALLBACK FUNCTIONS FIXTURES
 *
 * Тестовые данные для callback функций:
 * - ai-reels-callback
 */

export const aiReelsCallbackData = {
  valid_completed: {
    job_id: 'job_12345',
    status: 'completed',
    metadata: {
      telegram_id: '123456789',
      service_type: 'neurovideo',
    },
    // Обработчик читает URL с ВЕРХНЕГО уровня полезной нагрузки
    // (`payload.result_url || payload.video_url || payload.download_url`) —
    // такова форма реального вебхука провайдера, там же он вытаскивает
    // job_id из пути download_url. Прежняя вложенность в `result` была
    // выдумкой фикстуры, из-за неё обработчик кидал 'No video URL found'.
    video_url: 'https://example.com/video.mp4',
    thumbnail_url: 'https://example.com/thumb.jpg',
    duration: 30,
  },

  valid_failed: {
    job_id: 'job_12345',
    status: 'failed',
    error: {
      code: 'RENDER_ERROR',
      message: 'Video rendering failed',
    },
    metadata: {
      telegram_id: '123456789',
      service_type: 'neurovideo',
    },
  },

  valid_processing: {
    job_id: 'job_12345',
    status: 'processing',
    progress: 75,
    metadata: {
      telegram_id: '123456789',
      service_type: 'neurovideo',
    },
  },

  invalid_missing_status: {
    job_id: 'job_12345',
    metadata: {
      telegram_id: '123456789',
    },
  },

  invalid_missing_job_id: {
    status: 'completed',
    metadata: {
      telegram_id: '123456789',
    },
  },
}

export const callbackExpectedResults = {
  success_completed: {
    success: true,
    status: 'completed',
    job_id: 'job_12345',
    action: 'send_video',
  },

  success_failed: {
    success: true,
    status: 'failed',
    job_id: 'job_12345',
    action: 'send_error_message',
  },

  error_invalid_payload: {
    success: false,
    error: 'Invalid callback payload',
  },
}

export const callbackErrors = {
  invalid_status: {
    code: 'INVALID_STATUS',
    message: 'Недопустимый статус',
  },

  missing_metadata: {
    code: 'MISSING_METADATA',
    message: 'Отсутствуют метаданные',
  },

  render_failed: {
    code: 'RENDER_FAILED',
    message: 'Ошибка рендера видео',
  },
}
