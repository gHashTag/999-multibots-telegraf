import { Inngest } from 'inngest'

// Определяем конфигурацию для логирования
const config = {
  name: 'Vibee',
  id: 'vibee-bot-client',
  // Подключение к нашему Inngest Dev Server
  // ✅ ИСПРАВЛЕНО: Используем только наш домен для Inngest
  baseUrl:
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000' // Локальный dev server
      : 'https://three-head-dragon.shop/api/inngest', // Только наш домен в продакшене
  isDev: process.env.NODE_ENV === 'development',
  // Event key для production и test
  eventKey:
    process.env.BOT_INNGEST_EVENT_KEY ||
    '4JiBiCBZ8en7jNonnsAPXCFiLVkrt1uEXklGcDzaQ6SCBV9p7-UBlQlTrze-x_WPRTihikB_uhAGhbkwGhnu4Q',
  // Signing key for webhook verification
  signingKey:
    process.env.BOT_INNGEST_TEST_SIGNING_KEY ||
    'signkey-prod-e2c2d07a9d0306957816b187e3e4fcd617ee0435923a1b613563c4666c82c047',
}

console.log('🔥 [DEBUG] Inngest client configuration:', {
  ...config,
  eventKey: config.eventKey ? '***HIDDEN***' : 'not set',
  environment: process.env.NODE_ENV,
})

// ✅ ВАЖНО: Создаем клиент Inngest ПЕРЕД импортом функций (избегаем circular dependency)
// @ts-ignore - Игнорируем несоответствие типов для совместимости между разными версиями Inngest
export const inngest = new Inngest(config)
