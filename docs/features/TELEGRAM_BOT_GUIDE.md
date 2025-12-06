# 💬 Telegram Bot Integration Guide

Двухсторонняя интеграция с Telegram для управления Autonomous Monitor.

## 🎯 Возможности

### Что бот умеет:

1. ✅ **Мониторинг в реальном времени**
   - Присылает уведомления об ошибках
   - Показывает метрики
   - Отслеживает anomalies

2. ✅ **Управление системой**
   - Запуск/остановка мониторинга
   - Перезапуск контейнеров
   - Настройка уведомлений

3. ✅ **Интерактивные подтверждения**
   - Одобрение auto-fix через кнопки
   - Подтверждение merge PR
   - Разрешение на рестарт

4. ✅ **AI-чат**
   - Режим общения с AI
   - Вопросы о системе
   - Анализ проблем

5. ✅ **Natural Language**
   - Понимает обычные фразы
   - Не нужно помнить команды

---

## 🚀 Быстрый Старт

### Шаг 1: Создать Telegram бота

```bash
# 1. Написать @BotFather в Telegram
# 2. Отправить /newbot
# 3. Следовать инструкциям
# 4. Получить токен

# Пример токена:
# 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789
```

### Шаг 2: Получить свой Telegram ID

```bash
# Написать @userinfobot
# Скопировать ID из ответа

# Пример ID:
# 123456789
```

### Шаг 3: Настроить переменные окружения

```bash
# Добавить в .env
cat >> .env <<EOF

# Telegram Bot Integration
MONITOR_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
ADMIN_TELEGRAM_ID=123456789
EOF
```

### Шаг 4: Установить зависимости и запустить

```bash
cd .claude/mcp-servers/autonomous-monitor

# Установить
npm install

# Собрать
npm run build

# Запустить бота
npm run start:bot

# Или запустить всё вместе (MCP + Bot)
npm run start:all
```

### Шаг 5: Начать общение

```
1. Найти своего бота в Telegram
2. Отправить /start
3. Готово! 🎉
```

---

## 📱 Команды Бота

### Основные команды

```
/start          - Приветствие и помощь
/help           - Список всех команд
/status         - Текущий статус системы
/errors         - Последние ошибки
/metrics        - Метрики производительности
```

### Управление мониторингом

```
/monitor_start  - Начать мониторинг
/monitor_stop   - Остановить мониторинг
/restart        - Перезапустить контейнер (требует подтверждения)
```

### AI и аналитика

```
/chat           - Режим чата с AI
/ask <вопрос>   - Задать вопрос о системе
/exit           - Выйти из режима чата
```

### Настройки

```
/settings       - Настройки уведомлений
```

---

## 💬 Примеры Использования

### Пример 1: Проверить статус

**Ты пишешь:**
```
/status
```

**Бот отвечает:**
```
🟢 Статус Мониторинга

Состояние: Активен
Обнаружено ошибок: 15
Последних ошибок: 3

📊 Метрики:
- CPU: 45.2%
- Memory: 68.3%
- Error Rate: 0.02/s

🧠 ML Anomaly Detection
- Алгоритм: IsolationForest
- Данных: 245 точек

Используй /errors для просмотра ошибок
```

### Пример 2: Просмотр ошибок

**Ты пишешь:**
```
/errors
```

**Бот отвечает:**
```
🚨 Последние 3 ошибок:

1. 🔴 MODULE_NOT_FOUND
⏰ 15:30:45
📝 `Cannot find module '@/services/video'`

2. 🟠 TYPE_ERROR
⏰ 15:28:12
📝 `Cannot read property 'map' of undefined`

3. 🟡 UNHANDLED_REJECTION
⏰ 15:25:03
📝 `UnhandledPromiseRejectionWarning: Error: ECONNREFUSED`

Используй /fix <номер> для исправления
```

**С кнопками:**
- 🔧 Auto-Fix All
- 📊 Показать графики

### Пример 3: Auto-Fix с подтверждением

**Нажимаешь:** 🔧 Auto-Fix All

**Бот спрашивает:**
```
🔧 Auto-Fix: 2 ошибок

1. MODULE_NOT_FOUND
2. TYPE_ERROR

Создам ветки, применю фиксы и создам PR.

Подтверждаешь?

[✅ Да, исправить]  [❌ Отмена]
```

**Нажимаешь:** ✅ Да, исправить

**Бот выполняет:**
```
🔧 Начинаю auto-fix процесс...

✅ Обрабатываю: MODULE_NOT_FOUND

1. Создаю ветку: `autofix/module-not-found-1731242445`
2. Анализирую ошибку...
3. Применяю исправление...
4. Тестирую...
5. Создаю PR...

Статус: В процессе...

---

✅ Auto-fix завершен!

Создано PR: #123
Ветка: `autofix/module-not-found-1731242445`

Проверь PR и смержи если всё ОК:
https://github.com/your-repo/pull/123
```

### Пример 4: Чат с AI

**Ты пишешь:**
```
/chat
```

**Бот отвечает:**
```
💬 Режим чата активирован

Теперь можешь задавать мне любые вопросы о системе:
- "Что происходит с сервером?"
- "Почему так много ошибок?"
- "Какие метрики выглядят подозрительно?"
- "Что рекомендуешь сделать?"

Используй /exit чтобы выйти из режима чата.
```

**Ты пишешь:**
```
Почему так много ошибок MODULE_NOT_FOUND?
```

**Бот анализирует и отвечает:**
```
🤖 Анализ ошибок MODULE_NOT_FOUND:

Обнаружено 8 таких ошибок за последние 2 часа.

Причины:
1. Проблема с TypeScript path aliases (@/)
2. Недавние изменения в src/services/video.ts
3. Docker контейнер собран без обновленного build

Рекомендации:
✅ Пересобрать с npm run build:alias
✅ Проверить tsconfig.json paths
✅ Docker rebuild с --no-cache

Хочешь чтобы я автоматически исправил?

[🔧 Да, исправить]  [📋 Подробнее]
```

### Пример 5: Natural Language

Бот понимает обычные фразы:

**Ты пишешь:**
```
Как дела?
```

**Бот:**
```
🟢 Статус Мониторинга

Состояние: Активен
...
```

**Ты пишешь:**
```
Покажи ошибки
```

**Бот:**
```
🚨 Последние 10 ошибок:
...
```

**Ты пишешь:**
```
Запусти мониторинг
```

**Бот:**
```
🚀 Запускаю мониторинг...
✅ Мониторинг запущен!
```

---

## 🔔 Уведомления в Реальном Времени

### Когда обнаружена ошибка:

```
🔴 Ошибка обнаружена!

Тип: MODULE_NOT_FOUND
Severity: critical
Время: 15:30:45

```
Cannot find module '@/services/video'
    at Function.Module._resolveFilename
    at Function.Module._load
```

Что делать?

[🔧 Auto-Fix]  [📋 Подробнее]  [🤷 Игнорировать]
```

### Когда обнаружена anomaly:

```
🔍 Anomaly Detected!

Confidence: 95%
Score: 0.85

Метрики:
- CPU: 78.5%
- Memory: 85.2%
- Error Rate: 0.15/s

Требуется внимание?

[🔍 Investigate]  [🔇 Ignore]
```

### Когда превышен threshold:

```
💾 Threshold Exceeded!

Метрика: memory
Значение: 90.5%
Порог: 85.0%

Рекомендую проверить систему.
```

---

## ⚙️ Настройки Уведомлений

### Уровни уведомлений:

**Critical Only** (по умолчанию)
- Только критичные ошибки
- Anomaly detection
- Threshold exceeded
- Auto-fix результаты

**All Errors**
- Все типы ошибок
- Включая warnings и info

**Mute Anomalies**
- Отключить уведомления об anomaly
- Только критичные ошибки

**Weekly Report**
- Еженедельный отчет
- Статистика за неделю

### Изменить настройки:

```
/settings
```

Выбрать нужный режим из кнопок.

---

## 🔐 Безопасность

### Авторизация

Бот работает **только для admin**:

```typescript
// Встроенная проверка
if (userId !== ADMIN_ID) {
  await ctx.reply('❌ Unauthorized');
  return;
}
```

Все остальные пользователи получат отказ.

### Подтверждения

Критичные действия требуют подтверждения:

- ✅ Auto-fix (подтверждение через кнопки)
- ✅ Merge PR (подтверждение)
- ✅ Restart container (подтверждение)
- ✅ Deploy (подтверждение)

### Audit Trail

Все действия логируются:

```json
{
  "timestamp": "2025-11-10T15:30:45Z",
  "user_id": 123456789,
  "action": "approved_autofix",
  "data": {
    "errors": ["MODULE_NOT_FOUND"],
    "branch": "autofix/module-not-found-1731242445"
  }
}
```

---

## 🧪 Тестирование

### Тест 1: Проверить подключение

```bash
# В Telegram
/start

# Ожидаемый ответ:
# 🤖 Autonomous Monitor Bot
# Я твой AI-ассистент...
```

### Тест 2: Проверить статус

```bash
/status

# Должен показать текущий статус
```

### Тест 3: Проверить уведомления

```bash
# Вызвать тестовую ошибку на сервере
ssh root@212.86.115.30 'docker logs 999-multibots --tail 1'

# Бот должен прислать уведомление
```

---

## 📊 Примеры Workflow

### Workflow 1: Утренняя проверка

```
Ты: /status
Бот: 🟢 Всё работает, 2 ошибки

Ты: /errors
Бот: [Показывает 2 warning]

Ты: Игнорировать
```

### Workflow 2: Критичная ошибка

```
[15:30] Бот: 🔴 MODULE_NOT_FOUND обнаружена!

Ты: [Нажимаешь Auto-Fix]

Бот: Подтверждаешь?
Ты: [Нажимаешь ✅ Да]

[15:32] Бот: ✅ PR #123 создан

Ты: [Проверяешь PR, мержишь]

[15:40] Бот: ✅ Деплой завершен
```

### Workflow 3: Anomaly Investigation

```
[03:15] Бот: 🔍 Anomaly! Memory 90%

[08:00] Ты: /chat
Ты: Что случилось ночью с памятью?

Бот: Обнаружен memory leak...
Бот: Рекомендую перезапуск

Ты: /restart
Ты: [Подтверждаешь]

Бот: ✅ Перезапущено
```

---

## 🔧 Troubleshooting

### Бот не отвечает

**Проверка 1: Бот запущен?**
```bash
ps aux | grep telegram-bot
```

**Проверка 2: Правильный токен?**
```bash
echo $MONITOR_BOT_TOKEN
# Должен показать токен вида: 1234567890:ABC...
```

**Проверка 3: Правильный ID?**
```bash
echo $ADMIN_TELEGRAM_ID
# Должен показать число вида: 123456789
```

**Перезапуск:**
```bash
cd .claude/mcp-servers/autonomous-monitor
npm run start:bot
```

### Уведомления не приходят

**Проверка подписки на события:**
```typescript
// В telegram-bot.ts должны быть:
monitor.on('error_detected', async (error) => { ... });
monitor.on('anomaly_detected', async (anomaly) => { ... });
```

**Проверка мониторинга:**
```bash
# В Telegram
/status

# Должно быть: Состояние: Активен
```

**Запустить мониторинг:**
```bash
/monitor_start
```

### Кнопки не работают

**Проверка callback handlers:**
```typescript
bot.action('autofix_all', async (ctx) => { ... });
bot.action(/^approve_(.+)$/, async (ctx) => { ... });
```

**Очистить старые updates:**
```bash
# Перезапустить бота
pkill -f telegram-bot
npm run start:bot
```

---

## 🚀 Advanced: Интеграция с Claude API

Для полноценного AI-чата можно интегрировать Claude API:

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function chatWithAI(message: string, context: any): Promise<string> {
  const systemPrompt = `
Ты - AI-ассистент для мониторинга production сервера.

Текущий статус:
- Errors: ${monitor.getStatus().errorCount}
- Monitoring: ${monitor.getStatus().isMonitoring}
- Metrics: ${JSON.stringify(monitor.getStatus().metrics)}

Анализируй вопросы пользователя и давай полезные рекомендации.
  `;

  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...context.history || [],
      { role: 'user', content: message }
    ]
  });

  return response.content[0].text;
}
```

---

## 📚 Дополнительно

### Документация
- **Quick Start**: `AUTONOMOUS_MONITOR_QUICKSTART.md`
- **Enhanced Features**: `ENHANCED_AUTONOMOUS_MONITOR.md`
- **System Summary**: `AUTONOMOUS_SYSTEM_SUMMARY.md`

### Исходники
- **Telegram Bot**: `.claude/mcp-servers/autonomous-monitor/telegram-bot.ts`
- **MCP Server**: `.claude/mcp-servers/autonomous-monitor/server.ts`
- **Enhanced Server**: `.claude/mcp-servers/autonomous-monitor/enhanced-server.ts`

---

✅ **Готово!** Теперь у тебя полноценная двухсторонняя связь с Autonomous Monitor через Telegram.

🤖 **Autonomous Monitor Telegram Bot** - Your Production Guardian in Telegram
