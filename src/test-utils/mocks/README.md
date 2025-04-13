# Модуль мок-функций для тестирования

Этот модуль предоставляет инструменты для создания и использования мок-функций в тестах проекта. Модуль разработан как альтернатива `jest.fn()` для собственной системы тестирования.

## Основные возможности

- Создание мок-функций с отслеживанием вызовов
- Настройка возвращаемых значений
- Настройка асинхронных резолвов и реджектов (Promise)
- Настройка пользовательских реализаций
- Сброс и очистка истории вызовов
- Полная типизация для TypeScript

## Использование

### Создание базовой мок-функции

```typescript
import { createMockFn } from '../mocks/mockFn'

// Создаем мок-функцию
const mockFn = createMockFn()

// Вызываем функцию с аргументами
mockFn(1, 2, 3)

// Проверяем, была ли функция вызвана
console.log(mockFn.mock.calls.length) // 1

// Проверяем аргументы вызова
console.log(mockFn.mock.calls[0]) // [1, 2, 3]
```

### Настройка возвращаемого значения

```typescript
const mockWithReturn = createMockFn()
mockWithReturn.mockReturnValue('test result')

const result = mockWithReturn() // 'test result'
```

### Работа с асинхронными значениями

```typescript
// Мок, который резолвит Promise
const mockWithPromise = createMockFn()
mockWithPromise.mockResolvedValue('async result')

const promiseResult = await mockWithPromise() // 'async result'

// Мок, который реджектит Promise
const mockWithReject = createMockFn()
mockWithReject.mockRejectedValue(new Error('test error'))

try {
  await mockWithReject()
} catch (error) {
  console.log(error.message) // 'test error'
}
```

### Настройка собственной реализации

```typescript
const mockWithImpl = createMockFn()
mockWithImpl.mockImplementation((a, b) => a + b)

const result = mockWithImpl(5, 3) // 8
```

### Сброс состояния мока

```typescript
// Сброс всего состояния (вызовы и возвращаемое значение)
mockFn.mockReset()

// Сброс только истории вызовов
mockFn.mockClear()
```

### Типизация

Для улучшения типизации можно использовать тип `MockFunction`:

```typescript
import { createMockFn, MockFunction } from '../mocks/mockFn'

// Создаем типизированную мок-функцию
type MyFunction = (id: number, name: string) => boolean
const typedMock: MockFunction<MyFunction> = createMockFn()

// TypeScript будет проверять типы аргументов и возвращаемого значения
typedMock.mockReturnValue(true)
typedMock(1, 'test') // Всё в порядке
typedMock(1, 2) // Ошибка типизации - второй аргумент должен быть строкой
```

## Примеры тестов

Полный пример использования мок-функций в тестах можно найти в файле `src/test-utils/tests/mockFnTest.ts`.

## Интеграция с системой тестирования

Тесты для мок-функций интегрированы в общую систему тестирования проекта через файл `src/test-utils/tests/system/index.ts`. Для запуска тестов используйте команду:

```bash
npm run test:mock
```

Эта команда запустит тесты, которые проверяют все функциональные возможности модуля мок-функций. 