# 🔧 Troubleshooting: Webhooks перестали работать

## ⚠️ Симптомы проблемы

```
❌ Ошибка генерации: Неизвестная ошибка
❌ [SORA WEBHOOK] Sora generation failed
```

Логи показывают `successFlag: 2` (failed), хотя `code: 200` и есть `resultUrls`.

## 🔍 Диагностика

### 1. Проверка портов nginx

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 "docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep bot-proxy"
```

**Правильный вывод:**
```
bot-proxy  0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp
```

**Неправильный вывод (ПРОБЛЕМА!):**
```
bot-proxy  0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp
```

### 2. Тест webhook endpoint

```bash
curl -X POST https://three-head-dragon.shop/api/video-callback/test \
  -H "Content-Type: application/json" \
  -d '{"test":"ping"}' \
  -k -w "\nHTTP: %{http_code}\n"
```

**Ожидаемый ответ:** HTTP 202

## 🛠️ Решение проблем

### Проблема #1: Нестандартные порты (8443 вместо 443)

**Причина:** docker-compose.yml был изменен на нестандартные порты.

**Решение:**
```bash
# 1. Проверить docker-compose.yml
cat docker-compose.yml | grep -A 2 "ports:"

# 2. Если порты неправильные (8443:443 или 8080:80):
cd /root/bot-farm
git pull origin production  # Восстановить правильную версию

# 3. Пересоздать контейнер nginx
docker rm -f bot-proxy
docker compose up -d nginx

# 4. Проверить что порты исправлены
docker ps --format 'table {{.Names}}\t{{.Ports}}' | grep bot-proxy
```

### Проблема #2: WAN 2.5 определяется как failed

**Причина:** Неправильная логика в `normalizeKieSoraPayload()` - проверка `resultUrls` происходит ДО парсинга `resultJson`.

**Решение:** Уже исправлено в коммите `deeccd34`. Проверить версию:
```bash
cd /root/bot-farm
git log --oneline -1
# Должно быть: deeccd34 или новее
```

### Проблема #3: Nginx не запустился после деплоя

**Диагностика:**
```bash
docker ps -a | grep bot-proxy  # Проверить статус контейнера
docker logs bot-proxy  # Посмотреть логи ошибок
```

**Частые причины:**
- Порты 80/443 заняты другим процессом
- SSL сертификаты не найдены
- Ошибка в nginx.conf

**Решение:**
```bash
# Проверить что порты свободны
netstat -tulpn | grep -E ':(80|443)'

# Пересоздать nginx
docker rm -f bot-proxy
docker compose up -d nginx
```

## 🔒 Защита от повторения проблемы

### 1. Автоматические проверки в deploy.sh

После каждого деплоя автоматически проверяется:
- ✅ Nginx слушает на портах 80 и 443
- ✅ Webhook endpoint отвечает HTTP 202

### 2. Железобетонная защита портов в docker-compose.yml

```yaml
ports:
  - '443:443'  # HTTPS - СТАНДАРТНЫЙ ПОРТ! НЕ МЕНЯТЬ!
  - '80:80'    # HTTP - СТАНДАРТНЫЙ ПОРТ! НЕ МЕНЯТЬ!
```

С подробными комментариями почему нельзя менять.

### 3. Команда для быстрой проверки

```bash
ssh -i ~/.ssh/zomro root@212.86.115.30 "cd /root/bot-farm && ./deploy.sh status"
```

## 📋 Контрольный чеклист

После каждого деплоя проверить:

- [ ] Nginx слушает на портах 80 и 443 (не 8080/8443)
- [ ] Webhook endpoint отвечает HTTP 202
- [ ] Git commit = последний коммит в production
- [ ] Все боты инициализированы (логи)
- [ ] API health endpoint работает

## 🆘 Экстренное восстановление

Если всё сломалось и нужно быстро откатиться:

```bash
# 1. Посмотреть доступные снапшоты
ssh -i ~/.ssh/zomro root@212.86.115.30 "ls -lh /root/docker-snapshot-*.tar.gz"

# 2. Откатиться на последний стабильный
cd /Users/playra/999-agents-telegraf
./deploy.sh rollback prod-stable-YYYYMMDD_HHMMSS

# 3. Проверить что всё работает
./deploy.sh status
```

## 📞 Контакты

- Telegram: @playra
- GitHub Issues: https://github.com/gHashTag/999-multibots-telegraf/issues

## 🔗 Связанные коммиты

- `deeccd34` - FIX: WAN 2.5 T2V webhook success detection
- `520af3b0` - FIX: Nginx ports - change to standard 80 and 443
- `88347031` - SECURITY: Iron-clad protection for nginx ports and webhooks
