# Часто задаваемые вопросы (FAQ)

## Общие вопросы

### Что такое NeuroBlogger?
NeuroBlogger - это проект для создания и управления контентом блога с использованием нейронных сетей и интеграцией с Telegram.

### Какие технологии используются в проекте?
Основные технологии: Node.js, Telegraf.js, Supabase, Docker, Inngest.

### Как запустить проект локально?
```bash
# Клонировать репозиторий
git clone <url-репозитория>

# Установить зависимости
npm install

# Создать файл .env на основе .env.example
cp .env.example .env

# Запустить проект
npm run dev
```

## Платежная система

### Как работает расчет баланса пользователя?
Баланс пользователя рассчитывается динамически на основе записей в таблице `payments_v2` с помощью SQL-функции `get_user_balance`.

### Можно ли напрямую обновлять баланс пользователя в базе данных?
Нет, все изменения баланса должны происходить через центральный процессор платежей `payment/process`.

### Как добавить новый тип платежа?
1. Добавьте новый тип в перечисление `TransactionType`
2. Обновите логику обработки в файле `paymentProcessor.ts`
3. Добавьте обработку нового типа в SQL-функцию `get_user_balance`

### Как добавить новую платежную систему?
1. Создайте новый файл в директории `src/payment-systems/`
2. Реализуйте интерфейс `PaymentSystemInterface`
3. Зарегистрируйте новую систему в файле `src/payment-systems/index.ts`
4. Добавьте новый метод платежа в перечисление `PaymentMethod`

## Боты и Телеграм

### Как добавить нового бота?
Смотрите подробную инструкцию в файле `bot_setup.md`.

### Как настроить команды бота?
```typescript
// Настройка меню команд
await bot.telegram.setMyCommands([
  { command: 'start', description: 'Начать работу с ботом' },
  { command: 'help', description: 'Получить помощь' },
  // Другие команды...
]);
```

### Как обрабатывать команды?
```typescript
// Обработка команды /start
bot.command('start', async (ctx) => {
  await ctx.reply('Добро пожаловать!');
});

// Обработка команды /help
bot.command('help', async (ctx) => {
  await ctx.reply('Чем могу помочь?');
});
```

## Тестирование

### Как запустить тесты?
```bash
# Запуск всех тестов
npm run test:all

# Запуск тестов платежной системы
npm run test:payment
```

### Почему нельзя использовать Jest?
Проект использует собственный фреймворк для тестирования, который лучше подходит для специфики проекта. Jest может конфликтовать с этим фреймворком.

### Как написать новый тест?
```typescript
import { TestResult } from '../types';

export async function runMyTest(): Promise<TestResult> {
  try {
    // Реализация теста
    return {
      success: true,
      message: 'Тест успешно пройден',
      name: 'Мой тест'
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      name: 'Мой тест'
    };
  }
}
```

## Деплой и инфраструктура

### Как обновить приложение на сервере?
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
cd /opt/app/999-multibots-telegraf
git pull
docker-compose down
docker-compose up -d --build
```

### Как проверить логи?
```bash
# Логи приложения
docker logs 999-multibots

# Логи Nginx
docker logs bot-proxy
```

### Что делать при ошибке "Connection refused" в Nginx?
Проверьте IP-адрес контейнера с ботами:
```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots
```
Обновите IP-адрес в конфигурации Nginx и перезапустите:
```bash
./update-nginx-config.sh
```

## Разработка

### Как лучше структурировать новые функции?
1. Создайте новый модуль в соответствующей директории
2. Реализуйте функционал с учетом существующей архитектуры
3. Добавьте тесты в директорию `src/test-utils/tests/`
4. Обновите документацию в банке памяти

### Как добавить новую функцию Inngest?
```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ name: 'NeuroBlogger' });

export const myNewFunction = inngest.createFunction(
  { name: 'My New Function' },
  { event: 'my/new-event' },
  async ({ event, step }) => {
    // Реализация функции
  }
);
```

### Как работать с банком памяти?
Вы можете использовать следующие функции:
- `mcp_allpepper_memory_bank_memory_bank_read` - для чтения файлов
- `mcp_allpepper_memory_bank_memory_bank_write` - для создания новых файлов
- `mcp_allpepper_memory_bank_memory_bank_update` - для обновления существующих файлов
- `mcp_allpepper_memory_bank_list_project_files` - для просмотра списка файлов