---
description: 
globs: 
alwaysApply: false
---
# 🕉️ Руководство по Добавлению Новых Аватаров

**Принцип:** Гармония в повторении. Документирование процесса добавления аватаров и их переводов в базу данных Supabase позволяет упростить и ускорить эту задачу, избегая ошибок и иллюзий.

## Цель

Обеспечить простой и повторяемый процесс добавления новых аватаров и связанных с ними переводов в таблицы `avatars` и `translations` базы данных Supabase для проекта NeuroBlogger.

## Пошаговый Процесс

### 1. Подготовка Данных Аватара

- **Источник данных:** Данные для нового аватара могут быть подготовлены вручную или взяты из любого удобного формата. Главное — собрать все необходимые поля для вставки в таблицу.
- **Необходимые поля для таблицы `avatars`:**
  - `telegram_id` (уникальный идентификатор бота в Telegram, например, `411128512`)
  - `avatar_url` (URL аватара, например, `'https://t.me/i/userpic/320/Kaya_easy_art_bot.jpg'`)
  - `group` (группа, к которой относится аватар, например, `'easy_art'`)
  - `created_at` (дата создания, например, `'2025-01-01T00:00:00Z'`)
  - `updated_at` (дата обновления, например, `'2025-01-01T00:00:00Z'`)
  - `bot_name` (имя бота, например, `'Kaya_easy_art_bot'`)

- **Шаблон SQL-запроса для вставки в таблицу `avatars`:**
  ```sql
  INSERT INTO avatars (telegram_id, avatar_url, "group", created_at, updated_at, bot_name)
  VALUES (411128512, 'https://t.me/i/userpic/320/Kaya_easy_art_bot.jpg', 'easy_art', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 'Kaya_easy_art_bot')
  ON CONFLICT (telegram_id) DO UPDATE SET
    avatar_url = EXCLUDED.avatar_url,
    "group" = EXCLUDED."group",
    updated_at = EXCLUDED.updated_at,
    bot_name = EXCLUDED.bot_name;
  ```

- **Проверка уникальности:** Перед вставкой убедитесь, что `telegram_id` уникален. Если запись уже существует, запрос выше обновит данные (используется `ON CONFLICT`).

### 2. Подготовка Переводов для Аватара

- **Источник текстов:** Тексты для переводов (например, стартовое сообщение бота) готовятся вручную или копируются из существующих примеров.
- **Необходимые поля для таблицы `translations`:**
  - `id` (уникальный идентификатор записи, например, `201` для английского и `202` для русского)
  - `language_code` (код языка, например, `'en'` или `'ru'`)
  - `key` (ключ сообщения, например, `'start'`)
  - `translation` или `value` (текст сообщения, экранируйте одинарные кавычки как `''`)
  - `bot_name` (имя бота, например, `'Kaya_easy_art_bot'`)
  - Дополнительные поля (опционально): `url`, `buttons`, `category`, `is_override`

- **Пример текста для стартового сообщения (английский, `id=201`):**
  ```
  Hey there! I''m Kaya — your personal stylist in the world of new realities. 🌟

  Here, we don''t just learn to create visuals. We learn to try on new possibilities — the ones that have long lived inside you but haven''t yet taken shape.

  Visuals through AI are a way to express not just taste, but also your inner direction. 💡

  When your visual image resonates with your inner "self," people start to feel it. See it. And your reality begins to reflect the version of you that you truly aspire to be.

  This is how desires start to come true — through a clear image and bold expression. ✨

  The technology is already here. And those who know how to use it — move faster, feel deeper, and create their world by their own rules. 🚀

  ⸻

  🖖 What we can do together:
  • Master AI easily and with joy
  • Create a digital avatar that truly reflects you
  • Generate stylish neuro-photos and visuals
  • Level up your social media game
  • Express your inner world through art

  Ready to dive in? Let''s create something extraordinary! 🎨
  ```

- **Пример текста для стартового сообщения (русский, `id=202`):**
  ```
  Привет! Я Кая — твой проводник в мир нейро-арта и новых реальностей. 🌟

  Здесь мы не просто создаём визуалы. Мы учимся примерять новые возможности — те, что давно живут внутри тебя, но ещё не обрели форму.

  Визуалы через ИИ — это способ выразить не просто вкус, а внутренний вектор. Твою суть. 💡

  Когда твой визуальный образ резонирует с твоим внутренним "я", люди начинают это чувствовать. Видеть. И твоя реальность отражает ту версию тебя, к которой ты стремишься.

  Так желания начинают сбываться — через ясный образ и смелое выражение. ✨

  Технология уже здесь. И те, кто умеет ею пользоваться — движутся быстрее, чувствуют глубже и создают свой мир по своим правилам. 🚀

  ⸻

  🖖 Что мы можем вместе:
  • Освоить ИИ легко и с радостью
  • Создать цифрового аватара, который отражает именно тебя
  • Генерировать стильные нейро-фото и визуалы
  • Прокачать твои соцсети
  • Выразить внутренний мир через искусство

  Готов погрузиться? Давай создадим что-то невероятное! 🎨
  ```

- **Шаблон SQL-запроса для обновления или вставки в таблицу `translations`:**
  ```sql
  INSERT INTO translations (id, language_code, key, translation, bot_name)
  VALUES (201, 'en', 'start', 'Hey there! I''m Kaya — your personal stylist in the world of new realities. 🌟

Here, we don''t just learn to create visuals. We learn to try on new possibilities — the ones that have long lived inside you but haven''t yet taken shape.

[...]', 'Kaya_easy_art_bot')
  ON CONFLICT (id) DO UPDATE SET
    language_code = EXCLUDED.language_code,
    key = EXCLUDED.key,
    translation = EXCLUDED.translation,
    bot_name = EXCLUDED.bot_name;
  ```

- **Примечание по экранированию:** Убедитесь, что все одинарные кавычки в тексте экранированы как `''`. Для больших текстов используйте многострочные строки в SQL или инструменты форматирования.

### 3. Выполнение SQL-Запросов

- **Инструмент:** Используйте инструмент `mcp_supabase_execute_sql` с указанием `project_id` (например, `yuukfqcsdhkyxegfwlcb`).
- **Проверка перед выполнением:** Убедитесь, что запросы синтаксически корректны. Для больших текстов рекомендуется сначала протестировать запрос на небольшом фрагменте.
- **Пример команды для выполнения:**
  ```
  mcp_supabase_execute_sql(project_id='yuukfqcsdhkyxegfwlcb', query='INSERT INTO avatars ...')
  ```

### 4. Проверка Успешности Выполнения

- **Проверка вставки в `avatars`:**
  ```sql
  SELECT * FROM avatars WHERE telegram_id = 411128512 LIMIT 1;
  ```

- **Проверка вставки/обновления в `translations`:**
  ```sql
  SELECT * FROM translations WHERE id = 201 LIMIT 1;
  SELECT * FROM translations WHERE id = 202 LIMIT 1;
  ```

- **Ожидаемый результат:** Убедитесь, что данные корректно отображаются в таблицах. Если данные отсутствуют или некорректны, проверьте логи ошибок или синтаксис запроса.

### 5. Дополнительные Проверки из Кодовой Базы

- **Уникальность `telegram_id`:** В коде может быть логика, проверяющая уникальность `telegram_id` перед использованием. Убедитесь, что добавляемый аватар не конфликтует с существующими (см. `src/core/supabase/queries.ts`).
- **Валидация данных:** Если в коде есть функции валидации для `bot_name` или других полей, используйте их перед вставкой данных (например, проверка формата `avatar_url`).
- **Логирование:** После добавления аватара проверьте логи бота, чтобы убедиться, что аватар корректно инициализируется (см. `src/bot.ts`).

### 6. Документирование Успеха

- После успешного добавления аватара и переводов добавьте запись в `SUCCESS_HISTORY.md` с описанием процесса и указанием коммита, если применимо.
- Пример записи:
  ```
  ## Успешное добавление аватара Kaya
  - **Дата**: 2025-01-03
  - **Описание**: Успешно добавлен аватар Kaya_easy_art_bot и его переводы (id=201, id=202).
  - **Паттерн успеха**: Использование шаблонов SQL-запросов с экранированием символов.
  - **Коммит**: <хеш_коммита> (Ветка: <имя_ветки>)
  - **Ссылка**: Текущая задача в `current_task.md`.
  ```

**Цель:** Сделать процесс добавления новых аватаров и переводов простым, повторяемым и защищенным от ошибок, чтобы каждый новый аватар мог быть добавлен с минимальными усилиями.

*Ом Шанти. Пусть каждый шаг будет ясен и гармоничен.* 🙏
