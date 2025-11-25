# 🔧 КРИТИЧНО: Исправление webhook в продакшене

## ❌ ПРОБЛЕМА
502 Bad Gateway - nginx не видит API сервер

**Причина**: На продакшене docker-compose.yml все еще использует порт 2999 вместо 3000

## ✅ РЕШЕНИЕ

### Шаг 1: Обновить код на сервере

```bash
# Заходим на сервер
ssh root@188.137.250.69

# Переходим в директорию
cd /opt/999-agents-telegraf

# Скачиваем обновленный docker-compose.yml
curl -o docker-compose.yml https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/production/docker-compose.yml

# Проверяем что порты изменились
grep -n "ports:" docker-compose.yml | head -5
```

Должно показать:
```
35:      - '3000:3000'
36:      - '3001:3001'
...
```

### Шаг 2: Перезапустить контейнеры

```bash
# Останавливаем
docker-compose down

# Запускаем с новой конфигурацией
docker-compose up -d

# Проверяем статус
docker ps | grep 999-multibots
```

### Шаг 3: Проверить nginx

```bash
# Тест конфигурации nginx
docker exec bot-proxy nginx -t

# Если конфиг OK, перезагружаем
docker exec bot-proxy nginx -s reload

# Если ошибка, проверяем конфиг
docker exec bot-proxy cat /etc/nginx/conf.d/default.conf | grep "proxy_pass"
```

Должно показать:
```
proxy_pass http://app:3000;
```

### Шаг 4: Тест webhook

```bash
# Тест ошибки контент-политики
curl -X POST http://localhost:3000/api/video-callback/123456789 \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-123",
    "successFlag": 3,
    "errorMessage": "OpenAI currently do not support uploads of images containing photorealistic people",
    "errorCode": 400
  }'

# Тест ошибки генерации
curl -X POST http://localhost:3000/api/video-callback/123456789 \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "test-456",
    "successFlag": 2,
    "errorMessage": "Generation timeout exceeded",
    "errorCode": 500
  }'
```

### Шаг 5: Проверить логи

```bash
# Смотрим логи в реальном времени
docker logs 999-multibots -f --tail 50

# Поиск сообщений об исправлении
grep "Direct.*notification" логи
```

Ожидаем увидеть:
```
✅ [SORA WEBHOOK] Direct content policy notification sent
✅ [SORA WEBHOOK] Direct failure notification sent
```

## 🚀 АВТОМАТИЧЕСКОЕ ИСПРАВЛЕНИЕ

Используйте готовый скрипт:

```bash
# Скачать скрипт
curl -o FIX-PRODUCTION-PORTS.sh https://raw.githubusercontent.com/gHashTag/999-multibots-telegraf/production/FIX-PRODUCTION-PORTS.sh

# Сделать исполняемым
chmod +x FIX-PRODUCTION-PORTS.sh

# Запустить
./FIX-PRODUCTION-PORTS.sh
```

## ✅ РЕЗУЛЬТАТ

После исправления:
- ✅ Webhook работает на https://three-head-dragon.shop/api/video-callback/:telegramId
- ✅ Ошибки доходят до пользователей
- ✅ Port 3000 используется вместо 2999
- ✅ Nginx проксирует на app:3000

## 🔍 ДИАГНОСТИКА

Если проблема остается:

```bash
# Проверить что API слушает на 3000
netstat -tulpn | grep ":3000"

# Проверить контейнеры
docker exec bot-proxy netstat -tulpn | grep ":3000"

# Проверить firewall
ufw status | grep 3000
```

## 📞 КОНТАКТЫ

- Сервер: 188.137.250.69
- Домен: https://three-head-dragon.shop
- Контейнер: 999-multibots

---

**Дата**: 2025-11-25
**Статус**: КРИТИЧНО - требует немедленного исправления
