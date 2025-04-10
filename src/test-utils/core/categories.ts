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
}

/**
 * Получить все подкатегории для указанной категории
 */
export function getSubcategories(category: TestCategory): TestCategory[] {
  switch (category) {
    case TestCategory.All:
      // Возвращаем все категории, кроме All
      return Object.values(TestCategory).filter(c => c !== TestCategory.All);
      
    case TestCategory.Neuro:
      return [
        TestCategory.NeuroPhoto,
        TestCategory.NeuroPhotoV2,
        TestCategory.TextToVideo,
        TestCategory.TextToImage,
      ];
      
    case TestCategory.Webhook:
      return [
        TestCategory.ReplicateWebhook,
        TestCategory.BFLWebhook, 
        TestCategory.NeuroPhotoWebhook,
      ];
      
    case TestCategory.Inngest:
      return [
        TestCategory.ModelTraining,
        TestCategory.TextToImage,
      ];
      
    case TestCategory.Speech:
      return [
        TestCategory.VoiceAvatar,
        TestCategory.TextToSpeech,
      ];
      
    case TestCategory.Payment:
      return [
        TestCategory.PaymentProcessor,
        TestCategory.RuPayment,
      ];
      
    default:
      return [];
  }
}

/**
 * Проверяет, входит ли тест в категорию
 */
export function isInCategory(testCategory: string | TestCategory, selectedCategories: string | string[] | TestCategory | TestCategory[]): boolean {
  // Преобразуем входные параметры в массивы строк для унификации обработки
  const testCategoryStr = typeof testCategory === 'string' ? testCategory : String(testCategory);
  const selectedCategoriesArr = Array.isArray(selectedCategories) 
    ? selectedCategories.map(c => typeof c === 'string' ? c : String(c))
    : [typeof selectedCategories === 'string' ? selectedCategories : String(selectedCategories)];
  
  if (selectedCategoriesArr.length === 0 || selectedCategoriesArr.includes(TestCategory.All)) {
    return true;
  }
  
  if (selectedCategoriesArr.includes(testCategoryStr)) {
    return true;
  }
  
  // Проверяем, если тест входит в какую-то из выбранных категорий как подкатегория
  for (const category of selectedCategoriesArr) {
    const subcategories = getSubcategories(category as TestCategory);
    if (subcategories.includes(testCategoryStr as TestCategory)) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  TestCategory,
  getSubcategories,
  isInCategory
}; 