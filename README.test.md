# Тестирование Telegram-бота

## Виды тестов

1. **Тесты сцен** - проверяют корректность работы сцен Telegram-бота
2. **Тесты платежной системы** - проверяют функциональность платежной системы
3. **Тесты нейрофункций** - проверяют работу с нейросетями
4. **Тесты inngest функций** - проверяют работу с событиями Inngest

## Запуск тестов

### Локальный запуск

```bash
# Запуск всех тестов сцен
npm run test:scenes

# Запуск тестов для конкретной сцены
npm run test:custom -- tests/scenes/helpScene.test.ts
npm run test:custom -- tests/scenes/lipSyncWizard.test.ts

# Запуск тестов для платежной системы
npm run test:payment

# Запуск тестов для нейрофункций
npm run test:neurophoto
```

### Запуск тестов в Docker (рекомендуется)

Запуск тестов в Docker обеспечивает полную изоляцию тестового окружения и гарантирует одинаковые результаты на всех системах.

```bash
# Запуск всех тестов сцен в Docker
./run-docker-tests.sh scenes

# Запуск тестов для конкретной сцены
./run-docker-tests.sh helpScene
./run-docker-tests.sh lipSyncWizard

# Запуск через docker-compose (для тестов с зависимостями)
./run-docker-tests.sh -c scenes

# Показать справку
./run-docker-tests.sh --help
```

#### Преимущества запуска в Docker:

- Изолированное окружение
- Отсутствие влияния на локальную систему
- Консистентность между разными разработчиками
- Воспроизводимость результатов
- Легкая интеграция с CI/CD

## Структура тестов

```
src/test-utils/
├── core/                     # Ядро тестовой системы
│   ├── assertions.ts         # Функции для проверок
│   ├── categories.ts         # Категории тестов
│   ├── mock.ts               # Утилиты для создания моков
│   ├── mockContext.ts        # Имитация контекста Telegram
│   ├── setupTests.ts         # Настройка тестового окружения
│   └── types.ts              # Типы для тестовой системы
│
├── tests/                    # Тесты
│   ├── scenes/               # Тесты сцен Telegram-бота
│   │   ├── helpScene.test.ts # Тест для helpScene
│   │   └── ... 
│   ├── payment/              # Тесты платежной системы
│   ├── inngest/              # Тесты для Inngest функций
│   └── ...
│
├── mocks/                    # Моки для внешних сервисов
├── runScenesTests.ts         # Скрипт для запуска тестов сцен
└── ROADMAP.md                # Дорожная карта тестирования
```

## Автоматизация тестирования

Проект настроен на автоматический запуск тестов при каждом изменении кода. Система обеспечивает:

1. **Запуск тестов в Docker** после каждого внесённого изменения
2. **Изоляцию тестового окружения** для предотвращения влияния на реальные данные
3. **Стандартизацию результатов** для упрощения анализа

### Автономный протокол тестирования

```bash
# После внесения изменений
git add .
./run-docker-tests.sh scenes  # Прогон тестов в Docker
git commit -m "feat: description of changes"
git push
```

## Написание новых тестов

### Пример теста для сцены

```typescript
import { MyContext } from '@/interfaces';
import { createMockContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';

// Константы для тестирования
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';

/**
 * Настройка тестовой среды
 */
function setupTest() {
  // Сброс моков между тестами
}

/**
 * Тест для входа в сцену помощи
 */
export async function testExampleScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Создаем мок-контекст
    const ctx = createMockContext();
    ctx.from = { id: TEST_USER_ID, username: TEST_USERNAME } as any;
    ctx.session = {} as any;
    
    // Импортируем сцену
    const { exampleScene } = await import('@/scenes/exampleScene');
    
    // Вызываем обработчик входа в сцену
    await exampleScene.enter(ctx as unknown as MyContext);
    
    // Проверки
    assertReplyContains(ctx, 'Ожидаемый текст');
    
    return {
      name: 'ExampleScene: Enter Scene',
      category: TestCategory.Scenes,
      success: true,
      message: 'Тест успешно пройден'
    };
  } catch (error) {
    logger.error('Ошибка в тесте:', error);
    return {
      name: 'ExampleScene: Enter Scene',
      category: TestCategory.Scenes,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Запуск всех тестов для сцены
 */
export async function runExampleSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testExampleScene());
  } catch (error) {
    logger.error('Ошибка при запуске тестов:', error);
    results.push({
      name: 'ExampleScene: Общая ошибка',
      category: TestCategory.Scenes,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runExampleSceneTests;
```

### Интеграция нового теста

После создания нового теста нужно:

1. Добавить импорт в `runScenesTests.ts`
2. Добавить вызов функции запуска тестов
3. Обновить статистику в `ROADMAP.md`
4. Запустить тесты через Docker для проверки

## Текущее состояние тестирования

На текущий момент тестами покрыто 26 из 38 сцен (68.4%), включая все основные функциональные сцены. 

### Последние обновления:
- Добавлены тесты для `helpScene` и `lipSyncWizard`
- Улучшена система запуска тестов в Docker
- Обновлена документация по тестированию

### Планы по расширению:
- Добавить тесты для оставшихся 12 сцен
- Улучшить покрытие существующих тестов
- Интегрировать тесты с CI/CD

## Отладка тестов

Для отладки тестов можно использовать:

```bash
# Запуск с выводом подробной информации
DEBUG=true npm run test:scenes

# Запуск конкретного теста с отладкой
DEBUG=true npm run test:custom -- tests/scenes/helpScene.test.ts

# Отладка в Docker с монтированием логов
./run-docker-tests.sh scenes
cat logs/test.log  # Просмотр логов
``` 