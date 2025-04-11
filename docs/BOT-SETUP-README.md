# Инструкция по добавлению новых ботов 🤖

Эта инструкция описывает процесс добавления новых Telegram ботов в систему 999-multibots-telegraf.

## 1. Подготовка бота в Telegram 📱

1. Создайте нового бота через [@BotFather](https://t.me/BotFather) в Telegram
2. Сохраните полученный токен (например: `1234567890:ABCDEFGHIJKLMNOPQRSTuvwxyz`)
3. Настройте имя, описание и изображение бота по желанию

## 2. Добавление бота в систему 🔧

### 2.1. Добавление токена в .env файл

Откройте файл `.env` и добавьте новый токен:

```
# Существующие токены
BOT_TOKEN_1=...
BOT_TOKEN_2=...
...
# Добавьте новый токен, используя следующий порядковый номер
BOT_TOKEN_8=1234567890:ABCDEFGHIJKLMNOPQRSTuvwxyz
```

### 2.2. Добавление бота в src/core/bot/index.ts

Откройте файл `src/core/bot/index.ts` и добавьте имя нового бота в объект `BOT_NAMES`:

```typescript
export const BOT_NAMES: Record<string, string | undefined> = {
  ['neuro_blogger_bot']: process.env.BOT_TOKEN_1,
  ['MetaMuse_Manifest_bot']: process.env.BOT_TOKEN_2,
  // ... существующие боты ...
  ['NewBotName_bot']: process.env.BOT_TOKEN_8, // Добавьте вашего нового бота
}
```

### 2.3. Добавление порта в docker-compose.yml

Если вы добавляете 8-го бота, то нужно добавить порт 3008 в docker-compose.yml:

```yaml
services:
  app:
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
      - '3008:3008'  # Добавьте новый порт
```

### 2.4. Обновление конфигурации Nginx

Добавьте новый блок location в файл `nginx-config/default.conf`:

```nginx
location /NewBotName_bot {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_cache_bypass $http_upgrade;
    proxy_redirect off;
    proxy_pass http://172.27.0.2:3008;  # IP-адрес контейнера и номер порта
}
```

## 3. Применение изменений 🚀

Подключитесь к серверу через SSH:
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
```

Перейдите в каталог проекта:
```bash
cd /opt/app/999-multibots-telegraf
```

Получите последние изменения из репозитория:
```bash
git pull
```

Запустите обновление:
```bash
./update-docker.sh
```

## 4. Проверка работы нового бота ✅

### 4.1. Проверка статуса вебхука

```bash
curl -s https://api.telegram.org/bot$BOT_TOKEN_8/getWebhookInfo | grep -v token
```

Вы должны увидеть URL вебхука:
```
{"ok":true,"result":{"url":"https://999-multibots-telegraf-u14194.vm.elestio.app/NewBotName_bot","has_custom_certificate":false,"pending_update_count":0,"max_connections":40,"ip_address":"138.199.145.157"}}
```

### 4.2. Проверка доступности бота

Отправьте сообщение вашему боту в Telegram и убедитесь, что он отвечает.

### 4.3. Мониторинг логов

Проверьте логи, чтобы убедиться, что бот работает:
```bash
docker logs 999-multibots | grep NewBotName_bot
```

## 5. Диагностика проблем 🔍

### 5.1. Обновление IP-адреса в Nginx

Если IP-адрес контейнера изменился, обновите его в конфигурации:
```bash
./update-nginx-config.sh
```

### 5.2. Проверка конфигурации 

Используйте скрипт-помощник для проверки конфигурации:
```bash
./nginx-helper.sh
```

### 5.3. Перезапуск контейнеров

Если бот не работает, попробуйте перезапустить контейнеры:
```bash
docker-compose down
docker-compose up -d
./update-nginx-config.sh
```

## 6. Удаление бота ❌ (при необходимости)

1. Удалите токен из `.env`
2. Удалите бота из `BOT_NAMES` в `src/core/bot/index.ts`
3. Удалите соответствующий блок location из `nginx-config/default.conf`
4. Применените изменения с помощью `./update-docker.sh` 