# 🚀 Настройка тестирования Pull Requests

## 📋 Обзор

Эта система позволяет автоматически деплоить каждый PR в отдельное тестовое окружение. Каждый PR получает:
- Свои порты (на основе номера PR)
- Свои тестовые боты
- Изолированное окружение Docker
- Автоматическую очистку после закрытия PR

## 🛠️ Первоначальная настройка

### 1. Создание тестовых ботов

Нужно создать 8 тестовых ботов в @BotFather:
```
pr_neuroblogger_test_bot
pr_ai_koshey_test_bot  
pr_neuro_koder_test_bot
pr_neuro_kosheyu_test_bot
pr_ai_blogger_test_bot
pr_ai_master_blogger_test_bot
pr_ai_news_blogger_test_bot
pr_ai_science_blogger_test_bot
```

### 2. Настройка GitHub Secrets

В настройках репозитория добавьте следующие секреты:

```bash
# Основные
DOMAIN=999-multibots-u14194.vm.elestio.app
SSH_PRIVATE_KEY=<ваш SSH ключ для доступа к серверу>

# Токены тестовых ботов
PR_BOT_TOKEN_1=<токен pr_neuroblogger_test_bot>
PR_BOT_TOKEN_2=<токен pr_ai_koshey_test_bot>
PR_BOT_TOKEN_3=<токен pr_neuro_koder_test_bot>
PR_BOT_TOKEN_4=<токен pr_neuro_kosheyu_test_bot>
PR_BOT_TOKEN_5=<токен pr_ai_blogger_test_bot>
PR_BOT_TOKEN_6=<токен pr_ai_master_blogger_test_bot>
PR_BOT_TOKEN_7=<токен pr_ai_news_blogger_test_bot>
PR_BOT_TOKEN_8=<токен pr_ai_science_blogger_test_bot>

# Копируем остальные секреты из основного окружения
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
INNGEST_URL
INNGEST_BASE_URL
SUPABASE_URL
SUPABASE_SERVICE_KEY
SUPABASE_SERVICE_ROLE_KEY
ORIGIN
ADMIN_IDS
SECRET_KEY
LOG_FORMAT
ELEVENLABS_API_KEY
OPENAI_API_KEY
REPLICATE_API_TOKEN
```

### 3. Настройка сервера

На сервере должны быть установлены:
- Docker и Docker Compose
- Nginx или Traefik для роутинга
- SSL сертификаты

## 🎯 Как это работает

### Автоматический деплой PR

1. При создании или обновлении PR срабатывает GitHub Action
2. PR получает уникальный номер (например, 42)
3. Система выделяет порты: 4200-4208 для этого PR
4. Создается изолированное окружение с префиксом `pr-42`
5. В PR автоматически добавляется комментарий с ссылками на тестовые боты

### Локальное тестирование

```bash
# Тестирование PR #42 локально
./scripts/test-pr-local.sh 42

# Просмотр логов
docker-compose -f docker-compose.pr.yml -p pr-42 logs -f

# Остановка
docker-compose -f docker-compose.pr.yml -p pr-42 down
```

## 📝 Структура портов

Для PR #N используются порты:
- `4N99` - API сервер (порт 2999)
- `4N00` - Bot 1 (порт 3000)
- `4N01` - Bot 2 (порт 3001)
- `4N02` - Bot 3 (порт 3002)
- И так далее...

Пример для PR #42:
- `4299` - API
- `4200` - Bot 1
- `4201` - Bot 2
- И т.д.

## 🔧 Настройка Nginx/Traefik

### Nginx конфигурация

```nginx
# Для каждого PR создается правило
server {
    listen 443 ssl;
    server_name pr42.999-multibots-u14194.vm.elestio.app;
    
    ssl_certificate /etc/pki/cert.crt;
    ssl_certificate_key /etc/pki/key.pem;
    
    location / {
        proxy_pass http://localhost:4200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Traefik конфигурация

Traefik автоматически создает роуты на основе Docker labels в `docker-compose.pr.yml`.

## 🐛 Отладка

### Проверка статуса PR окружения

```bash
# На сервере
ssh root@999-multibots-u14194.vm.elestio.app

# Проверка контейнеров PR #42
docker ps | grep pr-42

# Логи
docker-compose -f /opt/app/999-multibots-telegraf/pr-42/docker-compose.pr.yml -p pr-42 logs -f
```

### Частые проблемы

1. **Порты заняты**
   - Проверьте, что PR с таким номером не запущен
   - Используйте `docker ps` для проверки

2. **Токены ботов не работают**
   - Убедитесь, что создали отдельные тестовые боты
   - Проверьте, что токены добавлены в GitHub Secrets

3. **Webhook не доходят**
   - Проверьте настройки Nginx/Traefik
   - Убедитесь, что SSL сертификаты валидны

## 🎯 Best Practices

1. **Изоляция данных**
   - Используйте отдельную тестовую БД для PR
   - Или префиксы в таблицах (`pr42_users`)

2. **Ресурсы**
   - Ограничивайте ресурсы для PR контейнеров
   - Автоматически удаляйте старые PR окружения

3. **Безопасность**
   - Не используйте production токены для PR
   - Ограничьте доступ к тестовым ботам

## 📚 Дополнительные команды

```bash
# Запуск всех PR окружений
ls -d pr-*/ | xargs -I {} bash -c "cd {} && docker-compose -f docker-compose.pr.yml up -d"

# Остановка всех PR окружений
docker ps --format "table {{.Names}}" | grep "pr-" | xargs -I {} docker stop {}

# Очистка старых PR (старше 7 дней)
find /opt/app/999-multibots-telegraf/pr-* -maxdepth 0 -type d -mtime +7 -exec rm -rf {} \;
```

## 🚀 Roadmap

- [ ] Автоматическое создание тестовых ботов через API
- [ ] Интеграция с тестовой БД для каждого PR
- [ ] Автоматические E2E тесты после деплоя
- [ ] Нотификации в Slack/Discord о статусе PR
- [ ] Метрики и мониторинг PR окружений