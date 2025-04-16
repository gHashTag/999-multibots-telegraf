/**
 * Категории тестов в системе
 *
 * Категории используются для группировки тестов и фильтрации
 */
export enum TestCategory {
  // Основные категории
  All = 'all',
  Neuro = 'neuro',
  Database = 'database',
  Webhook = 'webhook',
  Inngest = 'inngest',
  Payment = 'payment',
  Speech = 'speech',
  Api = 'api',
  Translations = 'translations',

  // Подкатегории
  NeuroPhoto = 'neurophoto',
  NeuroPhotoV2 = 'neurophoto-v2',
  TextToVideo = 'text-to-video',
  TextToImage = 'text-to-image',
  BFLWebhook = 'bfl-webhook',
  ReplicateWebhook = 'replicate-webhook',
  NeuroPhotoWebhook = 'neurophoto-webhook',
  ModelTraining = 'model-training',
  VoiceAvatar = 'voice-avatar',
  TextToSpeech = 'text-to-speech',

  // Подкатегории для платежей
  PaymentProcessor = 'payment-processor',
  RuPayment = 'ru-payment',

  // Подкатегории для API
  ApiMonitoring = 'api-monitoring',
  ApiHealth = 'api-health',
  ApiEndpoints = 'api-endpoints',
  ApiWebhooks = 'api-webhooks',

  // Дополнительные категории
  System = 'system',
  AgentRouter = 'agent-router',
}

/**
 * Получить все подкатегории для указанной категории
 */
export function getSubcategories(category: TestCategory): TestCategory[] {
  switch (category) {
    case TestCategory.All:
      // Возвращаем все категории, кроме All
      return Object.values(TestCategory).filter(c => c !== TestCategory.All)

    case TestCategory.Neuro:
      return [
        TestCategory.NeuroPhoto,
        TestCategory.NeuroPhotoV2,
        TestCategory.TextToVideo,
        TestCategory.TextToImage,
      ]

    case TestCategory.Webhook:
      return [
        TestCategory.ReplicateWebhook,
        TestCategory.BFLWebhook,
        TestCategory.NeuroPhotoWebhook,
      ]

    case TestCategory.Inngest:
      return [TestCategory.ModelTraining, TestCategory.TextToImage]

    case TestCategory.Speech:
      return [TestCategory.VoiceAvatar, TestCategory.TextToSpeech]

    case TestCategory.Payment:
      return [TestCategory.PaymentProcessor, TestCategory.RuPayment]

    case TestCategory.Api:
      return [
        TestCategory.ApiMonitoring,
        TestCategory.ApiHealth,
        TestCategory.ApiEndpoints,
        TestCategory.ApiWebhooks,
      ]

    default:
      return []
  }
}

/**
 * Проверяет, относится ли тест к указанной категории
 */
export function isInCategory(
  testCategory: TestCategory,
  category: TestCategory
): boolean {
  if (category === TestCategory.All) return true
  return testCategory === category
}

export default {
  TestCategory,
  getSubcategories,
  isInCategory,
}
