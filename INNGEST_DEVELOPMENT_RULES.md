# 🎯 INNGEST DEVELOPMENT RULES - ПРАВИЛА РАЗРАБОТКИ

## 🚨 ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА СОЗДАНИЯ ФУНКЦИЙ

### ⚡ Основной принцип: Единообразие и переиспользование

**При создании новой Inngest функции ВСЕГДА следовать этому алгоритму:**

#### 📋 Алгоритм действий:

1. **🔍 ШАГ 1: Поиск существующих функций**
   ```bash
   grep -r "inngest.createFunction" ./src --include="*.ts"
   grep -r "export.*Function" ./src/inngest/functions --include="*.ts"
   ```

2. **🎯 ШАГ 2: Найти похожую по логике функцию**
   - Смотри в `/src/inngest/functions/`
   - Выбери функцию с похожим назначением
   - Обрати внимание на структуру и паттерны

3. **📋 ШАГ 3: Скопировать структуру**
   - Скопируй файл как шаблон
   - Переименуй под новое назначение
   - Адаптируй параметры

4. **⚙️ ШАГ 4: Адаптировать под новые требования**
   - Измени логику функции
   - Обнови типы и интерфейсы
   - Сохрани паттерны логирования

5. **✅ ШАГ 5: Проверить консистентность**
   - Стиль кода соответствует?
   - Паттерны логирования совпадают?
   - Обработка ошибок аналогична?

---

### 🏗️ Стандартная структура Inngest функции:

```typescript
/**
 * Название функции с описанием
 * @description Краткое описание назначения
 */
export const functionName = inngest.createFunction(
  {
    name: 'descriptive.function.name',
    retries: {
      attempts: 3,
      delay: '1s',
    },
    concurrency: 10,
  },
  { event: 'event.name' },
  async ({ event, step, db }) => {
    const logger = new Logger('FunctionName')

    try {
      logger.info('Функция запущена', { eventName: event.name })

      // Основная логика
      const result = await step.run('operation-name', async () => {
        // Выполнение операции
        return await performOperation()
      })

      logger.info('Функция успешно завершена', { resultId: result.id })

      return { success: true, data: result }
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

### 🎯 Примеры существующих функций для изучения:

- `/src/inngest_app/functions/existing/generateAIReelsFunction.ts`
- `/src/inngest_app/functions/existing/generateModelTrainingFunction.ts`
- `/src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts`

**Используй эти как ТЕМПЛЕЙТЫ!**

---

### ❌ ЗАПРЕЩЕНО:

- **❌ Создавать функции с нуля без проверки существующих**
- **❌ Менять установленные паттерны без необходимости**
- **❌ Игнорировать существующую архитектуру**
- **❌ Использовать другой стиль логирования**
- **❌ Изобретать новые паттерны обработки ошибок**
- **❌ Нарушать соглашения об именовании**

---

### ✅ ПРАВИЛЬНО:

- **✅ Сначала изучить существующие функции**
- **✅ Копировать структуру как шаблон**
- **✅ Адаптировать логику, не паттерны**
- **✅ Сохранять консистентность кода**
- **✅ Использовать тот же стиль логирования**
- **✅ Следовать установленным соглашениям**

---

### 📊 Паттерны логирования:

```typescript
// Для всех функций используй именно этот стиль:
const logger = new Logger('FunctionName')

logger.info('Сообщение', { context: 'value' })
logger.error('Ошибка', {
  error: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
})
logger.warn('Предупреждение', { issue: 'context' })
logger.debug('Отладка', { data: value })
```

---

### 🔧 Регистрация функций:

**После создания функции обязательно зарегистрировать её:**

```typescript
// В /src/inngest_app/registerFunctions.ts
export function registerAllFunctions(inngest: Inngest) {
  // Регистрация всех функций
  inngest.register(
    functionName1,
    functionName2,
    // Добавляй новые функции сюда
  )
}
```

---

### 🎓 Цель правил:

1. **Единообразие кода** - все функции выглядят одинаково
2. **Переиспользование** - не изобретать велосипед
3. **Поддерживаемость** - легко понимать чужой код
4. **Надежность** - проверенные паттерны работают
5. **Производительность** - оптимизированные решения

---

### 📝 Чеклист перед созданием функции:

- [ ] Изучил существующие функции
- [ ] Нашел подходящий шаблон
- [ ] Скопировал структуру
- [ ] Адаптировал логику
- [ ] Проверил стиль логирования
- [ ] Убедился в консистентности
- [ ] Зарегистрировал функцию
- [ ] Протестировал работу

**ТОЛЬКО ПОСЛЕ ЭТОГО → создавать Pull Request**

---

### 🚀 Быстрый старт:

```bash
# 1. Найти существующую функцию
grep -r "createFunction" ./src/inngest --include="*.ts" | head -10

# 2. Скопировать шаблон
cp /path/to/existing/function.ts /path/to/new/function.ts

# 3. Переименовать и адаптировать

# 4. Зарегистрировать в registerFunctions.ts
```

**Помни: Лучше скопировать существующее, чем создать новое!**
