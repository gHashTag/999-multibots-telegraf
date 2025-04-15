/**
 * Типы для тест-раннеров
 * @module test-runners/types
 */

import { TestCategory } from '../core/types';

export interface TestRunnerConfig {
  /** Включить подробное логирование */
  verbose?: boolean;
  
  /** Фильтр для запуска конкретных тестов */
  filter?: string | RegExp;
  
  /** Таймаут для каждого теста (мс) */
  timeout?: number;
  
  /** Запускать тесты параллельно */
  parallel?: boolean;
  
  /** Категория тестов */
  category?: TestCategory;
  
  /** Пропустить определенные тесты */
  skip?: string[];
  
  /** Запустить только указанные тесты */
  only?: string[];
} 