# 🔐 Infisical Multi-Environment Configuration

## Три окружения

Проект использует **три изолированных окружения** в Infisical, соответствующих git веткам:

### 1. 🧪 Development (`dev`)
- **Git ветка**: Любая feature ветка (локальная разработка)
- **Назначение**: Локальная разработка и тестирование
- **Токены**: `BOT_TOKEN_TEST_1`, `BOT_TOKEN_TEST_2`
- **Активация**: `INFISICAL_ENVIRONMENT=dev` в `.env`
- **Боты**: Тестовые боты (clip_maker_neuro_bot, helper_999_bot)

### 2. 🎭 Staging (`staging`)
- **Git ветка**: `main`
- **Назначение**: Pre-production тестирование с реальными данными
- **Токены**: `BOT_TOKEN_1` через `BOT_TOKEN_10`
- **Активация**: `INFISICAL_ENVIRONMENT=staging` в `.env`
- **Боты**: Все 10 продакшн ботов в тестовом режиме

### 3. 🚀 Production (`prod`)
- **Git ветка**: `production`
- **Назначение**: Реальное production окружение
- **Токены**: `BOT_TOKEN_1` через `BOT_TOKEN_10`
- **Активация**: `INFISICAL_ENVIRONMENT=prod` в `.env`
- **Боты**: Все 10 продакшн ботов

## Быстрый старт

### Development (локально)
```bash
# В .env файле:
INFISICAL_ENVIRONMENT=dev
NODE_ENV=development

# Запуск:
npm run dev
```

### Staging (тестовый сервер)
```bash
# В .env файле:
INFISICAL_ENVIRONMENT=staging
NODE_ENV=production

# Запуск:
npm start
```

### Production (боевой сервер)
```bash
# В .env файле:
INFISICAL_ENVIRONMENT=prod
NODE_ENV=production

# Запуск:
npm start
```

## Структура секретов в Infisical

### Окружение `dev`
```
BOT_TOKEN_TEST_1=7313269542:AAG6NLu6N...
BOT_TOKEN_TEST_2=5081334256:AAEoEcC3-...
TEST_BOT_NAME=clip_maker_neuro_bot
SUPABASE_URL=https://yuukfqcsdhkyxegfwlcb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
# + все остальные общие секреты
```

### Окружения `staging` и `prod`
```
BOT_TOKEN_1=<neuro_blogger_bot>
BOT_TOKEN_2=<MetaMuse_Manifest_bot>
BOT_TOKEN_3=<ZavaraBot>
BOT_TOKEN_4=<LeeSolarbot>
BOT_TOKEN_5=<NeuroLenaAssistant_bot>
BOT_TOKEN_6=<NeurostylistShtogrina_bot>
BOT_TOKEN_7=<Gaia_Kamskaia_bot>
BOT_TOKEN_8=<Kaya_easy_art_bot>
BOT_TOKEN_9=<AI_STARS_bot>
BOT_TOKEN_10=<HaimGroupMedia_bot>
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
# + все остальные секреты
```

## Настройка в Infisical

1. Открой https://app.infisical.com
2. Перейди в проект "999"
3. В верхней части найди выпадающее меню окружений
4. Убедись что созданы три окружения: `dev`, `staging`, `prod`
5. Добавь соответствующие секреты в каждое окружение

## Логика загрузки токенов

```typescript
if (INFISICAL_ENVIRONMENT === 'dev') {
  // Загружаем ТОЛЬКО тестовые токены
  BOT_TOKEN_TEST_1, BOT_TOKEN_TEST_2
} else if (INFISICAL_ENVIRONMENT === 'staging' || 'prod') {
  // Загружаем production токены
  BOT_TOKEN_1 ... BOT_TOKEN_10
}
```

## Проверка окружения

```bash
# Запустить тестовый скрипт:
npx tsx scripts/test-infisical.ts

# Вывод покажет:
# ✅ Environment: dev
# ✅ Всего секретов: 97
# ✅ BOT_TOKEN_TEST_1 найден
# ✅ SUPABASE_URL найден
```

## Troubleshooting

### Ошибка: "Secret not found"
- Проверь что `INFISICAL_ENVIRONMENT` установлен правильно в `.env`
- Убедись что секрет добавлен в нужное окружение в Infisical

### Ошибка: "Environment not found"
- Создай окружение в Infisical через веб-интерфейс
- Убедись что Machine Identity добавлен к проекту

### Неправильные токены загружаются
- Проверь значение `INFISICAL_ENVIRONMENT` в `.env`
- Перезапусти приложение после изменения `.env`

## Best Practices

1. **Никогда** не коммить production токены в git
2. **Всегда** используй `dev` окружение для локальной разработки
3. **Используй** `staging` для тестирования перед production
4. **Проверяй** какое окружение активно перед деплоем
5. **Держи** секреты только в Infisical, не в локальных файлах
