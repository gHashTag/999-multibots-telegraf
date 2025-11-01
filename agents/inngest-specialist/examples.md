# 📚 ПРИМЕРЫ ИСПОЛЬЗОВАНИЯ АГЕНТА

## 🎯 Сценарий 1: Создание функции генерации контента

### Команда:
```
/inngest-create generateInstagramCaptions "Генерация подписи для Instagram постов" content
```

### Что произойдет:

1. **Агент найдет шаблон** в `/src/inngest_app/functions/content/`
   - Изучит `generateContentScripts.ts`
   - Определит подходящую структуру

2. **Создаст файл** `/src/inngest_app/functions/content/generate-instagram-captions.ts`
   ```typescript
   /**
    * GenerateInstagramCaptions
    *
    * Генерация подписи для Instagram постов
    *
    * Создано автоматически с помощью Claude Code Inngest Specialist
    */
   export const generateInstagramCaptions = inngest.createFunction(
     {
       id: 'generate-instagram-captions',
       name: 'Generate Instagram Captions',
       retries: {
         attempts: 3,
         delay: '1s',
       },
       concurrency: 10,
     },
     { event: 'instagram/generate-captions' },
     async ({ event, step }) => {
       const logger = new Logger('GenerateInstagramCaptions')

       try {
         logger.info('Функция запущена', { eventName: event.name })

         // ЗДЕСЬ НУЖНО ДОБАВИТЬ ЛОГИКУ

         logger.info('Функция успешно завершена')
         return { success: true }
       } catch (error) {
         logger.error('Ошибка в функции', {
           error: error instanceof Error ? error.message : String(error),
         })
         throw error
       }
     }
   )
   ```

3. **Обновит** `/src/inngest_app/registerFunctions.ts`
   - Добавит импорт: `import { generateInstagramCaptionsFunction } from './functions/content/generate-instagram-captions'`
   - Добавит в массив: `generateInstagramCaptionsFunction,`

4. **Вернет инструкции:**
   ```
   ✅ Функция "generateInstagramCaptions" создана успешно!
   📁 Путь: /src/inngest_app/functions/content/generate-instagram-captions.ts
   📝 Описание: Генерация подписи для Instagram постов
   🏷️ Категория: content

   Следующие шаги:
   1. Заполните интерфейсы и типы
   2. Реализуйте основную логику в step.run()
   3. Протестируйте: /inngest-test generateInstagramCaptions
   4. Создайте Pull Request
   ```

---

## 🔍 Сценарий 2: Анализ функций мониторинга

### Команда:
```
/inngest-analyze monitoring
```

### Результат:
```
🔍 АНАЛИЗ СУЩЕСТВУЮЩИХ ФУНКЦИЙ

📊 Статистика:
- Найдено функций: 2
- Категория: monitoring

📁 Найденные функции:
- /src/inngest_app/functions/monitoring/criticalErrorMonitor.ts
- /src/inngest_app/functions/monitoring/logMonitor.ts

📋 Рекомендации:
1. Изучите структуру существующих функций
2. Найдите функцию с похожей логикой
3. Скопируйте её как шаблон
4. Адаптируйте под ваши потребности

✅ Следуйте правилам из INNGEST_DEVELOPMENT_RULES.md!
```

---

## 🧪 Сценарий 3: Тестирование новой функции

### Команда:
```
/inngest-test generateInstagramCaptions
```

### Результат (успех):
```
✅ Функция "generateInstagramCaptions" прошла все проверки!

Проверки:
✅ Файл существует
✅ Импорты корректны
✅ Структура правильная
✅ Логирование настроено
✅ Функция зарегистрирована

📁 Файл: /src/inngest_app/functions/content/generate-instagram-captions.ts

🎉 Готово к созданию Pull Request!
```

### Результат (с ошибками):
```
⚠️ Функция "generateInstagramCaptions" имеет 3 проблем:

❌ Ошибки:
1. Отсутствует импорт logger из '@/utils/logger'
2. Функция не использует step.run()
3. Отсутствует обработка ошибок

🔧 Исправьте ошибки и запустите тест снова
```

---

## 📝 Сценарий 4: Регистрация функции вручную

### Команда:
```
/inngest-register generateInstagramCaptions
```

### Результат:
```
✅ Функция "generateInstagramCaptions" успешно зарегистрирована в registerFunctions.ts!

🏷️ Категория: content
📁 Файл регистрации: /src/inngest_app/registerFunctions.ts

⚠️ Проверьте:
1. Правильность импорта функции
2. Корректность имени в списке функций
3. Выполните тестирование: /inngest-test generateInstagramCaptions
```

---

## 🎨 Сценарий 5: Создание функции для рендеринга видео

### Команда:
```
/inngest-create createReelVideo "Создание видео для Reels с аватаром" render
```

### Результат:
Агент найдет шаблон в `render/` категории:
- `renderAvatarVideo.ts`
- `renderRiddle.ts`

И создаст функцию на их основе.

---

## 📊 Сценарий 6: Анализ всех существующих функций

### Команда:
```
/inngest-analyze
```

### Результат:
```
🔍 АНАЛИЗ СУЩЕСТВУЮЩИХ ФУНКЦИЙ

📊 Статистика:
- Найдено функций: 23

📁 Найденные функции:
- /src/inngest_app/functions/content/ (6 функций)
- /src/inngest_app/functions/instagram/ (2 функции)
- /src/inngest_app/functions/monitoring/ (2 функции)
- /src/inngest_app/functions/training/ (2 функции)
- /src/inngest_app/functions/generation/ (1 функция)
- /src/inngest_app/functions/payment/ (1 функция)
- /src/inngest_app/functions/broadcast/ (1 функция)
- /src/inngest_app/functions/render/ (3 функции)
- /src/inngest_app/functions/existing/ (3 функции)

🏷️ Популярные категории:
1. content - 6 функций
2. render - 3 функции
3. existing - 3 функции

💡 Рекомендации:
- Для новых функций контента используйте generateContentScripts.ts
- Для рендеринга используйте renderAvatarVideo.ts
- Общие шаблоны смотрите в existing/
```

---

## ⚙️ Сценарий 7: Создание сложной функции с обработкой данных

### Команда:
```
/inngest-create processUserAnalytics "Обработка аналитики пользователей" monitoring
```

### Созданная функция:
```typescript
/**
 * ProcessUserAnalytics
 *
 * Обработка аналитики пользователей
 *
 * Создано автоматически с помощью Claude Code Inngest Specialist
 */
import { inngest } from '@/core/inngest/clients'
import { logger } from '@/utils/logger'
import { z } from 'zod'

// Валидация входных данных
const processUserAnalyticsSchema = z.object({
  userId: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
})

export interface ProcessUserAnalyticsInput {
  userId: string
  dateFrom: string
  dateTo: string
}

export const processUserAnalytics = inngest.createFunction(
  {
    id: 'process-user-analytics',
    name: 'Process User Analytics',
    retries: {
      attempts: 3,
      delay: '1s',
    },
    concurrency: 10,
  },
  { event: 'monitoring/process-user-analytics' },
  async ({ event, step }) => {
    const logger = new Logger('ProcessUserAnalytics')

    try {
      // Валидация входных данных
      const input = processUserAnalyticsSchema.parse(event.data)

      logger.info('Функция запущена', {
        eventName: event.name,
        userId: input.userId,
      })

      // Шаг 1: Получение данных из БД
      const userData = await step.run('get-user-data', async () => {
        // Логика получения данных пользователя
        return {}
      })

      // Шаг 2: Анализ данных
      const analytics = await step.run('analyze-data', async () => {
        // Логика анализа
        return {}
      })

      logger.info('Функция успешно завершена', {
        userId: input.userId,
      })

      return { success: true, data: analytics }
    } catch (error) {
      logger.error('Ошибка в функции', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }
)
```

---

## 🔐 Сценарий 8: Безопасность и предупреждения

### Команда:
```
/inngest-create criticalSystemOperation "Критическая операция системы" existing
```

### Предупреждение от агента:
```
⚠️ ВНИМАНИЕ: Создание критической функции!

Эта операция требует особого внимания:

🚨 РИСКИ:
- Изменение критических системных компонентов
- Возможное влияние на production
- Необратимые изменения данных

✅ РЕКОМЕНДАЦИИ:
1. Обязательно создайте бэкап перед внедрением
2. Протестируйте в dev/staging среде
3. Получите code review от Senior Developer
4. НЕ деплойте напрямую в production
5. Создайте Pull Request для review

🔒 ФУНКЦИЯ БУДЕТ СОЗДАНА, НО ТРЕБУЕТ РУЧНОЙ ПРОВЕРКИ!
```

---

## 📋 Чеклист после создания функции

### После `/inngest-create`:

- [ ] ✅ Проверить созданный файл
- [ ] ✅ Заполнить интерфейсы и типы
- [ ] ✅ Реализовать логику в step.run()
- [ ] ✅ Добавить валидацию входных данных (zod)
- [ ] ✅ Протестировать с `/inngest-test`
- [ ] ✅ Создать ветку git: `git checkout -b feature/function-name`
- [ ] ✅ Запушить изменения: `git push origin feature/function-name`
- [ ] ✅ Создать Pull Request
- [ ] ✅ Получить code review
- [ ] ✅ Мержить после approval

---

## 🆘 Решение проблем

### Проблема: "Шаблон не найден"
```
Решение:
1. Проверьте, что категория указана правильно
2. Используйте /inngest-analyze для поиска существующих функций
3. Используйте категорию "existing" для базовых шаблонов
```

### Проблема: "Функция не проходит тест"
```
Решение:
1. Запустите /inngest-test для просмотра ошибок
2. Проверьте импорты (inngest, logger)
3. Убедитесь, что используете Logger('FunctionName')
4. Проверьте, что функция зарегистрирована
```

### Проблема: "Не удается зарегистрировать функцию"
```
Решение:
1. Проверьте, что файл функции существует
2. Убедитесь, что функция экспортируется правильно
3. Проверьте синтаксис registerFunctions.ts
```

---

## 🎓 Полезные команды

### Поиск функций:
```bash
# Найти все Inngest функции
grep -r "createFunction" ./src/inngest_app/functions --include="*.ts"

# Найти функции определенной категории
ls ./src/inngest_app/functions/content/

# Найти функции по имени
grep -r "functionName" ./src/inngest_app/functions --include="*.ts"
```

### Проверка регистрации:
```bash
# Проверить, зарегистрирована ли функция
grep -r "functionName" ./src/inngest_app/registerFunctions.ts
```

### Анализ логирования:
```bash
# Посмотреть паттерны логирования
grep -A 2 "const logger" ./src/inngest_app/functions --include="*.ts" | head -20
```

---

## 🎯 Итоговые рекомендации

### ✅ ВСЕГДА:
1. Используйте команды агента для создания функций
2. Следуйте стандартам из INNGEST_DEVELOPMENT_RULES.md
3. Тестируйте с `/inngest-test` перед PR
4. Создавайте Pull Request для code review
5. Изучайте существующие функции как шаблоны

### ❌ НИКОГДА:
1. Не создавайте функции с нуля без агента
2. Не изменяйте паттерны логирования
3. Не деплойте напрямую в production
4. Не игнорируйте предупреждения безопасности
5. Не пропускайте тестирование

---

**🎯 Помните: Лучше скопировать существующее, чем создать новое!**
