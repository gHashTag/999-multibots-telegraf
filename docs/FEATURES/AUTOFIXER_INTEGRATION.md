# GitHub Auto-Fixer Integration для Telegram Bot проекта

## 📋 Обзор

GitHub Auto-Fixer - это система автоматического исправления кода в Pull Request'ах, специально адаптированная для Telegram Bot проекта на базе Telegraf.js. Система анализирует код, выявляет типичные проблемы Bot разработки и автоматически их исправляет.

## 🏗️ Архитектура

```
src/
├── webhooks/                    # GitHub webhook обработчики
│   ├── github-autofixer.controller.ts
│   ├── github-autofixer.service.ts  
│   └── github-autofixer.middleware.ts
├── services/                    # Сервисы интеграции
│   ├── claude-integration.service.ts
│   ├── telegram-notifier.service.ts
│   ├── claude-bot-prompts.ts
│   └── bot-specific-fixes.ts
├── commands/autofixer/          # Bot команды управления
│   ├── autofixer.command.ts
│   └── autofixer-config.scene.ts
├── utils/
│   └── bot-code-analyzer.ts     # Анализатор Bot кода
└── api_server/routes/
    └── github-autofixer.routes.ts
```

## 🔧 Основные компоненты

### 1. GitHub Webhook Handler
**Файл:** `src/webhooks/github-autofixer.controller.ts`

Обрабатывает webhook'и от GitHub при открытии/обновлении PR:
- Валидирует подпись webhook'а
- Запускает анализ и исправление в фоне
- Отправляет уведомления в Telegram

### 2. Bot Code Analyzer
**Файл:** `src/utils/bot-code-analyzer.ts`

Анализирует код на наличие Bot-специфичных проблем:
- Missing async/await в Telegraf handlers
- Неправильные типы сцен
- Отсутствие обработки ошибок
- Проблемы с middleware

### 3. Bot-Specific Fixes Engine
**Файл:** `src/services/bot-specific-fixes.ts`

Применяет исправления для типичных проблем:
```typescript
// ❌ Было
bot.action('button', ctx => ctx.reply('Hello'))

// ✅ Стало  
bot.action('button', async (ctx) => await ctx.reply('Hello'))
```

### 4. Telegram Integration
**Файл:** `src/services/telegram-notifier.service.ts`

Отправляет уведомления о статусе автофиксера:
- Начало обработки PR
- Успешные исправления
- Ошибки обработки
- Статистика исправлений

## 🤖 Bot-специфичные исправления

### Async/Await Issues
```typescript
// Исправляет отсутствие async/await
bot.action('btn', ctx => ctx.reply('text'))          // ❌
bot.action('btn', async (ctx) => await ctx.reply('text'))  // ✅

// Исправляет scene transitions
ctx.scene.enter('next')                              // ❌  
await ctx.scene.enter('next')                        // ✅
```

### Scene Management
```typescript
// Добавляет правильные типы
new Scenes.BaseScene('scene')                        // ❌
new Scenes.BaseScene<MyContext>('scene')             // ✅

// Исправляет handlers
scene.enter(ctx => ctx.reply('Enter'))               // ❌
scene.enter(async (ctx) => await ctx.reply('Enter')) // ✅
```

### Error Handling
```typescript
// Добавляет обработку ошибок
async (ctx) => {
  ctx.reply('Hello')                                 // ❌
}

// Становится:
async (ctx) => {                                     // ✅
  try {
    await ctx.reply('Hello')
  } catch (error) {
    console.error('Bot error:', error)
    await ctx.reply('Произошла ошибка. Попробуйте позже.')
  }
}
```

## 📱 Telegram Commands

### Admin Commands
```
/autofixer_status    - 📊 Статус системы автофиксера
/fix_pr 123         - 🔧 Ручное исправление PR #123  
/autofixer_stats    - 📈 Статистика исправлений
/autofixer_config   - ⚙️ Настройки системы
```

### Notification Examples
```
🤖 AutoFixer Report

PR #47: "Add payment webhook handler"
┣ ❌ Найдено: 4 TypeScript errors
┣ 🔧 Исправлено: Missing imports, async/await
┣ ⏱ Время: 1m 34s  
┗ ✅ Status: All checks passed

🔗 https://github.com/username/bot/pull/47
```

## 🚀 Setup & Configuration

### 1. Environment Variables
```bash
# GitHub Integration
GITHUB_TOKEN=ghp_your_bot_repo_token
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_REPO_OWNER=your-github-username
GITHUB_REPO_NAME=your-bot-repository

# Claude Code API  
CLAUDE_API_KEY=sk-ant_your_claude_api_key

# Telegram Integration
BOT_TOKEN_1=your_telegram_bot_token
ADMIN_IDS=123456789,987654321
DEV_CHANNEL_ID=your_dev_channel_id

# AutoFixer Settings
BOT_AUTOFIXER_ENABLED=true
AUTOFIXER_NOTIFICATION_ENABLED=true
```

### 2. GitHub Webhook Setup
1. В настройках GitHub репозитория: Settings → Webhooks
2. Payload URL: `https://yourdomain.com/api/webhooks/github/pr-issues`
3. Content type: `application/json`  
4. Events: `Pull requests`
5. Secret: значение из `GITHUB_WEBHOOK_SECRET`

### 3. Integration with Bot
В файле `src/registerCommands.ts` добавьте:
```typescript
import { setupAutoFixerCommands } from './commands/autofixer/autofixer.command'
import { autoFixerConfigScene } from './commands/autofixer/autofixer-config.scene'

export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  // Существующий код...
  
  // Регистрация AutoFixer команд
  setupAutoFixerCommands(bot)
  
  // Добавление сцены конфигурации в stage
  stage.scene(autoFixerConfigScene)
}
```

## 🧪 Testing

### Запуск тестов
```bash
# Все тесты автофиксера
npm test -- __tests__/autofixer/

# Конкретный тест
npm test -- __tests__/autofixer/bot-code-analyzer.test.ts
```

### Test Coverage
- ✅ BotCodeAnalyzer - анализ Bot кода
- ✅ BotSpecificFixesEngine - применение исправлений  
- ✅ GitHubAutoFixerController - webhook обработка
- ✅ Integration tests - end-to-end тестирование

## 📊 Monitoring & Analytics

### Health Check
```bash
curl https://yourdomain.com/api/autofixer/health
```

Response:
```json
{
  "status": "healthy",
  "checks": {
    "github": true,
    "claude": true, 
    "telegram": true,
    "webhook_secret": true
  }
}
```

### Statistics API  
```bash
curl https://yourdomain.com/api/autofixer/stats
```

### Telegram Monitoring
Используйте команду `/autofixer_status` для получения статуса в Telegram.

## 🔒 Security

### Webhook Validation
- Проверка подписи GitHub webhook'ов через HMAC SHA-256
- Rate limiting для webhook endpoints
- Валидация заголовков GitHub

### Access Control
- Admin-only команды проверяют ADMIN_IDS
- Токены секретны и не логируются
- Безопасная обработка GitHub API токенов

## 🚨 Troubleshooting

### Common Issues

**1. Webhook не получен**
```bash
# Проверьте логи API сервера
docker logs bot-container | grep "GitHub Webhook"

# Проверьте GitHub webhook deliveries
```

**2. Claude API не работает**
```bash
# Проверьте API key
curl -H "Authorization: Bearer $CLAUDE_API_KEY" https://api.anthropic.com/v1/models
```

**3. Исправления не применяются**
```bash
# Проверьте логи анализатора
docker logs bot-container | grep "BotAnalyzer"
```

**4. Telegram уведомления не приходят**  
```bash
# Проверьте bot token и chat ID
/autofixer_status - покажет статус интеграций
```

### Debug Mode
Включите детальное логирование:
```bash
export DEBUG=autofixer:*
npm start
```

## 📈 Performance

### Benchmarks
- Анализ PR: ~2-5 секунд
- Применение исправлений: ~1-3 секунды  
- Telegram уведомления: ~0.5 секунд
- Memory usage: ~50MB дополнительно

### Optimization Tips
1. Кэширование результатов анализа
2. Batch обработка нескольких файлов
3. Ограничение размера анализируемых файлов
4. Rate limiting для GitHub API

## 🔄 Future Improvements

### Planned Features
- [ ] Web dashboard для управления
- [ ] Интеграция с CI/CD статусами  
- [ ] Машинное обучение для лучшего анализа
- [ ] Поддержка других языков (Python bots)
- [ ] Advanced metrics & alerting

### Contributing
1. Fork репозиторий
2. Создайте feature branch
3. Добавьте тесты для новой функциональности
4. Отправьте Pull Request с описанием изменений

## 📚 References

- [Telegraf.js Documentation](https://telegraf.js.org/)
- [GitHub Webhooks](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [Claude API Documentation](https://docs.anthropic.com/claude/reference/)
- [Bot Project Architecture](../CLAUDE.md)

---

🤖 **Generated with GitHub Auto-Fixer v1.0**  
For support: create issue in project repository