# 🔍 ИНСТРУКЦИЯ ПО ПОИСКУ ВАШИХ МОДЕЛЕЙ В SUPABASE

## Ваш Telegram ID: 435572800

---

## 🎯 ШАГ 1: ВОЙДИТЕ В SUPABASE

1. Откройте https://supabase.com/dashboard
2. Найдите проект: **fd763fa3-35d5-4045-93bd-1795c5f00fc3**
3. Перейдите в **SQL Editor**

---

## 🔎 ШАГ 2: ВЫПОЛНИТЕ ЗАПРОСЫ

### 2.1 Найдите себя в базе пользователей

```sql
SELECT *
FROM users
WHERE telegram_id = '435572800';
```

**ОЖИДАЕМЫЙ РЕЗУЛЬТАТ:** Ваша запись с именем, username, уровнем

---

### 2.2 Посмотрите ВСЕ ваши платежи за нейрофото

```sql
SELECT
  id,
  created_at,
  amount,
  stars,
  service_type,
  description,
  status,
  bot_name,
  metadata
FROM payments_v2
WHERE telegram_id = '435572800'
  AND service_type ILIKE '%neuro%'
ORDER BY created_at DESC
LIMIT 50;
```

**ВАЖНО!** Ищите поле `metadata` - там сохраняются:
- `model_url` - URL модели
- `model_type` - тип модели
- `lora_path` - путь к LoRA модели
- `trigger_word` - ваш trigger word

---

### 2.3 Проверьте ваши обученные модели

```sql
SELECT
  id,
  model_name,
  trigger_word,
  model_url,
  status,
  api,
  steps,
  created_at
FROM model_trainings
WHERE telegram_id = '435572800'
ORDER BY created_at DESC;
```

**ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ:**
- **SUCCESS** - модель обучена правильно
- **FAILED** - обучение провалилось
- **PROCESSING** - еще обучается

---

### 2.4 Посмотрите историю генераций

```sql
SELECT
  prompt_id,
  created_at,
  prompt,
  model_type,
  media_url,
  status
FROM prompts_history
WHERE telegram_id = '435572800'
  AND mode = 'neuro_photo'
ORDER BY created_at DESC
LIMIT 20;
```

---

## 📊 ШАГ 3: АНАЛИЗИРУЙТЕ METADATA

В поле `metadata` из платежей ищите:

### ✅ ХОРОШИЕ МЕТАДАННЫЕ:
```json
{
  "model_url": "https://replicate.com/your-model",
  "model_type": "flux-schnell",
  "trigger_word": "your_name",
  "lora_path": "https://...safetensors",
  "lora_scale": 1.0
}
```

### ❌ ПРОБЛЕМНЫЕ МЕТАДАННЫЕ:
```json
{
  "model_url": "https://v3b.fal.media/files/b/elephant/NEURO_SAGE_lora.safetensors",
  "trigger_word": "NEURO_SAGE",
  "lora_trigger": "NEURO_SAGE"
}
```

**ПРОБЛЕМА:** Если видите `NEURO_SAGE` - это общая модель, не ваша!

---

## 🎯 ШАГ 4: НАЙДИТЕ ПРОБЛЕМУ

### Если модели НЕТ в model_trainings:
- ❌ Модель была удалена
- ✅ **Решение:** Обучите новую через `/face train`

### Если в metadata только NEURO_SAGE:
- ❌ Использовалась общая модель, не ваша
- ✅ **Решение:** Обучите личную модель с trigger word

### Если trigger_word не совпадает с вашим именем:
- ❌ Неправильный trigger word
- ✅ **Решение:** Используйте правильный trigger word в промпте

### Если статус модели = FAILED:
- ❌ Обучение провалилось
- ✅ **Решение:** Переобучите с новыми фото

---

## 🚀 ШАГ 5: ВОССТАНОВЛЕНИЕ

### Вариант 1: Быстрое восстановление

1. **Удалите плохие модели:**
```sql
DELETE FROM model_trainings
WHERE telegram_id = '435572800'
  AND status != 'SUCCESS';
```

2. **Обучите новую:**
   - Отправьте 5-10 качественных фото в бота
   - Используйте команду `/face train`
   - Выберите уникальный trigger word (ваше имя)

### Вариант 2: Проверка старых данных

Если найдете старые модели в model_trainings с хорошими данными:

1. **Запишите параметры:**
   - trigger_word
   - model_url
   - steps

2. **Попробуйте использовать их**

---

## 📝 ПРИМЕРЫ ЗАПРОСОВ ДЛЯ РЕЗЕРВНОГО ПОИСКА

### Поиск всех упоминаний вашего ID:

```sql
-- Платежи
SELECT 'payments_v2' as table_name, count(*) as count
FROM payments_v2 WHERE telegram_id = '435572800'

UNION ALL

-- История промптов
SELECT 'prompts_history' as table_name, count(*) as count
FROM prompts_history WHERE telegram_id = '435572800'

UNION ALL

-- Модели
SELECT 'model_trainings' as table_name, count(*) as count
FROM model_trainings WHERE telegram_id = '435572800'

UNION ALL

-- Пользователи
SELECT 'users' as table_name, count(*) as count
FROM users WHERE telegram_id = '435572800';
```

### Поиск в метаданных:

```sql
SELECT
  id,
  created_at,
  service_type,
  metadata
FROM payments_v2
WHERE telegram_id = '435572800'
  AND metadata::text ILIKE '%435572800%'
  OR metadata::text ILIKE '%model%'
ORDER BY created_at DESC
LIMIT 20;
```

---

## ⚡ ЭКСПРЕСС-ПРОВЕРКА

Запустите ВСЕ эти запросы по очереди и пришлите мне результаты:

1. ✅ Данные пользователя
2. ✅ Платежи за нейрофото с metadata
3. ✅ Обученные модели
4. ✅ История генераций
5. ✅ Статистика

Я проанализирую и дам точное решение!

---

## 🆘 ЕСЛИ НИЧЕГО НЕ НАШЛИ

### Возможные причины:
1. **Модели удалены при реструктуризации** (коммит "Навести порядок")
2. **Данные в другой таблице**
3. **Используется другой Telegram ID**

### Решение:
1. Обучите новую модель с нуля
2. Используйте уникальный trigger word
3. Проверьте что генерация идет с вашей моделью

---

**📞 После выполнения запросов пришлите мне результаты - я помогу восстановить ваши модели!**
