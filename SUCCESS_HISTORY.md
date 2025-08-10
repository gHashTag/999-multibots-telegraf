# SUCCESS_HISTORY.md - Летопись Успехов

## 2025-08-10: Исправление переполнения буфера при обработке видео и обучении моделей

### Проблема
При обучении модели и обработке видео через FFmpeg происходило переполнение буфера stdout из-за большого количества логов. Команды `exec()` использовали стандартный размер буфера (200KB), который был недостаточен для вывода FFmpeg.

### Решение
1. **Увеличен размер буфера до 50MB** в следующих файлах:
   - `src/services/localMorphingProcessor.ts`
   - `src/helpers/video-helpers.ts`
   
2. **Улучшена обработка команд exec()**: Вместо использования `promisify(exec)` создана кастомная функция с правильной типизацией и увеличенным буфером.

3. **Добавлены ограничения для axios** в `src/services/createModelTraining.ts`:
   - Увеличен таймаут до 5 минут для загрузки больших файлов
   - Ограничен размер ответа до 50MB
   - Ограничен размер тела запроса до 100MB

### Ключевой паттерн
```typescript
// Правильная обработка exec с увеличенным буфером
const execAsync = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}
```

### Результат
- ✅ Устранено переполнение буфера при выполнении FFmpeg команд
- ✅ Улучшено логирование - выводятся только основные данные, не весь объект ответа
- ✅ Типы TypeScript корректно проходят проверку
- ✅ Процессы обучения модели и морфинга видео работают стабильно

### Коммит
Коммит: e0a3edf3654a779d48d1daff46579b39753f2e63 (Ветка: fix/user-does-not-exist)

---

## 2025-08-10: Исправление ошибки создания пользователя - bot_name NOT NULL constraint

### Проблема
При создании нового пользователя через функцию `checkAvatarTransformUsage` возникала ошибка:
```
null value in column "bot_name" of relation "users" violates not-null constraint
```
Поле `bot_name` в таблице `users` является обязательным (NOT NULL), но при создании передавалось `null`.

### Решение
1. **Добавлен параметр botName** в функцию `checkAvatarTransformUsage`
2. **Передача имени бота** из контекста в `avatarTransformScene`:
   ```typescript
   const botName = ctx.botInfo?.username || 'AI_STARS_bot'
   ```
3. **Использование дефолтного значения** при создании пользователя:
   ```typescript
   bot_name: botName || 'AI_STARS_bot'
   ```

### Результат
- ✅ Новые пользователи успешно создаются с правильным bot_name
- ✅ Каждый бот сохраняет своё имя при создании пользователя
- ✅ Устранены ошибки базы данных при регистрации

### Коммит
Коммит: b1923f99918fe9e1e7cd3b7991a9c459d2141936 (Ветка: fix/user-does-not-exist)

---

## 2025-01-11: Настройка доступа к админским функциям

### Проблема
Необходимо было ограничить доступ к некоторым экспериментальным функциям:
1. 🎤 Kling Lip Sync - требует тестирования и настройки
2. 🔍 Парсинг - специальный функционал для отдельных сотрудников
3. 🧬 Морфинг - остается доступным для всех пользователей с подпиской

### Решение
1. **Добавлено поле в интерфейс**:
   ```typescript
   interface Level {
     title_ru: string
     title_en: string
     admin_only?: boolean // Опциональное поле для ограничения доступа
   }
   ```

2. **Исправлен порядок определения переменных**:
   ```typescript
   const userId = ctx.from?.id?.toString() // Определяем в самом начале
   ```

3. **Улучшена логика фильтрации**:
   ```typescript
   availableLevels = subscriptionLevelsMap[currentSubscription]
     .filter(filterServiceLevels)
     .filter((level) => !(level.admin_only && !(userId && adminIds.includes(userId))))
   ```

### Результат
- ✅ Кнопка "🧬 Морфинг" доступна всем пользователям с подпиской
- ✅ Кнопка "🎤 Kling Lip Sync" скрыта для обычных пользователей (admin_only: true)
- ✅ Кнопка "🔍 Парсинг" защищена через getParsingAccess
- ✅ Админы видят все кнопки, включая admin_only
- ✅ TypeScript компилируется без ошибок

### Коммиты
- Коммит: 31db83b6 - исправление фильтрации admin_only
- Коммит: 4ffb8c77 - скрытие Lip Sync, Морфинг остается доступным
