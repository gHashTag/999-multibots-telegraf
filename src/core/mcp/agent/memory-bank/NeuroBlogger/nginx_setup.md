# Конфигурация Nginx и настройка вебхуков в проекте

## Структура проекта и контейнеры

В проекте используется следующая структура Docker-контейнеров:

1. **999-multibots** - основной контейнер с ботами (порты 2999-3007)
   - Порт 2999: API сервер
   - Порт 3001: neuro_blogger_bot
   - Порт 3002: MetaMuse_Manifest_bot
   - Порт 3003: ZavaraBot
   - Порт 3004: LeeSolarbot
   - Порт 3005: NeuroLenaAssistant_bot
   - Порт 3006: NeurostylistShtogrina_bot
   - Порт 3007: Gaia_Kamskaia_bot

2. **bot-proxy** - Nginx-прокси для маршрутизации запросов к ботам (порты 80 и 443)

3. **elestio-nginx** - Внешний Nginx от Elestio, перенаправляющий запросы к bot-proxy

## Конфигурация Docker

### docker-compose.yml

Основной файл конфигурации Docker находится в `/opt/app/999-multibots-telegraf/docker-compose.yml`. Содержит:

```yaml
services:
  app:
    container_name: 999-multibots
    build:
      context: ./
      dockerfile: Dockerfile
    ports:
      - '2999:2999'
      - '3000:3000'
      - '3001:3001'
      - '3002:3002'
      - '3003:3003'
      - '3004:3004'
      - '3005:3005'
      - '3006:3006'
      - '3007:3007'
    # ...остальные настройки...

  nginx:
    image: nginx:latest
    container_name: bot-proxy
    ports:
      - '8443:443'
      - '8080:80'
    volumes:
      # Важно использовать правильную директорию для конфигурации
      - ./nginx-config:/etc/nginx/conf.d:ro
    # ...остальные настройки...
```

## Конфигурация Nginx

### Местоположение файлов

Конфигурация Nginx должна находиться в директории:
```
/opt/app/999-multibots-telegraf/nginx-config/
```

Основной файл конфигурации - `default.conf`

### Правильная конфигурация Nginx

Для корректной работы вебхуков необходимо использовать следующую конфигурацию (важно использовать IP-адреса вместо имен хостов):

```nginx
server {
    listen 80;
    server_name 999-multibots-telegraf-u14194.vm.elestio.app;

    location /neuro_blogger_bot {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass $http_upgrade;
        proxy_redirect off;
        proxy_pass http://172.27.0.2:3001;
    }

    # Аналогичные блоки для других ботов с соответствующими портами...
}
```

> **ВАЖНО:** Используйте IP-адрес контейнера вместо имени хоста `app`. IP-адрес можно получить с помощью команды:
> ```bash
> docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots
> ```

## Настройка вебхуков Telegram

Вебхуки настраиваются автоматически при запуске контейнера с ботами. URL вебхуков формируются по шаблону:
```
https://999-multibots-telegraf-u14194.vm.elestio.app/BOT_NAME
```

Пример: 
- `https://999-multibots-telegraf-u14194.vm.elestio.app/neuro_blogger_bot`
- `https://999-multibots-telegraf-u14194.vm.elestio.app/MetaMuse_Manifest_bot`

Для проверки статуса вебхуков используйте команду:
```bash
curl -s https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo
```

## Диагностика проблем

### Проверка IP-адресов контейнеров

```bash
docker inspect -f '{{.Name}} - {{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 999-multibots bot-proxy
```

### Проверка слушающих портов

```bash
docker exec 999-multibots netstat -tulpn | grep LISTEN
```

### Проверка статуса вебхуков

```bash
curl -s https://api.telegram.org/bot$BOT_TOKEN/getWebhookInfo
```

### Тестирование вебхуков

```bash
curl -s -X POST https://999-multibots-telegraf-u14194.vm.elestio.app/neuro_blogger_bot -d '{"update_id":123456,"message":{"message_id":123,"from":{"id":123456,"first_name":"Test"},"chat":{"id":123456,"type":"private"},"text":"/start"}}'
```

## Правила по конфигурации и запуску

1. **Не запускайте несколько копий контейнеров с одинаковыми портами**. Это приведет к конфликтам.
2. **Не используйте имена хостов в конфигурации Nginx** - используйте IP-адреса.
3. **Проверяйте IP-адреса после перезапуска** - они могут измениться.
4. **Следите за тем, чтобы не было дублирующихся docker-compose** запущенных через разные методы (docker-compose up и docker stack deploy).

## Исправление распространенных проблем

### Ошибка "Connection refused"

Если в логах Nginx вы видите ошибку "Connection refused", проверьте:
1. IP-адрес контейнера с ботами (возможно, он изменился)
2. Запущены ли нужные порты в контейнере с ботами
3. Нет ли конфликтующих контейнеров

### Ошибка "Wrong response from the webhook"

Эта ошибка обычно возникает, когда вебхук возвращает не HTTP 200 OK. Проверьте:
1. Конфигурацию Nginx
2. Работоспособность приложения в контейнере
3. Логи Nginx и контейнера с ботами