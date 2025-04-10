# 🔄 Тесты Inngest функций

В этой директории содержатся тесты для Inngest функций проекта.

## 📋 Описание

Тесты Inngest функций предназначены для проверки корректности работы событийно-ориентированных функций, используемых в проекте. Они используют класс `InngestFunctionTester` из директории `testers`, который является оберткой над `InngestTester` из директории `inngest`.

## 🚀 Как добавлять новые тесты

Чтобы добавить новый тест для Inngest функции:

1. Создайте новый файл в этой директории, например `myInngestFunction.test.ts`
2. Используйте класс `InngestFunctionTester` для тестирования функции:

```typescript
import { InngestFunctionTester } from '../../testers/InngestFunctionTester'
import assert from '../../core/assert'

// Создание тестера
const tester = new InngestFunctionTester({
  verbose: true
})

// Экспорт функции для запуска теста
export async function testMyInngestFunction() {
  // Запуск теста
  const result = await tester.runTest({
    method: 'testSpecificFunction',
    data: {
      // Входные данные для теста
    }
  })
  
  // Важно: используйте assert.assert() вместо assert() напрямую
  assert.assert(result.success, 'Тест должен быть успешным')
  assert.strictEqual(result.data.someField, 'expectedValue', 'Поле должно соответствовать ожидаемому значению')
  
  return result
}
```

3. Зарегистрируйте тест в `core/runTests.ts`:

```typescript
// В функции runTests
if (isInCategory(TestCategory.Inngest, args.category)) {
  // ...
  
  // Добавление нового теста
  runner.addTests([
    {
      name: 'Мой новый Inngest тест',
      category: 'inngest',
      description: 'Описание нового теста',
      run: async () => await testMyInngestFunction()
    }
  ])
}
```

## 📋 Список имеющихся тестов

### Реализованные Inngest тесты:

1. **textToImageTest.ts** - Тест для функции генерации изображений из текстового описания
   - Проверяет корректность генерации изображений по текстовому промпту
   - Обрабатывает различные случаи ввода и проверяет качество выходных данных

2. **textToVideoTest.ts** - Тест для функции генерации видео из текстового описания
   - Проверяет создание видео на основе текстового описания
   - Проверяет формат, длительность и другие параметры созданного видео

3. **imageToVideoTest.ts** - Тест для функции преобразования изображения в видео
   - Валидирует процесс создания видео из изображения
   - Проверяет поддержку различных форматов изображений

4. **createVoiceAvatarTest.ts** - Тест для функции создания голосовых аватаров
   - Проверяет правильность создания голосовых аватаров
   - Тестирует различные входные аудио-образцы

5. **textToSpeechTest.ts** - Тест для функции преобразования текста в речь
   - Тестирует синтез речи из текста с разными параметрами
   - Проверяет различные голоса и языки

6. **paymentProcessorTest.ts** - Тест для функции обработки платежей
   - Проверяет корректное пополнение баланса пользователя
   - Проверяет корректное списание средств с баланса пользователя
   - Тестирует обработку ошибок при недостаточном балансе
   - Проверяет корректность ведения истории операций

### Использование в тестах:

```typescript
// Пример запуска нескольких тестов Inngest функций
import { testTextToImage } from './textToImageTest'
import { testTextToVideo } from './textToVideoTest'
import { testPaymentProcessorIncome } from './paymentProcessorTest'

export async function runAllInngestTests() {
  const results = []
  
  // Запуск тестов последовательно
  results.push(await testTextToImage())
  results.push(await testTextToVideo())
  results.push(await testPaymentProcessorIncome())
  
  return results
}
```

## 🔄 Интеграция с основной системой тестирования

Тесты из этой директории интегрируются в общую систему тестирования через класс `InngestFunctionTester` и запускаются при выборе категории `inngest` при запуске тестов:

```bash
npm run test:inngest
```

или

```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=inngest
``` 