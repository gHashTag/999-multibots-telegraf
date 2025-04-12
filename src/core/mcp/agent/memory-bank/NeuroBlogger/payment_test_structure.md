# 📋 Структура тестов платежной системы NeuroBlogger

## 🏗️ Общая архитектура тестов

Тесты платежной системы построены с использованием собственного тестового фреймворка, специально разработанного для тестирования асинхронных Inngest-функций. Тесты организованы по принципу модульности, с четкой структурой директорий и разделением ответственности.

## 📁 Структура директорий и файлов

```
src/
└── test-utils/
    ├── index.ts                 # Основной экспорт
    ├── types.ts                 # Типы для тестирования
    ├── test-config.ts           # Конфигурация тестов
    ├── inngestTestEngine.ts     # Движок для тестирования Inngest
    ├── mockFunctions.ts         # Функции для создания моков
    ├── runTests.ts              # Запуск тестов
    ├── reporters/               # Репортеры для вывода результатов
    │   ├── console-reporter.ts  # Консольный репортер
    │   └── docker-reporter.ts   # Репортер для Docker
    └── tests/                   # Директория с тестами
        └── payment/             # Тесты платежной системы
            ├── paymentProcessorTest.ts       # Основные тесты процессора платежей
            ├── paymentProcessorMockTest.ts   # Тесты с использованием моков
            └── paymentDockerTest.ts          # Тесты для Docker-окружения
```

## 📄 Основные файлы тестовой инфраструктуры

### 🔧 test-config.ts

Содержит конфигурацию для тестов:
- Таймауты и ожидания
- Тестовые пользователи и данные
- Настройки логирования
- Категории тестов
- Функции-помощники

### 🚀 inngestTestEngine.ts

Специализированный тестовый движок для работы с Inngest:
- Отправка тестовых событий
- Ожидание обработки событий
- Мокирование Inngest-функций
- Симуляция ошибок и таймаутов

### 📝 types.ts

Определяет основные типы для тестирования:

```typescript
export interface TestResult {
  success: boolean;
  message: string;
  name: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface TestFunction {
  (): Promise<TestResult>;
}
```

### 🏃 runTests.ts

Запускает тесты определенной категории:

```typescript
async function runTests(category: string) {
  // Загрузка тестов указанной категории
  // Выполнение тестов
  // Сбор и отображение результатов
}
```

## 🧪 Категории тестов

### 1. 💵 payment-processor - Основные тесты процессора платежей

Расположение: `src/test-utils/tests/payment/paymentProcessorTest.ts`

Тесты проверяют основную функциональность платежного процессора с использованием реальной базы данных:
- Пополнение баланса (money_income)
- Списание средств (money_expense)
- Обработка ошибок 
- Проверка дублирующихся транзакций
- Граничные случаи и валидация

### 2. 🧩 payment-mock - Тесты с использованием моков

Расположение: `src/test-utils/tests/payment/paymentProcessorMockTest.ts`

Тесты используют моки вместо реальных вызовов базы данных и внешних зависимостей:
- Тестирование бизнес-логики обработки платежей
- Моделирование различных сценариев ошибок
- Проверка поведения при сбоях
- Тестирование редких условий

### 3. 🐳 payment-docker - Тесты для Docker-окружения

Расположение: `src/test-utils/tests/payment/paymentDockerTest.ts`

Тесты, оптимизированные для выполнения в Docker-контейнере:
- Интеграционные тесты всей платежной системы
- Проверка взаимодействия с базой данных
- Тестирование в условиях, приближенных к продакшн
- Проверка производительности и масштабируемости

### 4. 💰 payment - Общая категория

Включает все типы тестов платежной системы. Используется для запуска полного набора тестов.

## 🧾 Структура тестовых файлов

Каждый тест следует стандартной структуре:

```typescript
export async function testName(): Promise<TestResult> {
  try {
    // 1. Подготовка тестового окружения
    console.log('🚀 Запуск теста...');
    
    // 2. Подготовка тестовых данных
    const testUser = { telegram_id: '123456789' };
    
    // 3. Выполнение тестируемой операции
    // ...код операции...
    
    // 4. Проверка результатов
    // ...проверки...
    
    // 5. Возврат результата теста
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'Название теста'
    };
  } catch (error) {
    // 6. Обработка ошибок
    console.error(`❌ Ошибка: ${error.message}`);
    
    return {
      success: false,
      message: `Ошибка: ${error.message}`,
      name: 'Название теста'
    };
  } finally {
    // 7. Очистка после теста
    // ...очистка...
  }
}
```

## 🎯 Примеры тестов

### Тест пополнения баланса (money_income)

```typescript
export async function testMoneyIncome(): Promise<TestResult> {
  try {
    // Подготовка тестового окружения
    await inngestTestEngine.init({
      mockEvents: false,
      logLevel: 'info'
    });
    
    // Тестовые данные
    const testUser = { telegram_id: '123456789' };
    const amount = 100;
    const operationId = generateUniqueId();
    
    // Получение начального баланса
    const initialBalance = await getUserBalance(testUser.telegram_id);
    
    // Отправка события пополнения
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: amount,
        type: 'money_income',
        description: 'Test balance replenishment',
        bot_name: 'TestBot',
        service_type: ModeEnum.TopUpBalance,
        operation_id: operationId
      }
    });
    
    // Ожидание обработки события
    await inngestTestEngine.waitForEvent('payment/processed', {
      timeout: 5000,
      filter: (event) => event.data.telegram_id === testUser.telegram_id
    });
    
    // Проверка баланса после операции
    const newBalance = await getUserBalance(testUser.telegram_id);
    const expectedBalance = initialBalance + amount;
    
    if (newBalance !== expectedBalance) {
      return {
        success: false,
        message: `Баланс после пополнения неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Income Test'
      };
    }
    
    return {
      success: true,
      message: 'Тест пополнения баланса успешно пройден',
      name: 'Money Income Test'
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка в тесте пополнения: ${error.message}`,
      name: 'Money Income Test'
    };
  } finally {
    await inngestTestEngine.cleanup();
  }
}
```

### Тест списания средств (money_expense)

```typescript
export async function testMoneyExpense(): Promise<TestResult> {
  try {
    // Подготовка тестового окружения
    await inngestTestEngine.init({
      mockEvents: false,
      logLevel: 'info'
    });
    
    // Тестовые данные
    const testUser = { telegram_id: '123456789' };
    const expenseAmount = 50;
    const operationId = generateUniqueId();
    
    // Получение начального баланса
    const initialBalance = await getUserBalance(testUser.telegram_id);
    
    // Проверка, достаточно ли средств
    if (initialBalance < expenseAmount) {
      // Пополнение баланса для теста
      await inngestTestEngine.sendEvent({
        name: 'payment/process',
        data: {
          telegram_id: testUser.telegram_id,
          amount: expenseAmount * 2,
          type: 'money_income',
          description: 'Test balance replenishment for expense test',
          bot_name: 'TestBot',
          service_type: ModeEnum.TopUpBalance,
          operation_id: generateUniqueId()
        }
      });
      
      // Ожидание обработки пополнения
      await inngestTestEngine.waitForEvent('payment/processed', {
        timeout: 5000,
        filter: (event) => event.data.telegram_id === testUser.telegram_id
      });
    }
    
    // Получение обновленного баланса
    const updatedInitialBalance = await getUserBalance(testUser.telegram_id);
    
    // Отправка события списания
    await inngestTestEngine.sendEvent({
      name: 'payment/process',
      data: {
        telegram_id: testUser.telegram_id,
        amount: expenseAmount,
        type: 'money_expense',
        description: 'Test expense operation',
        bot_name: 'TestBot',
        service_type: ModeEnum.TextGeneration,
        operation_id: operationId
      }
    });
    
    // Ожидание обработки события
    await inngestTestEngine.waitForEvent('payment/processed', {
      timeout: 5000,
      filter: (event) => event.data.telegram_id === testUser.telegram_id
    });
    
    // Проверка баланса после операции
    const newBalance = await getUserBalance(testUser.telegram_id);
    const expectedBalance = updatedInitialBalance - expenseAmount;
    
    if (newBalance !== expectedBalance) {
      return {
        success: false,
        message: `Баланс после списания неверен. Ожидалось: ${expectedBalance}, получено: ${newBalance}`,
        name: 'Money Expense Test'
      };
    }
    
    return {
      success: true,
      message: 'Тест списания средств успешно пройден',
      name: 'Money Expense Test'
    };
  } catch (error) {
    return {
      success: false,
      message: `Ошибка в тесте списания: ${error.message}`,
      name: 'Money Expense Test'
    };
  } finally {
    await inngestTestEngine.cleanup();
  }
}
```

## 📊 Репортеры тестов

### 📝 Консольный репортер

`src/test-utils/reporters/console-reporter.ts`

Выводит результаты тестов в консоль с использованием цветного форматирования и эмодзи:

```typescript
export class ConsoleReporter {
  reportTestResult(result: TestResult): void {
    const icon = result.success ? '✅' : '❌';
    const status = result.success ? 'УСПЕХ' : 'ОШИБКА';
    
    console.log(`${icon} [${status}] ${result.name}`);
    console.log(`  ${result.message}`);
    
    if (result.duration) {
      console.log(`  ⏱️ Время выполнения: ${result.duration}ms`);
    }
    
    console.log(''); // Пустая строка для разделения
  }
  
  reportSummary(results: TestResult[]): void {
    const totalTests = results.length;
    const passedTests = results.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    
    console.log('\n📊 Сводка результатов:');
    console.log(`  Всего тестов: ${totalTests}`);
    console.log(`  Успешно: ${passedTests}`);
    console.log(`  Неудачно: ${failedTests}`);
    
    const successRate = (passedTests / totalTests) * 100;
    console.log(`  Процент успеха: ${successRate.toFixed(2)}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Неудачные тесты:');
      results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.message}`);
        });
    }
  }
}
```

### 📊 Docker-репортер

`src/test-utils/reporters/docker-reporter.ts`

Сохраняет результаты в файл JSON для последующего анализа, особенно полезен при запуске в CI/CD:

```typescript
export class DockerTestReporter {
  private results: TestResult[] = [];
  private startTime: number;
  
  constructor() {
    this.startTime = Date.now();
  }
  
  addResult(result: TestResult): void {
    this.results.push(result);
  }
  
  finish(): void {
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    const reportData = {
      summary: {
        total: this.results.length,
        success: this.results.filter(r => r.success).length,
        failure: this.results.filter(r => !r.success).length,
        duration: `${duration}ms`
      },
      timestamp: new Date().toISOString(),
      results: this.results
    };
    
    // Сохранение отчета в файл
    const reportPath = '/app/test-results/report.json';
    fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
    
    // Вывод сводки в консоль
    console.log(`📊 Отчет сохранен в ${reportPath}`);
    console.log(`✅ Успешно: ${reportData.summary.success}/${reportData.summary.total}`);
    
    if (reportData.summary.failure > 0) {
      console.log('❌ Неудачные тесты:');
      this.results
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.message}`);
        });
    }
  }
}
```

## 🚀 Запуск тестов

### Запуск через npm

```json
// package.json
{
  "scripts": {
    "test:payment": "node -r ts-node/register src/test-utils/runTests.ts payment",
    "test:payment-processor": "node -r ts-node/register src/test-utils/runTests.ts payment-processor",
    "test:payment-mock": "node -r ts-node/register src/test-utils/runTests.ts payment-mock",
    "test:payment-docker": "node -r ts-node/register src/test-utils/runTests.ts payment-docker"
  }
}
```

### Структура запуска тестов

`src/test-utils/runTests.ts`:

```typescript
import { TestResult, TestFunction } from './types';
import { isTestCategoryEnabled, TEST_CONFIG } from './test-config';
import { ConsoleReporter } from './reporters/console-reporter';
import { DockerTestReporter } from './reporters/docker-reporter';

// Импорт тестовых функций
import * as paymentProcessorTests from './tests/payment/paymentProcessorTest';
import * as paymentMockTests from './tests/payment/paymentProcessorMockTest';
import * as paymentDockerTests from './tests/payment/paymentDockerTest';

// Карта категорий тестов
const testCategories = {
  'payment-processor': Object.values(paymentProcessorTests) as TestFunction[],
  'payment-mock': Object.values(paymentMockTests) as TestFunction[],
  'payment-docker': Object.values(paymentDockerTests) as TestFunction[],
  'payment': [
    ...Object.values(paymentProcessorTests),
    ...Object.values(paymentMockTests),
    ...(process.env.DOCKER_TESTING === 'true' ? Object.values(paymentDockerTests) : [])
  ] as TestFunction[]
};

// Функция запуска тестов
async function runTests(category: string) {
  // Проверка, включена ли категория тестов
  if (!isTestCategoryEnabled(category)) {
    console.log(`⚠️ Категория тестов "${category}" отключена в конфигурации`);
    return;
  }
  
  // Получение тестов для выбранной категории
  const tests = testCategories[category] || [];
  if (tests.length === 0) {
    console.log(`⚠️ Тесты для категории "${category}" не найдены`);
    return;
  }
  
  console.log(`🚀 Запуск тестов категории "${category}" (${tests.length} тестов)`);
  
  // Подготовка тестового окружения
  await TEST_CONFIG.helpers.setupTestEnvironment();
  
  // Выбор репортера в зависимости от окружения
  const reporter = process.env.DOCKER_TESTING === 'true'
    ? new DockerTestReporter()
    : new ConsoleReporter();
  
  // Запуск тестов и сбор результатов
  const results: TestResult[] = [];
  
  for (const test of tests) {
    try {
      console.log(`🔍 Запуск теста: ${test.name || 'Безымянный тест'}`);
      
      const startTime = Date.now();
      const result = await test();
      const endTime = Date.now();
      
      result.duration = endTime - startTime;
      results.push(result);
      
      // Вывод результата теста
      reporter.reportTestResult?.(result);
    } catch (error) {
      // Обработка ошибок в самом тесте
      const errorResult: TestResult = {
        success: false,
        message: `Критическая ошибка в тесте: ${error.message}`,
        name: test.name || 'Неизвестный тест',
        duration: 0
      };
      
      results.push(errorResult);
      reporter.reportTestResult?.(errorResult);
    }
  }
  
  // Вывод сводки результатов
  if (reporter instanceof ConsoleReporter) {
    reporter.reportSummary(results);
  } else if (reporter instanceof DockerTestReporter) {
    reporter.finish();
  }
  
  // Очистка тестового окружения
  await TEST_CONFIG.helpers.teardownTestEnvironment();
  
  // Возврат кода выхода в зависимости от результатов
  const hasFailures = results.some(r => !r.success);
  if (hasFailures) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Запуск с аргументами командной строки
const category = process.argv[2] || 'payment';
runTests(category).catch(error => {
  console.error(`❌ Критическая ошибка при запуске тестов: ${error.message}`);
  process.exit(1);
});
```

## 🔄 Интеграция с CI/CD

### GitHub Actions

Пример настройки GitHub Actions для автоматического запуска тестов:

```yaml
name: Payment System Tests

on:
  push:
    branches: [ main, dev ]
    paths:
      - 'src/inngest-functions/paymentProcessor.ts'
      - 'src/core/supabase/getUserBalance.ts'
      - 'src/test-utils/**'
  pull_request:
    branches: [ main ]
    paths:
      - 'src/inngest-functions/paymentProcessor.ts'
      - 'src/core/supabase/getUserBalance.ts'
      - 'src/test-utils/**'

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Set up Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Create test environment file
        run: cp .env.example .env.test
        
      - name: Setup test environment variables
        run: |
          echo "SUPABASE_URL=${{ secrets.TEST_SUPABASE_URL }}" >> .env.test
          echo "SUPABASE_KEY=${{ secrets.TEST_SUPABASE_KEY }}" >> .env.test
          echo "TELEGRAM_BOT_TOKEN=${{ secrets.TEST_TELEGRAM_BOT_TOKEN }}" >> .env.test
          echo "DOCKER_TESTING=true" >> .env.test
          
      - name: Run payment tests in Docker
        run: |
          docker-compose -f docker-compose.test.yml build
          docker-compose -f docker-compose.test.yml up --exit-code-from test
          
      - name: Store test results
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: test-results/
          retention-days: 7
```

## 📘 Дополнительные компоненты тестовой инфраструктуры

### 🧩 Мокирование функций

`src/test-utils/mockFunctions.ts`:

```typescript
export type MockFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): ReturnType<T>;
  calls: Parameters<T>[];
  mockImplementation: (fn: T) => MockFunction<T>;
  mockResolvedValue: (value: ReturnType<T>) => MockFunction<T>;
  mockRejectedValue: (error: any) => MockFunction<T>;
  mockReset: () => void;
};

/**
 * Создает мок-функцию для тестирования
 */
export function createMockFn<T extends (...args: any[]) => any>(): MockFunction<T> {
  let implementation: T = (() => undefined) as unknown as T;
  const calls: Parameters<T>[] = [];
  
  const mockFn = ((...args: Parameters<T>): ReturnType<T> => {
    calls.push(args);
    return implementation(...args);
  }) as MockFunction<T>;
  
  mockFn.calls = calls;
  
  mockFn.mockImplementation = (fn: T) => {
    implementation = fn;
    return mockFn;
  };
  
  mockFn.mockResolvedValue = (value: ReturnType<T>) => {
    implementation = (() => Promise.resolve(value)) as unknown as T;
    return mockFn;
  };
  
  mockFn.mockRejectedValue = (error: any) => {
    implementation = (() => Promise.reject(error)) as unknown as T;
    return mockFn;
  };
  
  mockFn.mockReset = () => {
    calls.length = 0;
    implementation = (() => undefined) as unknown as T;
  };
  
  return mockFn;
}
```

### ⏱️ Утилиты времени для тестов

```typescript
/**
 * Функция ожидания указанного времени
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Функция для установки таймаута
 */
export function timeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), ms)
    )
  ]);
}
```

## 🔄 Полный цикл тестирования платежной системы

1. **Подготовка тестового окружения**
   - Настройка переменных окружения
   - Инициализация тестовых данных
   - Запуск необходимых сервисов

2. **Запуск тестов**
   - Локальные тесты для быстрой разработки
   - Моки для изоляции компонентов
   - Docker-тесты для полной интеграции

3. **Анализ результатов**
   - Проверка логов и отчетов
   - Выявление проблем производительности
   - Исправление найденных ошибок

4. **Интеграция в CI/CD**
   - Автоматический запуск тестов при коммитах
   - Блокировка мерджа при неудачных тестах
   - Сохранение истории результатов

5. **Поддержка и развитие тестов**
   - Регулярное обновление тестов при изменении кода
   - Добавление новых тестов для новых функций
   - Оптимизация существующих тестов