# Тестирование Inngest-функций в проекте

Этот документ описывает правила и подходы к тестированию Inngest-функций в проекте с использованием кастомного тестового движка `InngestTestEngine`.

## Содержание

1. [Введение](#введение)
2. [Основы тестирования Inngest](#основы-тестирования-inngest)
3. [Тестовый движок InngestTestEngine](#тестовый-движок-inngesttestengine)
4. [Создание тестов](#создание-тестов)
5. [Отправка и обработка событий](#отправка-и-обработка-событий)
6. [Проверка результатов](#проверка-результатов)
7. [Примеры тестов](#примеры-тестов)
8. [Лучшие практики](#лучшие-практики)

## Введение

Тестирование Inngest-функций в проекте осуществляется с помощью кастомного тестового движка `InngestTestEngine`, который позволяет эмулировать отправку событий и выполнять функции без реального взаимодействия с Inngest API. Это дает возможность тестировать логику обработки событий в изолированной среде.

## Основы тестирования Inngest

В нашем проекте Inngest используется для обработки асинхронных событий, таких как платежи, создание контента, отправка уведомлений и других операций, которые требуют надежного асинхронного выполнения. Для тестирования Inngest-функций мы используем:

1. Мок Inngest клиента для отправки событий
2. Тестовый движок для эмуляции выполнения функций
3. Моки зависимостей для изоляции от внешних сервисов

## Тестовый движок InngestTestEngine

Тестовый движок `InngestTestEngine` предоставляет следующие возможности:

1. Регистрация функций для обработки определенных событий
2. Отправка тестовых событий
3. Синхронное выполнение асинхронных функций для тестирования
4. Отслеживание отправленных событий
5. Имитация шагов выполнения
6. Обработка ошибок и возврат результатов

### Основные методы

- `register(eventName, handler)` - регистрирует обработчик для события
- `sendEvent(eventName, data)` - отправляет событие в тестовый движок
- `execute({ events })` - выполняет функцию с заданными событиями
- `getEvents()` - получает все отправленные события
- `getEventsByName(name)` - получает события по имени
- `getEventsForTelegramId(telegramId)` - получает события для конкретного пользователя
- `clearEvents()` - очищает историю событий

## Создание тестов

Для создания теста Inngest-функции следуйте этим шагам:

1. Импортируйте зависимости:

```typescript
import { inngestTestEngine } from '../../test-config'
import { TestResult } from '../../types'
import { PaymentProcessEvent } from '../types'
```

2. Создайте тестовую функцию:

```typescript
export async function testInngestFunction(): Promise<TestResult> {
  try {
    // Очистка истории событий
    inngestTestEngine.clearEvents()
    
    // Создание тестового события
    const testEvent = {
      name: 'test/event',
      data: {
        // тестовые данные
      }
    }
    
    // Отправка события
    await inngestTestEngine.sendEvent(testEvent.name, testEvent.data)
    
    // Проверка результатов
    const events = inngestTestEngine.getEventsByName('test/event')
    if (events.length === 0) {
      return {
        success: false,
        name: 'Inngest Test',
        message: 'Событие не было добавлено в историю'
      }
    }
    
    return {
      success: true,
      name: 'Inngest Test',
      message: 'Тест успешно выполнен'
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Inngest Test',
      message: `Ошибка: ${error.message}`
    }
  }
}
```

3. Экспортируйте функцию запуска тестов:

```typescript
export async function runInngestTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  results.push(await testInngestFunction())
  return results
}
```

## Отправка и обработка событий

Для тестирования цепочек событий можно использовать более сложные сценарии:

```typescript
// Создание последовательности событий
const events = [
  { name: 'event1', data: { /* данные */ } },
  { name: 'event2', data: { /* данные */ } }
]

// Последовательное выполнение
for (const event of events) {
  await inngestTestEngine.sendEvent(event.name, event.data)
}

// Проверка результатов
const allEvents = inngestTestEngine.getAllEvents()
```

## Проверка результатов

Для проверки результатов тестирования используйте следующие методы:

```typescript
// Получение всех событий
const allEvents = inngestTestEngine.getAllEvents()

// Получение событий по имени
const paymentEvents = inngestTestEngine.getEventsByName('payment/process')

// Получение событий для пользователя
const userEvents = inngestTestEngine.getEventsForTelegramId('123456789')

// Вывод информации о событиях
inngestTestEngine.printEvents('События после выполнения теста:')
```

## Примеры тестов

### Базовый тест отправки события

```typescript
export async function testBasicEvent(): Promise<TestResult> {
  try {
    inngestTestEngine.clearEvents()
    
    await inngestTestEngine.sendEvent('test/event', {
      message: 'Test message',
      timestamp: Date.now()
    })
    
    const events = inngestTestEngine.getEventsByName('test/event')
    
    return {
      success: events.length > 0,
      name: 'Basic Event Test',
      message: events.length > 0 
        ? 'Событие успешно отправлено' 
        : 'Ошибка отправки события'
    }
  } catch (error: any) {
    return {
      success: false,
      name: 'Basic Event Test',
      message: `Ошибка: ${error.message}`
    }
  }
}
```

### Тест с расширенной конфигурацией Inngest

```typescript
import { InngestTestEngine } from '@inngest/test'

// Создание тестового движка с заданными обработчиками
const testEngine = new InngestTestEngine({
  function: myFunction,
  steps: [
    {
      id: 'step-1',
      handler: async () => {
        // Логика шага
        return { result: 'success' }
      }
    }
  ]
})

// Выполнение теста
const result = await testEngine.execute({
  events: [{ name: 'event', data: { /* данные */ } }]
})
```

## Лучшие практики

1. **Изоляция тестов**: Всегда очищайте историю событий перед каждым тестом
2. **Моки зависимостей**: Используйте моки для внешних зависимостей, таких как Supabase
3. **Проверка результатов**: Тщательно проверяйте результаты выполнения, включая промежуточные шаги
4. **Логирование**: Используйте логгер с эмодзи для улучшения читаемости логов
5. **Тестирование ошибок**: Проверяйте корректную обработку ошибочных ситуаций
6. **Документирование**: Добавляйте JSDoc комментарии к тестовым функциям

## Заключение

Тестирование Inngest-функций с помощью `InngestTestEngine` позволяет эффективно проверять логику обработки событий в изолированной среде. Следуйте рекомендациям из этого документа для создания надежных и информативных тестов.

При возникновении вопросов обращайтесь к команде разработки или к документации Inngest. 