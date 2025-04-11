# 🤖 TelegrafBotTester

Класс для тестирования функциональности Telegram ботов на базе Telegraf.

## 📋 Обзор

`TelegrafBotTester` предоставляет инструменты для тестирования взаимодействия с Telegram ботами без необходимости отправки реальных запросов в API Telegram. Это позволяет создавать надежные и быстрые тесты для ваших ботов.

## 🛠️ Основные возможности

- Симуляция обмена сообщениями с ботом
- Создание и управление контекстами пользователей
- Проверка отправленных ботом сообщений и кнопок
- Симуляция нажатий на инлайн-кнопки
- Проверка перехода в сцены

## 🔧 Установка

TelegrafBotTester является частью внутренней тестовой инфраструктуры проекта. Отдельная установка не требуется.

## 📊 Пример использования

```typescript
import { TelegrafBotTester } from '@/test-utils/testers/TelegrafBotTester'

// Создание тестера
const botTester = new TelegrafBotTester('my_test_bot')

// Симуляция сообщения от пользователя
const userId = 123456789
await botTester.simulateMessage(userId, '/start')

// Проверка ответа бота
if (botTester.hasMessageWithText(userId, 'Привет')) {
  console.log('Бот отправил приветственное сообщение')
}

// Проверка наличия кнопки
if (botTester.hasInlineButton(userId, 'Меню')) {
  console.log('Бот отправил кнопку меню')
}

// Симуляция нажатия на кнопку
await botTester.simulateInlineButtonClick(userId, 'Меню')

// Очистка сообщений пользователя
botTester.clearMessages(userId)
```

## 📚 API

### 🔍 Создание тестера

```typescript
// Создание тестера с указанием токена
const botTester = new TelegrafBotTester('test_token')
```

### 👤 Работа с контекстом пользователя

```typescript
// Создание нового контекста
const context = botTester.createUserContext(userId, {
  username: 'test_user',
  firstName: 'Test',
  lastName: 'User'
})

// Получение существующего или создание нового контекста
const context = botTester.getUserContext(userId)
```

### 📩 Симуляция сообщений

```typescript
// Симуляция сообщения от пользователя
await botTester.simulateMessage(userId, 'Привет, бот!')
```

### ✅ Проверка ответов

```typescript
// Получение всех отправленных сообщений
const messages = botTester.getSentMessages(userId)

// Проверка наличия сообщения с текстом
const hasGreeting = botTester.hasMessageWithText(userId, 'Привет')

// Проверка наличия инлайн-кнопки
const hasButton = botTester.hasInlineButton(userId, 'Начать')
```

### 👆 Симуляция действий пользователя

```typescript
// Симуляция нажатия на инлайн-кнопку
await botTester.simulateInlineButtonClick(userId, 'Начать')

// Симуляция нажатия на инлайн-кнопку с указанием callback_data
await botTester.simulateInlineButtonClick(userId, 'Начать', 'start_action')
```

### 🧹 Управление данными

```typescript
// Очистка сообщений пользователя
botTester.clearMessages(userId)
```

### 🎭 Проверка сцен

```typescript
// Проверка, находится ли пользователь в указанной сцене
const isInScene = botTester.isInScene(userId, 'welcome')
```

## 📝 Рекомендации по тестированию

1. **Создавайте изолированные тесты** - каждый тест должен быть независимым
2. **Очищайте сообщения** между тестами, чтобы избежать "загрязнения" данных
3. **Используйте уникальные ID пользователей** для разных тестов
4. **Проверяйте как положительные, так и отрицательные сценарии**

## 📋 Полный пример теста

```typescript
import { logger } from '@/utils/logger'
import { TelegrafBotTester } from '@/test-utils/testers/TelegrafBotTester'
import { TestResult } from '@/test-utils/types'

export async function testBotBasicInteraction(): Promise<TestResult> {
  try {
    // Создание тестера
    const botTester = new TelegrafBotTester('test_token')
    const userId = 123456789

    // Тест команды /start
    await botTester.simulateMessage(userId, '/start')
    
    // Проверка приветствия
    if (!botTester.hasMessageWithText(userId, 'Привет')) {
      throw new Error('Бот не отправил приветственное сообщение')
    }
    
    // Проверка кнопки
    if (!botTester.hasInlineButton(userId, 'Меню')) {
      throw new Error('Бот не отправил кнопку меню')
    }
    
    // Успешное завершение теста
    return {
      success: true,
      name: 'Bot Basic Interaction Test',
      message: 'Тест успешно пройден'
    }
  } catch (error) {
    return {
      success: false,
      name: 'Bot Basic Interaction Test',
      message: `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}
```

## 🔗 Интеграция с другими тестовыми утилитами

TelegrafBotTester отлично интегрируется с другими тестовыми инструментами проекта:

- **InngestFunctionTester** - для тестирования Inngest-функций
- **PaymentTester** - для тестирования платежных систем
- **SupabaseTester** - для тестирования взаимодействия с базой данных

## 📊 Рекомендуемая структура тестов

```
src/test-utils/
├── testers/
│   ├── TelegrafBotTester.ts      # Класс для тестирования бота
│   └── ...
├── tests/
│   ├── bots/                    # Тесты для конкретных ботов
│   │   ├── avatarBotTest.ts     # Тесты аватар-бота
│   │   └── ...
│   └── ...
├── runAvatarBotTests.ts         # Скрипт запуска тестов аватар-ботов
└── ...
``` 