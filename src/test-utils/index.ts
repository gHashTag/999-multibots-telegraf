/**
 * Основной экспортный файл тестовых утилит
 * Файл обеспечивает доступ к основным компонентам тестовой системы
 */

// Экспорт основных типов
export * from './types';

// Экспорт ядра тестовой системы
// Избегаем конфликты с одинаковыми именами
import { TestCategory } from './core/categories';
import { TestFunction, TestResult } from './core/types';
export { TestCategory };
export { TestFunction, TestResult };

export * from './core/mock';
export * from './core/assertions';
export * from './core/mockContext';

// Экспорт функций запуска тестов
import * as scenesTests from './runScenesTests';
import { runTest } from './runTests';

export { scenesTests, runTest };

// Экспорт тестов сцен
export { default as runLipSyncWizardTests } from './tests/scenes/lipSyncWizard.test';
export { default as runStartSceneTests } from './tests/scenes/startScene.test';
export { default as runSelectModelSceneTests } from './tests/scenes/selectModelScene.test';
export { default as runMenuSceneTests } from './tests/scenes/menuScene.test';
export { default as runHelpSceneTests } from './tests/scenes/helpScene.test';

// Экспорты для которых нужно проверить структуру
// Если функции не экспортируются по-умолчанию, импортируем их явно
import * as ideasGeneratorTests from './tests/scenes/ideasGeneratorScene.test';
import * as voiceAvatarWizardTests from './tests/scenes/voiceAvatarWizard.test';
import * as textToVideoWizardTests from './tests/scenes/textToVideoWizard.test';
import * as textToImageWizardTests from './tests/scenes/textToImageWizard.test';
import * as imageToVideoWizardTests from './tests/scenes/imageToVideoWizard.test';
import * as imageToPromptWizardTests from './tests/scenes/imageToPromptWizard.test';
import * as neuroPhotoWizardTests from './tests/scenes/neuroPhotoWizard.test';
import * as neuroPhotoWizardV2Tests from './tests/scenes/neuroPhotoWizardV2.test';
import * as textToSpeechWizardTests from './tests/scenes/textToSpeechWizard.test';
import * as audioToTextSceneTests from './tests/scenes/audioToTextScene.test';
import * as paymentSceneTests from './tests/scenes/paymentScene.test';
import * as subscriptionSceneTests from './tests/scenes/subscriptionScene.test';

export {
  ideasGeneratorTests,
  voiceAvatarWizardTests,
  textToVideoWizardTests,
  textToImageWizardTests,
  imageToVideoWizardTests,
  imageToPromptWizardTests,
  neuroPhotoWizardTests,
  neuroPhotoWizardV2Tests,
  textToSpeechWizardTests,
  audioToTextSceneTests,
  paymentSceneTests,
  subscriptionSceneTests
};

// Export test utilities and types
export * from './core/mockFunction';
export * from './mocks/context';
export * from './types/MockFunction';
export * from './types/TestResult';

// Export scene tests
export * from './tests/scenes';

/**
 * Запуск всех тестов, если файл вызван напрямую
 */
if (require.main === module) {
  scenesTests.runScenesTests()
    .then(() => {
      console.log('');
      console.log('🏁 Тестирование завершено');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ошибка при запуске тестов:', error);
      process.exit(1);
    });
} 