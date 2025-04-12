# API и команды NeuroBlogger

## Telegram API

### Основные команды бота

- **/start** - Начало работы с ботом
- **/help** - Получение помощи
- **/status** - Проверка статуса
- **/improve** - Запрос на самоулучшение
- **/background** - Фоновые задачи улучшения
- **/check_tasks** - Мониторинг фоновых задач

### Интеграция с Telegram

Бот использует библиотеку Telegraf.js для взаимодействия с Telegram API:

```typescript
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.command('start', async (ctx) => {
  // Обработка команды /start
});

bot.command('help', async (ctx) => {
  // Обработка команды /help
});

// Настройка меню команд
await bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'help', description: 'Получить помощь' },
  // Другие команды...
]);
```

## Inngest API

### Основные события

- **payment/process** - Обработка платежей
- **user/register** - Регистрация пользователя
- **task/create** - Создание задачи
- **task/complete** - Завершение задачи

### Пример использования Inngest

```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ name: 'NeuroBlogger' });

// Пример функции для обработки платежей
export const paymentProcessor = inngest.createFunction(
  { name: 'Payment Processor' },
  { event: 'payment/process' },
  async ({ event, step }) => {
    // Обработка платежа
  }
);
```

## Supabase API

### Основные таблицы

- **users** - Пользователи
- **payments_v2** - Платежи
- **tasks** - Задачи
- **blog_posts** - Посты блога

### Пример использования Supabase

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Пример запроса к базе данных
async function getUserByTelegramId(telegramId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  
  if (error) throw error;
  return data;
}
```

## Docker API

### Основные команды

```bash
# Запуск проекта
docker-compose up --build -d

# Остановка проекта
docker-compose down

# Запуск тестов
docker-compose -f docker-compose.test.yml up --build -d

# Просмотр логов
docker logs -f neuro-blogger-telegram-bot
```

## Команды SSH

```bash
# Подключение к серверу
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app

# Переход в директорию проекта
cd /opt/app/999-multibots-telegraf

# Перезапуск проекта
docker compose down
docker-compose up --build -d
```

## MCP API

### Доступные MCP сервисы

```json
{
  "mcpServers": {
    "googlesheets_composio": {
      "url": "https://mcp.composio.dev/googlesheets/sour-old-lion-KK2T7-"
    },
    "googlesuper_composio": {
      "url": "https://mcp.composio.dev/googlesuper/calm-damp-magician-B-f2iC"
    },
    "supabase_composio": {
      "url": "https://mcp.composio.dev/supabase/calm-damp-magician-B-f2iC"
    },
    "gmail_composio": {
      "url": "https://mcp.composio.dev/gmail/calm-damp-magician-B-f2iC"
    },
    "telegram-mcp": {
      "command": "telegram-mcp",
      "env": {
        "TG_APP_ID": "94892",
        "TG_API_HASH": "cacf9ad137d228611b49b2ecc6d68d43"
      }
    },
    "googlemeet_composio": {
      "url": "https://mcp.composio.dev/googlemeet/calm-damp-magician-B-f2iC"
    },
    "youtube_composio": {
      "url": "https://mcp.composio.dev/youtube/calm-damp-magician-B-f2iC"
    },
    "github_composio": {
      "url": "https://mcp.composio.dev/github/calm-damp-magician-B-f2iC"
    }
  }
}