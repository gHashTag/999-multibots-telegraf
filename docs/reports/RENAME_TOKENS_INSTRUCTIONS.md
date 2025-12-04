# 🔧 Инструкция по переименованию токенов в Infisical

## 📋 Что нужно сделать

Переименовать токены в окружении **dev**:
- `BOT_TOKEN_TEST_1` → `BOT_TOKEN_1`
- `BOT_TOKEN_TEST_2` → `BOT_TOKEN_2`

## 🌐 Шаги через Web UI (РЕКОМЕНДУЕТСЯ)

### 1. Открыть Infisical

https://app.infisical.com

### 2. Перейти в проект "999"

- Dashboard → Projects → "999"
- Или прямая ссылка: https://app.infisical.com/project/fd763fa3-35d5-4045-93bd-1795c5f00fc3

### 3. Выбрать окружение "dev"

В левом меню выбрать **Development (dev)**

### 4. Скопировать значения токенов

**BOT_TOKEN_TEST_1**:
1. Найти строку `BOT_TOKEN_TEST_1`
2. Кликнуть на иконку "глаз" 👁️ чтобы увидеть значение
3. Скопировать полное значение (начинается с цифр, например: `765518...`)
4. Сохранить в буфер обмена

**BOT_TOKEN_TEST_2**:
1. Найти строку `BOT_TOKEN_TEST_2`
2. Кликнуть на иконку "глаз" 👁️
3. Скопировать значение
4. Сохранить отдельно

### 5. Создать новые токены

**Создать BOT_TOKEN_1**:
1. Кликнуть кнопку "+ Add Secret" (в правом верхнем углу)
2. Key: `BOT_TOKEN_1`
3. Value: [вставить значение из BOT_TOKEN_TEST_1]
4. Кликнуть "Create Secret"

**Создать BOT_TOKEN_2**:
1. Кликнуть кнопку "+ Add Secret"
2. Key: `BOT_TOKEN_2`
3. Value: [вставить значение из BOT_TOKEN_TEST_2]
4. Кликнуть "Create Secret"

### 6. Удалить старые токены

**Удалить BOT_TOKEN_TEST_1**:
1. Найти строку `BOT_TOKEN_TEST_1`
2. Кликнуть на иконку "три точки" ⋮ справа
3. Выбрать "Delete"
4. Подтвердить удаление

**Удалить BOT_TOKEN_TEST_2**:
1. Найти строку `BOT_TOKEN_TEST_2`
2. Кликнуть на иконку "три точки" ⋮
3. Выбрать "Delete"
4. Подтвердить удаление

### 7. Проверить результат

После выполнения должны остаться только:
- ✅ `BOT_TOKEN_1`
- ✅ `BOT_TOKEN_2`

И НЕ должно быть:
- ❌ `BOT_TOKEN_TEST_1`
- ❌ `BOT_TOKEN_TEST_2`

## ✅ Проверка

После переименования запустить:

```bash
npx tsx scripts/list-bot-tokens.ts
```

Ожидаемый результат:
```
🤖 [List] Найдено BOT токенов: 2

   1. BOT_TOKEN_1
   2. BOT_TOKEN_2
```

## 🔄 Альтернатива: через CLI (если установлен)

Если у тебя установлен Infisical CLI:

```bash
# Получить значения
infisical secrets get BOT_TOKEN_TEST_1 --env=dev
infisical secrets get BOT_TOKEN_TEST_2 --env=dev

# Создать новые
infisical secrets set BOT_TOKEN_1="[значение]" --env=dev
infisical secrets set BOT_TOKEN_2="[значение]" --env=dev

# Удалить старые
infisical secrets delete BOT_TOKEN_TEST_1 --env=dev
infisical secrets delete BOT_TOKEN_TEST_2 --env=dev
```

## 📞 Помощь

Если что-то пошло не так:
- Старые токены можно восстановить через History в Infisical
- Или просто создать заново с правильными значениями
