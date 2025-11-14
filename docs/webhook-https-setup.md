# 🔒 HTTPS Webhook Configuration для KIE.ai

## Проблема
Webhook callback'и от KIE.ai должны использовать защищенное HTTPS соединение вместо небезопасного HTTP.

## Решение: "Три головы дракона" (three-head-dragon.shop)

### Production Configuration
```bash
# .env file на сервере 212.86.115.30
BASE_WEBHOOK_URL=https://three-head-dragon.shop
```

### Как это работает:

1. **Three Head Dragon Domain**: `three-head-dragon.shop`
   - Автоматический SSL/TLS сертификат
   - Reverse proxy к bot-farm серверу (212.86.115.30)
   - Безопасное соединение для webhook'ов

2. **Приоритет Callback URL** (в коде):
   ```typescript
   const callbackUrl = process.env.BASE_WEBHOOK_URL
     ? `${process.env.BASE_WEBHOOK_URL}/api/kie-ai/callback`
     : process.env.LOCAL_SERVER_URL
     ? `${process.env.LOCAL_SERVER_URL}/api/kie-ai/callback`
     : process.env.API_SERVER_URL
     ? `${process.env.API_SERVER_URL}/api/kie-ai/callback`
     : 'https://ai-server-production-production-8e2d.up.render-server (local)/api/kie-ai/callback'
   ```

3. **Результат**:
   - ✅ KIE.ai отправляет callback на: `https://three-head-dragon.shop/api/kie-ai/callback`
   - ✅ Защищенное HTTPS соединение
   - ✅ Webhook route обрабатывается в `src/api_server/routes/kie-ai-webhook.routes.ts`

## Deployment

### На production сервере:
```bash
# 1. Обновить .env
ssh -i ~/.ssh/zomro root@212.86.115.30
cd /root/bot-farm
echo "BASE_WEBHOOK_URL=https://three-head-dragon.shop" >> .env

# 2. Перезапустить контейнер
docker restart 999-multibots

# 3. Проверить конфигурацию
docker exec 999-multibots cat /app/.env | grep BASE_WEBHOOK_URL
docker logs 999-multibots | grep "callback"
```

## Проверка работы

1. **Запустить lip-sync генерацию** в любом боте
2. **Проверить логи** на наличие callback URL:
   ```
   🔗 [KIE PROVIDER] Callback URL определен
   {
     callback_url: 'https://three-head-dragon.shop/api/kie-ai/callback',
     source: 'BASE_WEBHOOK_URL'
   }
   ```
3. **Дождаться завершения** - сообщение должно прийти через webhook

## Безопасность

- ✅ HTTPS защищает данные в транзите
- ✅ SSL/TLS сертификат автоматически обновляется
- ✅ Приватный IP (212.86.115.30) скрыт за reverse proxy
- ✅ Webhook endpoint защищен валидацией payload

## Альтернативные конфигурации

### Development (локальная разработка):
```bash
BASE_WEBHOOK_URL=http://localhost:4000
# или
BASE_WEBHOOK_URL=https://your-ngrok-url.ngrok.io
```

### Staging:
```bash
BASE_WEBHOOK_URL=https://staging-bot-farm.yourdomain.com
```

## Troubleshooting

### Callback'и не приходят:
1. Проверить routing: `curl https://three-head-dragon.shop/api/kie-ai/callback`
2. Проверить логи webhook: `docker logs 999-multibots | grep "KIE.AI WEBHOOK"`
3. Проверить firewall правила на сервере

### SSL ошибки:
1. Проверить сертификат: `openssl s_client -connect three-head-dragon.shop:443`
2. Убедиться, что reverse proxy работает
3. Проверить DNS резолюцию

## История изменений

- **2025-10-16**: Переход с HTTP (212.86.115.30:2999) на HTTPS (three-head-dragon.shop)
- **Причина**: Безопасность webhook'ов от KIE.ai
- **Файлы**: `src/core/lipsync/providers/kie-veed-fabric-provider.ts`
- **Домен**: "Три головы дракона" - https://three-head-dragon.shop
