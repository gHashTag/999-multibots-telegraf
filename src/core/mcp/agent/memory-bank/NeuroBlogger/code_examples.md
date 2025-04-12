# Примеры кода для основных операций

## Работа с Telegram ботом

### Инициализация бота

```typescript
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

// Инициализация бота
const bot = new Telegraf(process.env.BOT_TOKEN);

// Обработчик команды /start
bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Я NeuroBlogger бот.');
});

// Обработчик текстовых сообщений
bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text;
  await ctx.reply(`Вы отправили: ${text}`);
});

// Запуск бота
bot.launch();
```

### Создание клавиатуры

```typescript
import { Markup } from 'telegraf';

// Создание инлайн-клавиатуры
const inlineKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('Создать пост', 'create_post'),
    Markup.button.callback('Мои посты', 'my_posts')
  ],
  [Markup.button.callback('Настройки', 'settings')]
]);

// Отправка сообщения с клавиатурой
await ctx.reply('Выберите действие:', inlineKeyboard);

// Обработка нажатия на кнопку
bot.action('create_post', async (ctx) => {
  await ctx.answerCbQuery(); // Убираем индикатор загрузки
  await ctx.reply('Создание нового поста...');
});
```

### Регистрация вебхука

```typescript
// Регистрация вебхука
await bot.telegram.setWebhook(`${process.env.HOST_URL}/${bot.botInfo.username}`);

// Настройка веб-сервера для обработки вебхуков
import express from 'express';
const app = express();

app.use(express.json());

// Настройка обработчика вебхуков для конкретного бота
app.post(`/${bot.botInfo.username}`, (req, res) => {
  bot.handleUpdate(req.body, res);
});

app.listen(3000, () => {
  console.log('Webhook server started on port 3000');
});
```

## Работа с Supabase

### Инициализация клиента

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
```

### Получение данных

```typescript
// Получение всех пользователей
async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');
  
  if (error) {
    console.error('Ошибка при получении пользователей:', error);
    return [];
  }
  
  return data;
}

// Получение конкретного пользователя
async function getUserByTelegramId(telegramId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  
  if (error) {
    console.error('Ошибка при получении пользователя:', error);
    return null;
  }
  
  return data;
}
```

### Добавление данных

```typescript
// Добавление нового пользователя
async function createUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select();
  
  if (error) {
    console.error('Ошибка при создании пользователя:', error);
    return null;
  }
  
  return data[0];
}
```

### Обновление данных

```typescript
// Обновление данных пользователя
async function updateUser(telegramId, userData) {
  const { data, error } = await supabase
    .from('users')
    .update(userData)
    .eq('telegram_id', telegramId)
    .select();
  
  if (error) {
    console.error('Ошибка при обновлении пользователя:', error);
    return null;
  }
  
  return data[0];
}
```

### Удаление данных

```typescript
// Удаление пользователя
async function deleteUser(telegramId) {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('telegram_id', telegramId);
  
  if (error) {
    console.error('Ошибка при удалении пользователя:', error);
    return false;
  }
  
  return true;
}
```

### Выполнение SQL-функции

```typescript
// Получение баланса пользователя
async function getUserBalance(telegramId) {
  const { data, error } = await supabase
    .rpc('get_user_balance', {
      user_telegram_id: telegramId
    });
  
  if (error) {
    console.error('Ошибка при получении баланса пользователя:', error);
    return 0;
  }
  
  return data;
}
```

## Работа с платежной системой

### Создание платежа

```typescript
// Создание платежа через Inngest
async function createPayment(params) {
  try {
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: params.telegramId,
        amount: params.amount,
        type: 'money_income',
        description: params.description,
        bot_name: params.botName,
        service_type: params.serviceType
      }
    });
    
    return true;
  } catch (error) {
    console.error('Ошибка при создании платежа:', error);
    return false;
  }
}
```

### Списание средств

```typescript
// Списание средств с баланса пользователя
async function deductFunds(params) {
  try {
    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: params.telegramId,
        amount: params.amount, // Положительное число
        type: 'money_expense',
        description: params.description,
        bot_name: params.botName,
        service_type: params.serviceType
      }
    });
    
    return true;
  } catch (error) {
    console.error('Ошибка при списании средств:', error);
    return false;
  }
}
```

### Проверка существующего платежа

```typescript
// Проверка существующего платежа по operation_id
async function checkExistingPayment(operationId) {
  const { data, error } = await supabase
    .from('payments_v2')
    .select('*')
    .eq('operation_id', operationId)
    .single();
  
  if (error) {
    console.error('Ошибка при проверке платежа:', error);
    return null;
  }
  
  return data;
}
```

## Работа с Inngest

### Создание функции обработки событий

```typescript
import { Inngest } from 'inngest';

const inngest = new Inngest({ name: 'NeuroBlogger' });

// Создание функции обработки событий
export const processPost = inngest.createFunction(
  { name: 'Process Blog Post' },
  { event: 'blog/post.created' },
  async ({ event, step }) => {
    // Получение данных из события
    const { postId, telegramId, text } = event.data;
    
    // Выполнение шагов с возможностью повторных попыток
    const processedText = await step.run('process-text', async () => {
      // Обработка текста поста
      return processTextWithAI(text);
    });
    
    // Сохранение результатов
    await step.run('save-results', async () => {
      return saveProcessedPost(postId, processedText);
    });
    
    // Отправка уведомления пользователю
    await step.run('notify-user', async () => {
      return notifyUserAboutPost(telegramId, postId);
    });
    
    return { postId, status: 'processed' };
  }
);
```

### Отправка события

```typescript
// Отправка события создания поста
async function createPost(telegramId, text) {
  try {
    // Сохранение поста в базе данных
    const post = await savePostToDatabase(telegramId, text);
    
    // Отправка события для обработки
    await inngest.send({
      name: 'blog/post.created',
      data: {
        postId: post.id,
        telegramId,
        text
      }
    });
    
    return post.id;
  } catch (error) {
    console.error('Ошибка при создании поста:', error);
    return null;
  }
}
```

## Работа с тестами

### Создание теста

```typescript
import { TestResult } from '../types';
import { logger } from '../logger';

// Функция тестирования
export async function testUserCreation(): Promise<TestResult> {
  logger.info('🚀 Начало теста создания пользователя');
  
  try {
    // Создание тестовых данных
    const telegramId = `test_${Date.now()}`;
    const userData = {
      telegram_id: telegramId,
      username: 'test_user',
      first_name: 'Test',
      last_name: 'User'
    };
    
    // Выполнение тестируемой функции
    const user = await createUser(userData);
    
    // Проверка результатов
    if (!user) {
      throw new Error('Пользователь не был создан');
    }
    
    if (user.telegram_id !== telegramId) {
      throw new Error('ID пользователя не совпадает');
    }
    
    // Очистка тестовых данных
    await deleteUser(telegramId);
    
    logger.info('✅ Тест создания пользователя успешно пройден');
    
    return {
      success: true,
      message: 'Пользователь успешно создан и удален',
      name: 'testUserCreation'
    };
  } catch (error) {
    logger.error('❌ Ошибка в тесте создания пользователя:', error);
    
    return {
      success: false,
      message: error.message,
      name: 'testUserCreation'
    };
  }
}
```

### Запуск тестов

```typescript
import { runTests } from './test-utils';
import { testUserCreation } from './tests/user-tests';
import { testPaymentCreation } from './tests/payment-tests';

// Запуск набора тестов
async function runAllTests() {
  const results = await runTests([
    testUserCreation,
    testPaymentCreation
  ]);
  
  // Вывод результатов
  console.log(`Успешно: ${results.filter(r => r.success).length}`);
  console.log(`Неудачно: ${results.filter(r => !r.success).length}`);
  
  return results;
}

runAllTests().catch(console.error);
```