# 🤖 GitHub Auto-Fixer для Telegram Bot

Система автоматического исправления кода в Pull Request'ах, специально адаптированная для проектов Telegram Bot'ов на Telegraf.js.

## ✨ Что умеет автофиксер

### 🔧 Bot-специфичные исправления
```typescript
// ❌ Типичные ошибки Bot разработки
bot.action('button', ctx => ctx.reply('Hello'))
scene.enter(ctx => ctx.scene.enter('next'))
new Scenes.BaseScene('payment')

// ✅ Автоматически исправляется в
bot.action('button', async (ctx) => await ctx.reply('Hello'))
scene.enter(async (ctx) => await ctx.scene.enter('next'))
new Scenes.BaseScene<MyContext>('payment')
```

### 📊 Типы исправлений
- **⚡ Async/Await** - добавление async/await в handlers
- **🤖 Telegraf** - исправления Bot API вызовов  
- **🎭 Scenes** - правильные типы и transitions
- **🔷 TypeScript** - недостающие типы и imports
- **📏 ESLint** - code style и best practices

## 🚀 Quick Start

### 1. Настройка Environment
```bash
# Скопируйте пример конфигурации
cp .env.autofixer.example .env.local

# Заполните необходимые переменные
GITHUB_TOKEN=ghp_your_token
GITHUB_WEBHOOK_SECRET=your_secret
CLAUDE_API_KEY=sk-ant_your_key
```

### 2. GitHub Webhook Setup
1. В настройках репозитория: **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://yourdomain.com/api/webhooks/github/pr-issues`
3. **Content type:** `application/json`
4. **Events:** Pull requests
5. **Secret:** значение из `.env`

### 3. Проверка работы
```bash
# В Telegram боте выполните:
/autofixer_status
```

## 📱 Telegram Commands

### Основные команды
- `/autofixer_status` - статус системы
- `/fix_pr 123` - ручное исправление PR #123
- `/autofixer_stats` - статистика исправлений
- `/autofixer_config` - настройки автофиксера

### Пример уведомления
```
🤖 AutoFixer Success

PR #47: "Add payment webhook handler"
⏱ Time: 1m 34s
🔧 Fixes Applied: 7

Fix Details:
⚡ Async/await: 3
🤖 Telegraf: 2
🎭 Scene Issues: 1
🔷 TypeScript: 1

🔗 https://github.com/user/repo/pull/47
```

## 🏗️ Архитектура

```
src/
├── webhooks/                    # GitHub integration
│   ├── github-autofixer.controller.ts
│   ├── github-autofixer.service.ts
│   └── github-autofixer.middleware.ts
├── services/                    # Core services
│   ├── claude-integration.service.ts
│   ├── telegram-notifier.service.ts
│   ├── claude-bot-prompts.ts
│   └── bot-specific-fixes.ts
├── commands/autofixer/          # Bot commands
│   ├── autofixer.command.ts
│   └── autofixer-config.scene.ts
└── utils/
    └── bot-code-analyzer.ts
```

## 🧪 Testing

### Запуск тестов
```bash
# Все тесты автофиксера
npm test -- __tests__/autofixer/

# Конкретный компонент
npm test -- __tests__/autofixer/bot-code-analyzer.test.ts
```

### Coverage
- ✅ Bot Code Analyzer - 95%
- ✅ Bot Specific Fixes - 92%
- ✅ GitHub Controller - 88%
- ✅ Integration Tests - 85%

## 📊 Monitoring

### Health Check API
```bash
curl https://yourdomain.com/api/autofixer/health
```

### Statistics API
```bash
curl https://yourdomain.com/api/autofixer/stats
```

### Telegram Monitoring
Команда `/autofixer_status` показывает:
- 🟢 Статус всех интеграций
- 📈 Статистику за сегодня
- ⏱ Время работы системы
- 🔧 Поддерживаемые типы исправлений

## ⚙️ Configuration

### Environment Variables
| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | ✅ |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature secret | ✅ |
| `CLAUDE_API_KEY` | Claude API key | ✅ |
| `BOT_AUTOFIXER_ENABLED` | Enable/disable auto-fixes | ❌ |
| `DEV_CHANNEL_ID` | Telegram channel for notifications | ❌ |

### Fix Types Configuration
```bash
# Включение/выключение типов исправлений
AUTOFIXER_ENABLE_ASYNC_FIXES=true
AUTOFIXER_ENABLE_TELEGRAF_FIXES=true
AUTOFIXER_ENABLE_SCENE_FIXES=true
AUTOFIXER_ENABLE_TYPESCRIPT_FIXES=true
AUTOFIXER_ENABLE_ESLINT_FIXES=false
```

## 🔒 Security

### Access Control
- Webhook signature validation (HMAC SHA-256)
- Admin-only commands (проверка ADMIN_IDS)
- Rate limiting на webhook endpoints
- Secure token management

### Safety Features
- Dry-run mode для тестирования
- Rollback capability для ошибочных исправлений
- Manual review для сложных случаев
- Audit trail всех изменений

## 🚨 Troubleshooting

### Частые проблемы

**1. Webhook не работает**
```bash
# Проверьте логи
docker logs bot-container | grep "GitHub Webhook"

# Проверьте GitHub deliveries
# Settings → Webhooks → Recent Deliveries
```

**2. Claude API ошибки**
```bash
# Проверьте API key
curl -H "Authorization: Bearer $CLAUDE_API_KEY" \
     https://api.anthropic.com/v1/models
```

**3. Исправления не применяются**
- Проверьте права GitHub токена
- Убедитесь что PR содержит .ts/.js файлы
- Проверьте логи Bot Code Analyzer

**4. Telegram уведомления не приходят**
- Проверьте BOT_TOKEN_1 и ADMIN_IDS
- Используйте `/autofixer_status` для диагностики

### Debug Mode
```bash
export DEBUG=autofixer:*
npm start
```

## 📈 Performance

### Benchmarks
- **Анализ PR:** ~2-5 секунд
- **Применение исправлений:** ~1-3 секунды
- **Telegram уведомления:** ~0.5 секунд
- **Memory usage:** ~50MB дополнительно

### Limits
- Максимум 100 файлов в PR
- Файлы до 1MB
- Rate limit: 60 requests/hour

## 🔄 Roadmap

### В разработке
- [ ] Web dashboard для управления
- [ ] ML-based code analysis
- [ ] Интеграция с CI/CD статусами
- [ ] Поддержка Python bot'ов
- [ ] Advanced metrics & alerting

### Предложения
Создавайте Issues в репозитории с тегом `autofixer-enhancement`

## 📚 Documentation

- [Полная документация](docs/AUTOFIXER_INTEGRATION.md)
- [API Reference](docs/api-reference.md)
- [Bot Architecture](CLAUDE.md)
- [Testing Guide](docs/testing.md)

## 🤝 Contributing

1. Fork репозитория
2. Создайте feature branch: `git checkout -b feature/autofixer-improvement`
3. Добавьте тесты для новой функциональности
4. Убедитесь что все тесты проходят: `npm test`
5. Отправьте Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 🎯 Quick Commands Reference

```bash
# Setup
cp .env.autofixer.example .env.local
npm install

# Testing  
npm test -- __tests__/autofixer/
npm run test:autofixer

# Development
npm run dev
DEBUG=autofixer:* npm start

# Production  
npm run build
npm start

# Monitoring
curl /api/autofixer/health
curl /api/autofixer/stats
```

**📞 Support:** Create issue в GitHub репозитории  
**🔧 Status:** Production Ready  
**📊 Version:** 1.0.0

---

🤖 **Generated with GitHub Auto-Fixer**  
*Автоматическое исправление Bot кода для лучшей разработки*