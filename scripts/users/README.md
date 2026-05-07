# 🔍 Скрипты для управления пользователями

Коллекция утилит для проверки и управления пользовательскими данными в production базе данных.

---

## 📋 Доступные скрипты

### 1. `check-user-models.ts` - Проверка моделей пользователя (TypeScript)

**Описание:** Детальная проверка всех натренированных моделей пользователя через Supabase API.

**Использование (локально):**
```bash
bun run scripts/users/check-user-models.ts <telegram_id>
```

**Пример:**
```bash
bun run scripts/users/check-user-models.ts 5439920152
```

**Что делает:**
- Получает информацию о пользователе из таблицы `users`
- Извлекает все модели из таблицы `model_trainings`
- Показывает детальную информацию о каждой модели:
  - ID, название, trigger word
  - Статус (succeeded, failed, pending, etc.)
  - API провайдер (replicate, fal, etc.)
  - Model URL, ZIP URL
  - Даты создания и обновления
  - Ошибки (если есть)
- Статистика по статусам и API
- Список успешных моделей с URL
- Модели с ошибками
- История генераций с моделями

**Требования:**
- Infisical credentials в `.env`
- Bun runtime
- TypeScript окружение

---

### 2. `check-models-prod.js` - Проверка моделей на production (Node.js)

**Описание:** Прямое выполнение проверки в Docker контейнере на production сервере.

**Использование (на сервере):**
```bash
ssh root@188.137.250.69
docker exec 999-multibots node /root/999-agents-telegraf/scripts/users/check-models-prod.js <telegram_id>
```

**Использование (локально через SSH):**
```bash
ssh root@188.137.250.69 "docker exec 999-multibots node /root/999-agents-telegraf/scripts/users/check-models-prod.js 5439920152"
```

**Что делает:**
- Использует секреты из Docker environment (уже загружены через Infisical)
- Выполняет те же проверки, что и TypeScript версия
- Более быстрый запуск (без компиляции)

**Требования:**
- SSH доступ к production серверу
- Docker контейнер должен быть запущен
- Node.js в контейнере

---

### 3. `check-models-remote.sh` - Удобный wrapper для удаленной проверки

**Описание:** Автоматизирует копирование скрипта и выполнение на сервере.

**Использование:**
```bash
chmod +x scripts/users/check-models-remote.sh
./scripts/users/check-models-remote.sh <telegram_id>
```

**Пример:**
```bash
./scripts/users/check-models-remote.sh 5439920152
```

**Что делает:**
1. Копирует `check-models-prod.js` на сервер
2. Выполняет скрипт в Docker контейнере
3. Показывает результаты

**Требования:**
- SSH доступ к production серверу
- `scp` и `ssh` команды

---

### 4. `check-models-direct.sql` - SQL запросы для ручной проверки

**Описание:** Набор готовых SQL запросов для выполнения в Supabase Dashboard.

**Использование:**
1. Открыть Supabase Dashboard
2. Перейти в SQL Editor
3. Скопировать нужный запрос из файла
4. Заменить `5439920152` на нужный telegram_id
5. Выполнить

**Доступные запросы:**
- Все модели пользователя
- Статистика по статусам
- Статистика по API
- Только успешные модели с URL
- Модели с ошибками
- Информация о пользователе
- История генераций

---

### 5. `force-exit-scene.ts` - Принудительный выход из сцены

**Описание:** Выводит пользователя из застрявшей Telegram сцены.

**Использование:**
```bash
bun run scripts/users/force-exit-scene.ts <telegram_id>
```

**Пример:**
```bash
bun run scripts/users/force-exit-scene.ts 5732975798
```

**Что делает:**
- Получает информацию о пользователе
- Определяет токен нужного бота
- Отправляет инструкцию пользователю для выхода из сцены
- Логирует операцию

---

## 🎯 Быстрый старт для проверки пользователя 5439920152

### Вариант 1: Локально (TypeScript)
```bash
bun run scripts/users/check-user-models.ts 5439920152
```

### Вариант 2: Через SSH wrapper (рекомендуется)
```bash
chmod +x scripts/users/check-models-remote.sh
./scripts/users/check-models-remote.sh 5439920152
```

### Вариант 3: Прямой SSH
```bash
ssh root@188.137.250.69 "docker exec 999-multibots node /root/999-agents-telegraf/scripts/users/check-models-prod.js 5439920152"
```

### Вариант 4: SQL в Supabase Dashboard
1. Открыть: https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
2. Вставить из `check-models-direct.sql`:
```sql
SELECT * FROM model_trainings
WHERE user_id = '5439920152' OR telegram_id = '5439920152'
ORDER BY created_at DESC;
```

---

## 📊 Пример вывода

```
🔐 Инициализация Infisical...
✅ Infisical инициализирован успешно

🔍 Проверяю модели пользователя 5439920152...

👤 Пользователь найден:
   Username: @theycallmeVesna
   Bot: neuro_blogger_bot
   Created: 14.12.2025, 10:30:15

📋 Найдено 3 моделей

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎭 Модель #1:
   ID: abc-123-def
   Название: vesna_model_v1
   Trigger Word: VESNA
   Статус: ✅ succeeded
   API: replicate
   Gender: female
   Steps: 1000
   Bot: neuro_blogger_bot
   Replicate ID: r8_abc123def456
   ZIP URL: ✅ Есть
   Model URL: ✅ https://replicate.delivery/models/abc123
   Создано: 10.12.2025, 15:20:30
   Обновлено: 10.12.2025, 17:45:12

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 Статистика по статусам:
   ✅ succeeded: 2
   ⏳ pending: 1

🔌 Статистика по API:
   replicate: 2
   fal: 1

✅ Успешных моделей с URL: 2
   1. vesna_model_v1 (replicate) - https://replicate.delivery/models/abc123
   2. vesna_model_v2 (replicate) - https://replicate.delivery/models/def456

📜 История генераций (последние 5):
   1. flux - completed - 12.12.2025, 18:30:45
   2. flux - completed - 11.12.2025, 14:22:10

✅ Проверка завершена!
```

---

## 🔧 Troubleshooting

### Ошибка: "SUPABASE_URL не найден"
**Решение:** Убедитесь, что Infisical инициализирован и секреты загружены в `.env`:
```bash
cat .env | grep INFISICAL
```

### Ошибка: "Permission denied" для .sh скрипта
**Решение:** Дайте права на выполнение:
```bash
chmod +x scripts/users/check-models-remote.sh
```

### Ошибка: "SSH connection refused"
**Решение:** Проверьте доступ к серверу:
```bash
ssh root@188.137.250.69 echo "OK"
```

### Ошибка: "Docker container not found"
**Решение:** Проверьте, что контейнер запущен:
```bash
ssh root@188.137.250.69 "docker ps | grep 999-multibots"
```

---

## 📚 Структура таблицы model_trainings

```sql
CREATE TABLE model_trainings (
  id UUID PRIMARY KEY,
  user_id TEXT,              -- Telegram ID (старое поле)
  telegram_id TEXT,          -- Telegram ID (новое поле)
  model_name TEXT,           -- Название модели
  trigger_word TEXT,         -- Триггерное слово для генерации
  zip_url TEXT,              -- URL архива с фотографиями
  model_url TEXT,            -- URL натренированной модели
  replicate_training_id TEXT,-- ID тренировки в Replicate
  status TEXT,               -- pending, processing, succeeded, failed
  error TEXT,                -- Текст ошибки (если есть)
  api TEXT,                  -- replicate, fal, etc.
  gender TEXT,               -- male, female
  steps INTEGER,             -- Количество шагов тренировки
  bot_name TEXT,             -- Название бота
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## 🎓 Полезные ссылки

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Production Server:** 188.137.250.69
- **Project Directory:** `/root/999-agents-telegraf`
- **Docker Container:** `999-multibots`

---

**Last Updated:** 2025-12-14
**Maintained by:** Claude Code Agent
