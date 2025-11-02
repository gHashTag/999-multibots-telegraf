/**
 * 🧪 Simple Lip-sync Test Assets
 * Тестовые данные для проверки работы упрощенного шаблона
 */

export const TEST_ASSETS = {
  // Тестовые видео для lip-sync
  USER_VIDEOS: {
    // Маленькое тестовое видео (Big Buck Bunny)
    SHORT_VIDEO: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',

    // Тестовое видео с говорящим человеком
    SPEAKING_PERSON: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4',

    // Короткое тестовое видео (5 секунд)
    SHORT_5SEC: 'https://sample-videos.com/zip/10/mp4/SampleVideo_640x360_5mb.mp4',
  },

  // Тестовые аудио для TTS
  TEST_AUDIOS: {
    // Короткое тестовое аудио
    SHORT: 'https://www2.cs.uic.edu/~i101/SoundFiles/StarWars3.wav',

    // Тестовое аудио на русском
    RUSSIAN: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Russian_alphabet.wav',

    // Тестовое аудио с речью
    SPEECH: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/En-us-hello.ogg',
  },

  // Ожидаемые результаты lip-sync
  LIPSYNC_RESULTS: {
    // Тестовый результат от Fal.ai
    TEST_RESULT: 'https://storage.googleapis.com/falserverless/example_outputs/veed-fabric-lipsync.mp4',

    // Альтернативный тестовый результат
    ALT_RESULT: 'https://storage.googleapis.com/falserverless/example_outputs/veo31-r2v-output.mp4',
  },

  // Параметры для тестов
  TEST_PARAMS: {
    VIDEO_DURATION_LIMIT: 30, // максимум 30 секунд
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    LIPSYNC_PRICE: 120, // цена в звездах
    TTS_VOICE_ID: 'pNInz6obpgDQGcFmaJgB', // Adam voice
  },
}

/**
 * 🎬 Создание mock session для тестирования
 */
export function createMockSession() {
  return {
    simpleLipSync: {
      step: 'video',
      telegramId: '123456789',
      videoFileId: 'mock-file-id',
      videoUrl: TEST_ASSETS.USER_VIDEOS.SHORT_VIDEO,
      text: 'Привет! Это тест lip-sync.',
      voiceAudioUrl: TEST_ASSETS.TEST_AUDIOS.SHORT,
      resultVideoUrl: TEST_ASSETS.LIPSYNC_RESULTS.TEST_RESULT,
      startTime: Date.now(),
    },
  }
}

/**
 * 📊 Ожидаемые метрики для тестов
 */
export const EXPECTED_METRICS = {
  VIDEO_PROCESSING_TIME: {
    MIN: 1000, // минимум 1 секунда
    MAX: 30000, // максимум 30 секунд для теста
  },

  AUDIO_GENERATION_TIME: {
    MIN: 500, // минимум 0.5 секунды
    MAX: 5000, // максимум 5 секунд
  },

  LIPSYNC_GENERATION_TIME: {
    MIN: 10000, // минимум 10 секунд
    MAX: 60000, // максимум 60 секунд
  },
}

/**
 * 🧪 Mock ответы API для тестирования
 */
export const MOCK_API_RESPONSES = {
  // Успешный TTS ответ
  TTS_SUCCESS: {
    audioUrl: TEST_ASSETS.TEST_AUDIOS.SHORT,
    duration: 5,
    voiceId: TEST_ASSETS.TEST_PARAMS.TTS_VOICE_ID,
    format: 'mp3',
  },

  // Успешный lip-sync ответ
  LIPSYNC_SUCCESS: {
    videoUrl: TEST_ASSETS.LIPSYNC_RESULTS.TEST_RESULT,
    output: TEST_ASSETS.LIPSYNC_RESULTS.TEST_RESULT,
    duration: 5,
    resolution: '720p',
    provider: 'fal-ai/veed-fabric-1.0-fast',
  },

  // Ошибка недостатка баланса
  INSUFFICIENT_BALANCE: {
    error: 'Insufficient balance',
    required: TEST_ASSETS.TEST_PARAMS.LIPSYNC_PRICE,
    current: 0,
  },

  // Ошибка lip-sync генерации
  LIPSYNC_ERROR: {
    error: 'Lip-sync generation failed',
    provider: 'fal-ai',
    code: 'GENERATION_FAILED',
  },
}