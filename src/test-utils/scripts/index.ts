/**
 * Test Runner Scripts Index
 * Централизованный экспорт всех скриптов для запуска тестов
 */

import { runScenesTests } from './runners/runScenesTests';
import { runMediaTests } from './runners/runMediaTests';
import { runIntegrationTests } from './runners/runIntegrationTests';
import { runUnitTests } from './runners/runUnitTests';

export {
  runScenesTests,
  runMediaTests,
  runIntegrationTests,
  runUnitTests,
};

// Типы для конфигурации тестов
export interface TestRunnerConfig {
  verbose?: boolean;
  filter?: string;
  timeout?: number;
  parallel?: boolean;
  reporters?: string[];
}

// Константы
export const DEFAULT_TIMEOUT = 30000;
export const DEFAULT_REPORTERS = ['console', 'json'];

// Утилиты для запуска тестов
export const createTestRunner = (config: TestRunnerConfig) => {
  return {
    runScenes: () => runScenesTests(config),
    runMedia: () => runMediaTests(config),
    runIntegration: () => runIntegrationTests(config),
    runUnit: () => runUnitTests(config),
  };
}; 