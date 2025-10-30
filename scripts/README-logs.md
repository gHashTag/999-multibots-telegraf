# 📊 Production Logs Monitor - Quick Reference

Автоматический мониторинг продакшн логов с автоматическим исправлением проблем.

## 🚀 Быстрый старт

### Через Claude Code (рекомендуется):
```bash
/logs
```

### Через npm:
```bash
npm run logs              # Полный анализ с автоисправлением
npm run logs:follow       # Режим real-time (Ctrl+C для выхода)
npm run logs:no-fix       # Только анализ, без исправлений
npm run logs:tail         # Показать больше строк (200)
```

### Прямой запуск:
```bash
node scripts/logs-monitor.js [опции]
```

## ⚙️ Опции командной строки

| Опция | Описание | Пример |
|-------|----------|--------|
| `--tail=N` | Количество строк логов | `--tail=200` |
| `--no-fix` | Отключить автоисправление | `--no-fix` |
| `--follow` / `-f` | Режим реального времени | `--follow` |

## 📋 Что проверяется

### 1. Docker Container Status
- ✅ Существование контейнера 999-multibots
- ✅ Статус (running/stopped)
- ✅ Uptime и количество перезапусков

### 2. Resource Usage
- 📊 CPU использование (предупреждение при >80%)
- 💾 Memory использование (предупреждение при >80%)
- ⚠️ Автоматические alerts при высокой нагрузке

### 3. Log Analysis
Автоматическая категоризация ошибок:
- ❌ **JavaScript Errors**: TypeError, ReferenceError, SyntaxError
- ⚠️ **Telegram API Issues**: Bot API errors, rate limits
- ⚠️ **Database Issues**: Supabase connection, query errors
- ⚠️ **Network Issues**: ECONNREFUSED, ETIMEDOUT, DNS errors
- ⚠️ **Other Issues**: Прочие warnings и errors

### 4. Automatic Fixes
При обнаружении проблем автоматически:
1. Сохраняет контекст ошибки в `/tmp/js-error-context.json`
2. Предлагает запустить агента `js-error-fixer`
3. Генерирует готовые команды для исправления
4. Выводит рекомендации по устранению проблем

## 🤖 Интеграция с агентами

### js-error-fixer (автоматически)
Когда обнаружены JavaScript ошибки:
1. Анализирует stack trace
2. Находит проблемный файл и строку
3. Применяет типовые исправления:
   - Null checks
   - Optional chaining (?.)
   - Proper error handling
   - Promise error handling
4. Коммитит исправления
5. Пушит в production ветку
6. Триггерит автодеплой через GitHub Actions

### deployment-manager
При необходимости полной пересборки:
```bash
/deploy
```

## 📊 Формат отчета

```
📊 PRODUCTION LOGS MONITOR - 999-multibots
═══════════════════════════════════════════

🐳 DOCKER CONTAINER STATUS
--------------------------
   Name: 999-multibots
   Status: 🟢 RUNNING
   Uptime: 5 hours

💻 RESOURCE USAGE
-----------------
   CPU: 12.5%
   Memory: 256MB / 2GB (12.8%)

📝 CONTAINER LOGS (last 100 lines)
----------------------------------
   [timestamp] [INFO] Bot started successfully
   [timestamp] [ERROR] TypeError: Cannot read property 'id' of undefined
   ...

🔍 ERROR ANALYSIS
-----------------
   ❌ JavaScript Errors: 3
   ⚠️  Telegram API Issues: 1
   ✅ No critical database errors

⚡ AUTOMATIC FIXES
------------------
   🤖 Triggering js-error-fixer agent...
   📝 Error context saved to /tmp/js-error-context.json
   💡 To apply fixes, run: Task("js-error-fixer", ...)

🛠️  QUICK FIX COMMANDS
-----------------------
   View live logs:
   ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs -f 999-multibots'

   Restart container:
   ssh -i ~/.ssh/zomro root@212.86.115.30 'docker restart 999-multibots'
```

## 🎯 Типовые сценарии

### Сценарий 1: Регулярная проверка
```bash
# Быстрая проверка состояния системы
/logs

# Если все ОК - увидите:
# ✅ Container running
# ✅ Normal resource usage
# ✅ No critical errors
```

### Сценарий 2: Обнаружены JS ошибки
```bash
# Команда автоматически:
/logs

# 1. Находит JavaScript ошибки
# 2. Сохраняет контекст в /tmp/js-error-context.json
# 3. Предлагает запустить js-error-fixer
# 4. Выводит готовые команды для исправления

# Применить исправления:
# - Агент js-error-fixer исправит код
# - Закоммитит изменения
# - Запушит в production
# - GitHub Actions сделает автодеплой
```

### Сценарий 3: Контейнер остановлен
```bash
/logs

# Увидите:
# 🔴 Container STOPPED
# 🛠️  Quick fix: ssh ... docker start 999-multibots

# Или полная пересборка:
/deploy
```

### Сценарий 4: Высокая нагрузка
```bash
/logs

# Увидите:
# ⚠️  HIGH CPU USAGE! (85%)
# ⚠️  HIGH MEMORY USAGE! (92%)
#
# Рекомендации:
# - Проверить логи на memory leaks
# - Рассмотреть оптимизацию кода
# - Увеличить ресурсы контейнера
```

### Сценарий 5: Мониторинг в реальном времени
```bash
# Запустить в режиме follow
npm run logs:follow

# Или через CLI:
node scripts/logs-monitor.js --follow

# Выход: Ctrl+C
```

## 🔗 Связанные команды

| Команда | Назначение |
|---------|------------|
| `/logs` | Мониторинг и автоисправление |
| `/deploy` | Полный деплой с пересборкой Docker |
| `/check` | Быстрая проверка JS ошибок |
| `/docs-sync` | Синхронизация документации |

## 🔧 Конфигурация

Файл: `scripts/logs-monitor.js`

```javascript
const CONFIG = {
  server: 'root@212.86.115.30',    // Production server
  sshKey: '~/.ssh/zomro',           // SSH key path
  container: '999-multibots',       // Docker container name
  projectPath: '/root/bot-farm',    // Project path on server
  logLines: 100,                    // Default log lines
  autoFix: true,                    // Enable auto-fix
  follow: false                     // Follow mode
};
```

## 🛡️ Безопасность

- ✅ Все изменения коммитятся с описанием
- ✅ Автодеплой только через GitHub Actions
- ✅ Возможность отката через `git revert`
- ✅ Логирование всех действий агента
- ✅ Контекст ошибок сохраняется в /tmp

## 📚 Документация

- **Full Documentation**: `.claude/commands/logs.md`
- **JS Error Fixer Agent**: `.claude/agents/js-error-fixer.md`
- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md`
- **Main Config**: `/Users/playra/CLAUDE.md`

## 🆘 Помощь

### Команда не работает?
1. Проверьте SSH ключ: `ls -la ~/.ssh/zomro`
2. Проверьте доступ к серверу: `ssh -i ~/.ssh/zomro root@212.86.115.30 'echo OK'`
3. Проверьте Node.js: `node --version` (должен быть v14+)

### Логи не показываются?
```bash
# Проверьте что контейнер существует
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker ps -a | grep 999-multibots'

# Проверьте логи напрямую
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 10'
```

### Автоисправление не срабатывает?
1. Убедитесь что запущено с автофиксом: `npm run logs` (НЕ `logs:no-fix`)
2. Проверьте что есть JS ошибки в логах
3. Проверьте файл контекста: `cat /tmp/js-error-context.json`

---

**Создано**: 2025-10-16
**Версия**: 1.0.0
**Автор**: Claude Code + Deployment Manager
