# Server Health Checker Agent

Автоматизированный агент для мониторинга состояния production сервера Telegram бота.

## 🚀 Быстрый запуск

### Команда
```bash
/check
```

### Через Task tool
```javascript
Task("Server health diagnostics", "Run complete server health check", "general-purpose")
```

## 📋 Что проверяется

### 1. Docker Container
- ✅ Статус контейнера (UP/DOWN)
- ⏱ Время работы (uptime)
- 📊 Использование ресурсов (CPU, RAM)
- 🔄 Количество процессов

### 2. Критические ошибки
Поиск в логах:
- `Error`, `Exception`, `TypeError`, `ReferenceError`
- `failed`, `ECONNREFUSED`, `ETIMEDOUT`
- `UnhandledPromiseRejection`, `Fatal`, `Crash`, `Terminated`

### 3. AI Photoshop функционал
- Проверка флага `wasAllModels`
- Восстановление режима `all_models`
- Целостность сохраненных результатов

### 4. Системные метрики
- Подключение к Supabase
- Статистика сети (IN/OUT)
- Последняя активность

## 📊 Формат отчета

```
📊 SERVER HEALTH REPORT
========================

✅ Container Status: UP - Uptime: 18 hours
📈 Resources: CPU 0.00% | RAM 77.86MiB (0.98%)
🔄 Processes: 11

🚨 Critical Errors: No critical errors

✅ AI Photoshop: Working
   wasAllModels flag: Present
   all_models restoration: Active

📡 System Status:
   - Supabase: Connected
   - Network: 492MB/370MB
   - Last activity: 2025-10-02 03:54:12

💡 Recommendations: None - System healthy
```

## 🎯 Классификация ошибок

| Уровень | Тип ошибок |
|---------|------------|
| 🔴 Critical | UnhandledPromiseRejection, Fatal, Crash, Container down |
| 🟠 High | TypeError, ReferenceError, ECONNREFUSED в критических сервисах |
| 🟡 Medium | Feature-specific errors, timeout warnings |
| 🟢 Low | Info messages, routine errors с fallbacks |

## 🛠 Быстрые исправления

При обнаружении проблем агент предложит команды:

### Перезапуск контейнера
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker restart 999-multibots'
```

### Полная пересборка
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'cd /root/999-agents-telegraf && docker stop 999-multibots && docker rm 999-multibots && docker build --no-cache -t 999-multibots . && docker run -d --name 999-multibots --restart=always -p 3001:3001 -v /root/999-agents-telegraf/.env:/app/.env:ro 999-multibots'
```

### Просмотр логов
```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 'docker logs 999-multibots --tail 1000 | grep [pattern]'
```

## 📁 Файлы агента

- **Agent Definition**: `.claude/agents/server-health-checker.md`
- **Command**: `.claude/commands/check.md`
- **Documentation**: `docs/server-health-checker.md`

## 🔄 Автоматизация

Агент выполняет все проверки **параллельно** в одном сообщении для максимальной скорости.

### Пример использования

1. **Быстрая проверка**:
   ```bash
   /check
   ```

2. **После деплоя**:
   ```bash
   /check
   # Проверит AI Photoshop functionality после обновления
   ```

3. **При подозрении на проблемы**:
   ```bash
   /check
   # Получит детальный отчет с рекомендациями
   ```

## ⚙️ Конфигурация

### SSH доступ
- Host: `212.86.115.30`
- User: `root`
- Key: `~/.ssh/zomro`
- Container: `999-multibots`

### Мониторинг
- Проверка каждые N минут (настраивается)
- Alert при критических ошибках
- Автоматические рекомендации

## 🎯 Best Practices

1. **Регулярная проверка**: Запускайте после каждого деплоя
2. **Приоритет ошибкам**: Критические ошибки решаются первыми
3. **Проверка функций**: Всегда проверяйте AI Photoshop после обновлений
4. **Мониторинг ресурсов**: Отслеживайте тренды использования RAM/CPU

## 📞 Поддержка

При обнаружении проблем:
1. Запустите `/check` для диагностики
2. Следуйте рекомендациям агента
3. При необходимости выполните предложенные команды
4. Повторите `/check` для подтверждения исправления
