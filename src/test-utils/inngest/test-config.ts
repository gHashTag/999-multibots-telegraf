/**
 * Конфигурация для тестирования Inngest функций
 */

interface TestUser {
  telegramId: string
  username: string
  botName: string
  isRussian: boolean
}

interface TestConfig {
  user: TestUser
  models: {
    photo: string
    photoV2: string
    video: string
  }
  voices: {
    male: string
    female: string
  }
}

/**
 * Конфигурация по умолчанию для тестов
 */
export const TEST_CONFIG: TestConfig = {
  user: {
    telegramId: process.env.TEST_TELEGRAM_ID || '123456789',
    username: process.env.TEST_USERNAME || 'test_user',
    botName: process.env.TEST_BOT_NAME || 'test_bot',
    isRussian: true,
  },
  models: {
    photo:
      'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    photoV2: 'stabilityai/stable-diffusion-xl-base-1.0',
    video: 'zeroscope_v2_xl',
  },
  voices: {
    male: process.env.TEST_VOICE_MALE_ID || 'pNInz6obpgDQGcFmaJgB',
    female: process.env.TEST_VOICE_FEMALE_ID || 'EXAVITQu4vr4xnSDxMaL',
  },
}
