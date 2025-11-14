# Webhook Changelog

## [2025-11-10] AI Reels Webhook - STABLE ✅

**Tag:** `webhook-stable-20251110`
**Snapshot:** `working-webhook-20251110-213839`

### 🎯 Что исправлено:

#### 1. Render Server webhook поддержка
- ✅ Добавлена поддержка поля `download_url` (Render Server отправляет именно его)
- ✅ Provider detection для `render-server`
- ✅ Автоматическое определение успешного рендера по наличию `download_url`

#### 2. Обработка больших файлов (>50 MB)
- ✅ HEAD запрос для определения размера файла
- ✅ Файлы ≤ 50 MB → отправляются как видео через `sendVideo()`
- ✅ Файлы > 50 MB → отправляются как ссылка через `sendMessage()`
- ✅ Красивое сообщение с указанием размера файла

#### 3. SSL сертификаты и Nginx
- ✅ Скрипт проверки SSL сертификатов (`check-ssl.sh`)
- ✅ Интеграция проверки в deploy.sh
- ✅ Nginx с правильными volume mappings для SSL
- ✅ HTTPS endpoint работает стабильно

### 📦 Файлы изменены:

```
src/api_server/routes/kie-ai-webhook.routes.ts  - webhook handler с проверкой размера
/root/bot-farm/check-ssl.sh                     - проверка SSL (новый)
/root/bot-farm/deploy.sh                        - интеграция SSL check
/root/bot-farm/nginx-config/default.conf        - HTTPS конфигурация
docs/WEBHOOK_RAILWAY_STABLE_CONFIG.md           - полная документация (новый)
```

### 🔗 Коммиты:

- `ec489374` - 🔧 FIX: Add missing detectVideoWebhookProvider function
- `c2f6e88a` - 🔧 FIX: AI Reels webhook - add download_url support
- `d0694d96` - ✨ FEATURE: Send large videos (>50MB) as links instead of files

### 🧪 Протестировано:

✅ Webhook принимает payload с `download_url`
✅ Файл 69.6 MB определяется как большой
✅ Отправляется ссылка вместо видео
✅ Telegram ID 144022504 получает сообщение успешно
✅ SSL сертификаты валидны (истекают 2026-01-05)
✅ Nginx работает с HTTPS

### 📊 Производительность:

- Webhook response time: 6-10 мс
- HEAD request для определения размера: ~200 мс
- Общее время обработки: < 1 сек

### 🔄 Rollback инструкции:

Если что-то сломается, восстановить можно так:

```bash
# Вариант 1: Откат через git tag
cd /root/bot-farm
git checkout webhook-stable-20251110
docker compose build --pull app
docker compose up -d

# Вариант 2: Восстановление из snapshot
SNAPSHOT="working-webhook-20251110-213839"
cd /root/bot-farm
docker compose down
docker load < /root/docker-snapshot-${SNAPSHOT}.tar.gz
tar -xzf /root/config-snapshot-${SNAPSHOT}.tar.gz -C /
docker compose up -d
```

### 📝 Примечания:

- **ВАЖНО**: Nginx должен запускаться с явными volume mappings для SSL
- **ВАЖНО**: Deploy.sh теперь проверяет SSL перед деплоем (останавливает если невалидны)
- **ВАЖНО**: Документация в `docs/WEBHOOK_RAILWAY_STABLE_CONFIG.md` содержит ВСЮ информацию

---

## Предыдущие попытки (НЕ РАБОТАЛИ):

### [2025-11-10 early] - HTTP webhook (FAILED)
- ❌ Пытался использовать HTTP вместо HTTPS
- ❌ Render Server не следовал редиректам 301
- ❌ Callback не доходил до сервера

### [2025-11-10 mid] - Direct sendVideo для больших файлов (FAILED)
- ❌ Telegram API отклонял файлы > 50 MB
- ❌ Ошибка "wrong type of the web page content"
- ❌ Не проверялся размер файла заранее

---

**Автор:** Claude Code
**Дата:** 2025-11-10
**Статус:** ✅ STABLE - Готово для клиента
