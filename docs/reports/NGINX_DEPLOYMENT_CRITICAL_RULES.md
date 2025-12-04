# 🚨 КРИТИЧЕСКИЕ ПРАВИЛА ДЕПЛОЯ - NGINX УБИВАЕТСЯ

## ❌ ПРОБЛЕМА (3 ДНЯ ИЩЕМ ПРИЧИНУ!)

**Симптомы:**
- После деплоя через `./deploy.sh` перестают работать webhook'и
- HTTPS недоступен (Cannot connect to server)
- `systemctl status nginx` показывает: `Active: failed (Result: signal)`
- В логах: `Main PID: XXXXXX (code=killed, signal=KILL)`

**Причина:**
```bash
# ЭТИ СТРОКИ В deploy.sh УБИВАЮТ HOST NGINX!!!
fuser -k 80/tcp   # ← Порт 80 занят host nginx
fuser -k 443/tcp  # ← Порт 443 занят host nginx
```

## ✅ РЕШЕНИЕ

### 1. Исправлен deploy.sh (НЕ убивать порты 80/443)

```bash
# ❌ СТАРАЯ ВЕРСИЯ (УБИВАЕТ NGINX):
fuser -k 80/tcp 2>/dev/null || true
fuser -k 443/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

# ✅ НОВАЯ ВЕРСИЯ (NGINX ЖИВЁТ):
# ❌ НЕ УБИВАЕМ ПРОЦЕССЫ НА ПОРТАХ 80/443 - ТАМ РАБОТАЕТ HOST NGINX!
# Убиваем только порт приложения (3000), если он занят не Docker контейнером
fuser -k 3000/tcp 2>/dev/null || true
```

### 2. Автозапуск nginx включен

```bash
systemctl enable nginx  # ✅ Уже сделано
```

### 3. После каждого деплоя проверять nginx

```bash
# Проверка статуса
systemctl status nginx

# Если упал - перезапустить
systemctl start nginx

# Проверить доступность
curl https://three-head-dragon.shop/api/kie-ai/sora-callback
```

## 🏗️ АРХИТЕКТУРА СЕТИ

```
Internet (HTTPS 443)
    ↓
Host nginx (порты 80/443) ← НЕ ТРОГАТЬ! systemd service
    ↓ proxy_pass
127.0.0.1:3000 ← Docker container (--network host)
```

**Важно:**
- Host nginx работает как systemd сервис
- Docker контейнер использует `--network host` (нет Docker nginx)
- Proxy напрямую: `nginx → 127.0.0.1:3000`

## 📋 КОНТРОЛЬНЫЙ ЧЕК-ЛИСТ ПОСЛЕ ДЕПЛОЯ

```bash
# 1. Проверить контейнеры
docker ps | grep 999-multibots

# 2. Проверить nginx
systemctl status nginx

# 3. Проверить API сервер
docker logs 999-multibots 2>&1 | grep "Server started on port 3000"

# 4. Проверить webhook
curl https://three-head-dragon.shop/api/kie-ai/sora-callback

# 5. Если 502 Bad Gateway - проблема в proxy_pass
# 6. Если Connection refused - nginx убит
```

## 🔧 БЫСТРОЕ ВОССТАНОВЛЕНИЕ

```bash
# 1. Перезапустить nginx
ssh root@212.86.115.30 "systemctl start nginx"

# 2. Проверить nginx config
ssh root@212.86.115.30 "cat /etc/nginx/sites-available/three-head-dragon"

# 3. Должно быть:
proxy_pass http://127.0.0.1:3000;  # ✅ ПРАВИЛЬНО (--network host)
# НЕ:
proxy_pass http://localhost:8080;  # ❌ НЕПРАВИЛЬНО (bot-proxy не существует)
```

## 🎯 ГЛАВНЫЕ ПРАВИЛА

1. **НИКОГДА не убивать процессы на портах 80/443 в скриптах деплоя**
2. **ВСЕГДА проверять nginx после деплоя** (`systemctl status nginx`)
3. **Использовать `--network host`** для упрощения архитектуры
4. **Host nginx автостарт включён** (`systemctl enable nginx`)
5. **Сохранить этот файл** и читать перед каждым деплоем

## 📝 ИСТОРИЯ ПРОБЛЕМЫ

- **3 дня** искали причину убийства nginx
- Проблема возникала **после каждого деплоя**
- Причина: `fuser -k 80/tcp` и `fuser -k 443/tcp` в deploy.sh
- Решение: удалить эти строки, оставить только `fuser -k 3000/tcp`

---

**Дата создания:** 2025-11-06
**Последнее обновление:** 2025-11-06
**Статус:** ✅ ИСПРАВЛЕНО в deploy.sh
