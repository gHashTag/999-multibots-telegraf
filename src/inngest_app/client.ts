import { Inngest } from 'inngest'

// ✅ ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ: Один Inngest клиент для всего приложения
// Используем тестовые ключи для тестового окружения (testing-f3b09edd)
const config = {
  name: 'Vibee',
  id: 'vibee-bot-client',
  // Подключение к Inngest Cloud
  baseUrl:
    process.env.BOT_INNGEST_BASE_URL ||
    (process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000' // Локальный dev server
      : 'https://api.inngest.com'), // Inngest Cloud API
  isDev: process.env.NODE_ENV === 'development',
  // Event key: приоритет тестовому ключу для тестового окружения
  eventKey:
    process.env.BOT_INNGEST_EVENT_TEST_KEY ||
    process.env.BOT_INNGEST_EVENT_KEY ||
    '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q',
  // Signing key: приоритет тестовому ключу
  signingKey:
    process.env.BOT_INNGEST_TEST_SIGNING_KEY ||
    process.env.BOT_INNGEST_SIGNING_KEY ||
    'signkey-test-c4167464e900701832920c98bb2ec6e6e3c59fd2b27c62e1f4140dada01e4597',
}

console.log(
  '🔥 [INNGEST CLIENT] Единственный источник правды инициализирован:',
  {
    name: config.name,
    baseUrl: config.baseUrl,
    isDev: config.isDev,
    hasEventKey: !!config.eventKey,
    hasSigningKey: !!config.signingKey,
    usingTestKey: !!process.env.BOT_INNGEST_EVENT_TEST_KEY,
    environment: process.env.NODE_ENV,
  }
)

// ✅ ВАЖНО: Создаем клиент Inngest ПЕРЕД импортом функций (избегаем circular dependency)
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest(config)
