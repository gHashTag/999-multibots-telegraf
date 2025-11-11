# 🔒 КРИТИЧЕСКОЕ ПРАВИЛО: SSL Сертификаты

## ⛔️ ЗАПРЕЩЕНО ИЗМЕНЯТЬ

### SSL сертификаты для nginx (bot-proxy)

**Файлы:**
- `docker-compose.yml` - секция `bot-proxy` → `volumes`
- `nginx-config/default.conf` - параметры `ssl_certificate` и `ssl_certificate_key`

**Текущие ПРАВИЛЬНЫЕ пути:**
```yaml
# В docker-compose.yml:
volumes:
  - ./ssl/cert.crt:/etc/nginx/ssl/cert.crt:ro
  - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro

# В nginx-config/default.conf:
ssl_certificate /etc/nginx/ssl/cert.crt;
ssl_certificate_key /etc/nginx/ssl/key.pem;
```

## ❗ ПОЧЕМУ ЭТО КРИТИЧНО

1. **Replicate требует HTTPS webhooks** - без SSL сертификатов тренировка моделей (Digital Avatar Body / Цифровое тело) НЕ РАБОТАЕТ
2. **Ошибка 422**: `webhook: Not a valid HTTPS URL` если webhook использует HTTP
3. **nginx не запустится** если сертификаты недоступны или пути неверные

## 🚨 ПОСЛЕДСТВИЯ ИЗМЕНЕНИЯ

- ❌ nginx контейнер (bot-proxy) перезапускается бесконечно с ошибкой
- ❌ Все HTTPS webhooks перестают работать
- ❌ Пользователи не могут тренировать модели
- ❌ Уведомления от Replicate не приходят

## ✅ ПРОВЕРКА РАБОТОСПОСОБНОСТИ

### После деплоя ОБЯЗАТЕЛЬНО проверить:

```bash
# 1. Проверить что nginx запущен
docker ps | grep bot-proxy
# Должен быть STATUS: Up X minutes (НЕ Restarting!)

# 2. Проверить логи nginx
docker logs bot-proxy --tail 20
# НЕ должно быть ошибок: "cannot load certificate"

# 3. Тестовый запрос к webhook
curl -k https://212.86.115.30:8443/api/webhooks/replicate \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"id":"test"}'
# Должен вернуть JSON (не ошибку соединения!)
```

## 📋 ИСТОРИЯ ПРОБЛЕМ

### 2025-11-11: Сертификаты в неверных путях
**Проблема:**
- docker-compose.yml монтировал `/etc/pki/cert.crt` (директории, не файлы!)
- nginx искал `/etc/nginx/ssl/cert.crt`
- Результат: nginx crash loop

**Решение:**
- Переместили сертификаты в `./ssl/` директорию проекта
- Обновили пути монтирования в docker-compose.yml
- Синхронизировали с nginx-config/default.conf

**Пользователь:** 500889584 не мог тренировать "цифровое тело"

**Fix commit:** `2a1a2d88` + SSL paths fix

## 🔧 КАК ПРАВИЛЬНО ОБНОВИТЬ СЕРТИФИКАТЫ

Если сертификаты истекли или нужно обновить:

```bash
# 1. Положить новые сертификаты в правильную директорию
cd /root/bot-farm/ssl/
# Сюда поместить:
# - cert.crt (или fullchain.pem)
# - key.pem (или privkey.pem)

# 2. Проверить права доступа
chmod 644 cert.crt
chmod 600 key.pem

# 3. Перезапустить только nginx
docker compose restart bot-proxy

# 4. Проверить логи
docker logs bot-proxy --tail 20
```

## 🎯 АВТОПРОВЕРКА В CI/CD

Добавить в `.github/workflows/production-auto-deploy.yml`:

```yaml
- name: Verify SSL Certificates
  run: |
    ssh root@212.86.115.30 'test -f /root/bot-farm/ssl/cert.crt || exit 1'
    ssh root@212.86.115.30 'test -f /root/bot-farm/ssl/key.pem || exit 1'
    echo "✅ SSL certificates exist"
```

## ⚠️ ПРАВИЛО ДЛЯ AI АГЕНТОВ

**При любых изменениях docker-compose.yml:**
1. ❌ НЕ ТРОГАТЬ секцию `bot-proxy` → `volumes` → SSL пути
2. ✅ ВСЕГДА проверять что пути остались:
   - `./ssl/cert.crt:/etc/nginx/ssl/cert.crt:ro`
   - `./ssl/key.pem:/etc/nginx/ssl/key.pem:ro`
3. ✅ После деплоя ОБЯЗАТЕЛЬНО запустить проверку nginx
4. ✅ Тестировать webhook endpoint

## 📝 СВЯЗАННЫЕ ФАЙЛЫ

- `docker-compose.yml` (строки 125-126)
- `nginx-config/default.conf` (listen 443 ssl)
- `src/services/createModelTrainingLocal.ts` (webhook URL)
- `src/api_server/routes/replicate-webhook.routes.ts` (webhook handler)

---

**LAST UPDATE:** 2025-11-11
**TESTED BY:** @playra
**CRITICAL LEVEL:** 🔴 МАКСИМАЛЬНЫЙ
