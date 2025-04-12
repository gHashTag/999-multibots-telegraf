# NeuroBlogger

## Описание проекта
NeuroBlogger - это проект для создания и управления контентом блога с использованием нейронных сетей и интеграцией с Telegram.

## Ключевые технологии
- Node.js
- Telegraf.js
- Supabase
- Docker
- Inngest

## Структура проекта
- Телеграм-бот для управления блогом
- База данных Supabase для хранения данных
- Интеграция с платежной системой
- Система тестирования

## Supabase конфигурация
- ID: yuukfqcsdhkyxegfwlcb
- Organization ID: hlenjgpkwenatqlfwzlg
- Регион: eu-central-2
- Статус: ACTIVE_HEALTHY
- БД хост: db.yuukfqcsdhkyxegfwlcb.supabase.co
- Версия БД: 15.8.1.021

## Команды для развертывания
```bash
ssh -i ~/.ssh/id_rsa root@999-multibots-u14194.vm.elestio.app
cd /opt/app/999-multibots-telegraf
docker compose down
docker-compose up --build -d
```

## MCP конфигурация
```json
{
  "mcpServers": {
    "googlesheets_composio": {
      "url": "https://mcp.composio.dev/googlesheets/sour-old-lion-KK2T7-"
    },
    "googlesuper_composio": {
      "url": "https://mcp.composio.dev/googlesuper/calm-damp-magician-B-f2iC"
    },
    "supabase_composio": {
      "url": "https://mcp.composio.dev/supabase/calm-damp-magician-B-f2iC"
    },
    "gmail_composio": {
      "url": "https://mcp.composio.dev/gmail/calm-damp-magician-B-f2iC"
    },
    "telegram-mcp": {
      "command": "telegram-mcp",
      "env": {
        "TG_APP_ID": "94892",
        "TG_API_HASH": "cacf9ad137d228611b49b2ecc6d68d43"
      }
    },
    "googlemeet_composio": {
      "url": "https://mcp.composio.dev/googlemeet/calm-damp-magician-B-f2iC"
    },
    "youtube_composio": {
      "url": "https://mcp.composio.dev/youtube/calm-damp-magician-B-f2iC"
    },
    "github_composio": {
      "url": "https://mcp.composio.dev/github/calm-damp-magician-B-f2iC"
    }
  }
}
```

## Платежная система
Для работы с балансом пользователей используется специальная SQL-функция `get_user_balance`, которая вычисляет баланс на основе записей в таблице `payments_v2`.

### Правила обработки платежей
1. Все платежи должны проходить через централизованный процессор payment/process
2. Никогда не изменять напрямую баланс пользователя в базе данных
3. Всегда использовать только одну запись в payments_v2 на транзакцию
4. Всегда проверять наличие существующего платежа по полям operation_id или inv_id

### Типы транзакций
1. money_income - пополнение баланса (положительное значение)
2. money_expense - списание средств (отрицательное значение)

## Последнее обновление
04.07.2025
