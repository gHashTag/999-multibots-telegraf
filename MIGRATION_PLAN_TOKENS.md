# 🔄 План миграции токенов - Унификация "Три головы дракона"

## 📋 Текущее состояние

### Dev окружение
- ✅ `BOT_TOKEN_TEST_1` - существует
- ✅ `BOT_TOKEN_TEST_2` - существует

### Staging окружение
- ❌ Не настроено

### Prod окружение
- ❓ Токены `BOT_TOKEN_1`-`BOT_TOKEN_10` (нужно проверить)

## 🎯 Целевое состояние (УНИФИЦИРОВАННОЕ)

### 🟢 Dev окружение
```
BOT_TOKEN_1  → @ai_koshey_bot (было: BOT_TOKEN_TEST_1)
BOT_TOKEN_2  → @helper_999_bot (было: BOT_TOKEN_TEST_2)
```

### 🟡 Staging окружение
```
BOT_TOKEN_1  → @neuro_blogger_bot (staging)
BOT_TOKEN_2  → @MetaMuse_Manifest_bot (staging)
...
BOT_TOKEN_10 → @HaimGroupMedia_bot (staging)
```

### 🔴 Prod окружение
```
BOT_TOKEN_1  → @neuro_blogger_bot (production)
BOT_TOKEN_2  → @MetaMuse_Manifest_bot (production)
...
BOT_TOKEN_10 → @HaimGroupMedia_bot (production)
```

## ✨ Преимущества унифицированной схемы

1. **Простота** - везде одинаковые имена `BOT_TOKEN_1`-`BOT_TOKEN_10`
2. **Масштабируемость** - легко добавлять новые боты (BOT_TOKEN_11, BOT_TOKEN_12...)
3. **Нет путаницы** - убрали _TEST_, везде единообразие
4. **Изоляция** - каждое окружение имеет свои токены с одинаковыми именами

## 🔧 Шаги миграции

### Шаг 1: Dev окружение (СДЕЛАТЬ СЕЙЧАС)

**Проблема**: В Infisical нельзя переименовать секрет напрямую.

**Решение**: Вручную через Web UI:

1. Открыть https://app.infisical.com
2. Проект "999" → Environment "dev"
3. Создать новые секреты:
   - `BOT_TOKEN_1` = [скопировать значение из BOT_TOKEN_TEST_1]
   - `BOT_TOKEN_2` = [скопировать значение из BOT_TOKEN_TEST_2]
4. Удалить старые:
   - ❌ Удалить `BOT_TOKEN_TEST_1`
   - ❌ Удалить `BOT_TOKEN_TEST_2`

### Шаг 2: Staging окружение

1. В Infisical создать environment "staging"
2. Добавить токены:
   - `BOT_TOKEN_1`-`BOT_TOKEN_10` (staging версии ботов)

### Шаг 3: Prod окружение

1. Проверить существующие токены
2. Убедиться что есть `BOT_TOKEN_1`-`BOT_TOKEN_10`
3. Удалить лишние токены (если есть)

### Шаг 4: Обновить код

Изменить `src/index.ts`:

```typescript
// ❌ СТАРЫЙ КОД (УДАЛИТЬ):
if (env === 'dev') {
  process.env.BOT_TOKEN_TEST_1 = getSecret('BOT_TOKEN_TEST_1')
  process.env.BOT_TOKEN_TEST_2 = getSecret('BOT_TOKEN_TEST_2')
}

// ✅ НОВЫЙ КОД (ЕДИНООБРАЗНЫЙ):
if (env === 'dev') {
  // Development: только 2 бота для тестирования
  for (let i = 1; i <= 2; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
} else if (env === 'staging' || env === 'prod') {
  // Staging/Production: 10 ботов
  for (let i = 1; i <= 10; i++) {
    process.env[`BOT_TOKEN_${i}`] = getSecret(`BOT_TOKEN_${i}`)
  }
}
```

### Шаг 5: Обновить конфигурацию ботов

Изменить `src/core/bot/index.ts`:

```typescript
// ❌ УДАЛИТЬ специфичную логику для TEST токенов
// ✅ ОСТАВИТЬ только единообразную логику

export const DEFAULT_BOT_TOKEN = process.env.BOT_TOKEN_1
export const DEFAULT_BOT_NAME = isDev ? 'ai_koshey_bot' : 'neuro_blogger_bot'
```

## 📊 Проверка после миграции

```bash
# 1. Dev окружение
npm run dev
# Ожидается: 2 бота запускаются через BOT_TOKEN_1-2

# 2. Staging (на staging сервере)
INFISICAL_ENVIRONMENT=staging npm start
# Ожидается: 10 ботов запускаются

# 3. Production (на production сервере)
INFISICAL_ENVIRONMENT=prod npm start
# Ожидается: 10 ботов запускаются
```

## 🚨 Откат (если что-то пойдет не так)

1. В Infisical вернуть старые токены `BOT_TOKEN_TEST_1-2`
2. Откатить изменения в коде через git
3. Перезапустить приложение

## ✅ Чеклист выполнения

- [ ] Создать BOT_TOKEN_1-2 в dev environment
- [ ] Удалить BOT_TOKEN_TEST_1-2 из dev
- [ ] Обновить src/index.ts
- [ ] Обновить src/core/bot/index.ts
- [ ] Протестировать dev окружение
- [ ] Обновить THREE_HEADS_DRAGON.md
- [ ] Создать staging environment
- [ ] Добавить токены в staging
- [ ] Проверить prod токены
- [ ] Задеплоить на production
