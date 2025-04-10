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

// Создание тестера
const tester = new InngestFunctionTester({
  verbose: true
})

// Экспорт функции для запуска теста
export async function testMyInngestFunction() {
  return tester.runTest({
    method: 'testSpecificFunction',
    data: {
      // Входные данные для теста
    }
  })
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

## 🔄 Интеграция с основной системой тестирования

Тесты из этой директории интегрируются в общую систему тестирования через класс `InngestFunctionTester` и запускаются при выборе категории `inngest` при запуске тестов:

```bash
npm run test:inngest
```

или

```bash
npx ts-node -r tsconfig-paths/register src/test-utils/index.ts --category=inngest
``` 