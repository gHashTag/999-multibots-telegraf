# 🚀 ИНСТРУКЦИЯ ПО УСТАНОВКЕ И ЗАПУСКУ

## Claude Code Inngest Functions Specialist

---

## 📋 Содержание

1. [Требования](#-требования)
2. [Установка](#-установка)
3. [Первый запуск](#-первый-запуск)
4. [Использование](#-использование)
5. [Проверка работы](#-проверка-работы)
6. [Troubleshooting](#-troubleshooting)

---

## 📦 Требования

### Системные требования:

- **Node.js:** >= 18.0.0
- **npm:** >= 8.0.0
- **TypeScript:** >= 5.0.0
- **Проект:** 999-agents-telegraf (transfer-server)

### Зависимости проекта:

```bash
# Убедитесь, что в проекте установлены:
- inngest ^3.0.0
- zod ^3.22.0
- typescript ^5.0.0
```

---

## 💾 Установка

### Шаг 1: Переход в директорию агента

```bash
cd /Users/playra/999-agents-telegraf/worktrees/transfer-server/agents/inngest-specialist
```

### Шаг 2: Установка зависимостей (если нужно)

```bash
npm install
```

### Шаг 3: Проверка структуры файлов

```bash
ls -la
```

**Ожидаемая структура:**
```
agents/inngest-specialist/
├── index.ts                      # Основной файл агента
├── agent-config.json             # Конфигурация
├── agent-instructions.md         # Инструкции
├── examples.md                   # Примеры
├── reference-functions.md        # Справочник функций
├── function-template.ts          # Шаблон функции
├── package.json                  # npm пакет
├── README.md                     # Документация
└── SETUP.md                      # Эта инструкция
```

### Шаг 4: Проверка интеграции с проектом

```bash
# Убедитесь, что существуют файлы проекта:
ls -la /Users/playra/999-agents-telegraf/worktrees/transfer-server/INNGEST_DEVELOPMENT_RULES.md
ls -la /Users/playra/999-agents-telegraf/worktrees/transfer-server/src/inngest_app/
ls -la /Users/playra/999-agents-telegraf/worktrees/transfer-server/src/inngest_app/functions/
ls -la /Users/playra/999-agents-telegraf/worktrees/transfer-server/src/inngest_app/registerFunctions.ts
```

---

## ▶️ Первый запуск

### Способ 1: Через Claude Code (рекомендуется)

1. **Откройте Claude Code в проекте**
2. **Введите команду:**

```bash
/inngest-analyze
```

**Ожидаемый результат:**
```
🔍 АНАЛИЗ СУЩЕСТВУЮЩИХ ФУНКЦИЙ

📊 Статистика:
- Найдено функций: X

📁 Найденные функции:
- /src/inngest_app/functions/content/...
- ...

✅ Следуйте правилам из INNGEST_DEVELOPMENT_RULES.md!
```

### Способ 2: Прямой запуск через Node.js

```bash
node index.ts
```

**Или через tsx:**

```bash
npx tsx index.ts
```

---

## 🎯 Использование

### Базовые команды

#### 1. Анализ существующих функций

```bash
/inngest-analyze content
```

**Что делает:**
- Ищет функции в категории `content`
- Показывает их количество и пути
- Дает рекомендации по выбору шаблона

#### 2. Создание новой функции

```bash
/inngest-create generateHashtags "Генерация хештегов для Instagram" content
```

**Что делает:**
- Находит похожую функцию
- Создает файл `generate-hashtags.ts`
- Добавляет импорт в `registerFunctions.ts`
- Показывает инструкции по дальнейшим действиям

#### 3. Тестирование функции

```bash
/inngest-test generateHashtags
```

**Что делает:**
- Проверяет существование файла
- Валидирует импорты
- Проверяет структуру
- Тестирует логирование
- Проверяет регистрацию

#### 4. Регистрация функции

```bash
/inngest-register generateHashtags
```

**Что делает:**
- Добавляет функцию в `registerFunctions.ts`
- Обновляет статистику категорий
- Показывает чеклист для проверки

---

## ✅ Проверка работы

### Тест 1: Анализ категории

```bash
/inngest-analyze monitoring
```

**Ожидаемый результат:**
- Показывает 2 функции: `criticalErrorMonitor.ts`, `logMonitor.ts`
- Дает рекомендации

### Тест 2: Создание тестовой функции

```bash
/inngest-create testFunction "Тестовая функция" existing
```

**Ожидаемый результат:**
- Создается файл `/src/inngest_app/functions/existing/test-function.ts`
- Обновляется `registerFunctions.ts`
- Показываются инструкции

### Тест 3: Тестирование созданной функции

```bash
/inngest-test testFunction
```

**Ожидаемый результат:**
```
✅ Функция "testFunction" прошла все проверки!
```

**Или (если есть ошибки):**
```
⚠️ Функция "testFunction" имеет X проблем:
1. Ошибка 1
2. Ошибка 2
```

### Тест 4: Удаление тестовой функции

```bash
# Удаляем файл
rm /src/inngest_app/functions/existing/test-function.ts

# Удаляем из registerFunctions.ts (вручную)
# Или используйте редактор
```

---

## 🔧 Конфигурация

### Параметры агента

Файл: `agent-config.json`

```json
{
  "project": {
    "root_path": "/Users/playra/999-agents-telegraf/worktrees/transfer-server",
    "functions_dir": "src/inngest_app/functions",
    "register_file": "src/inngest_app/registerFunctions.ts"
  },
  "categories": {
    "content": { "path": "content" },
    "existing": { "path": "existing" }
    // ... другие категории
  }
}
```

### Изменение путей

Если нужно изменить пути к файлам:

1. Отредактируйте `agent-config.json`
2. Обновите пути в `index.ts` (класс `InngestFunctionsSpecialist`)

---

## 📝 Полный пример workflow

### Сценарий: Создание функции генерации контента

#### Шаг 1: Анализ существующих функций

```bash
/inngest-analyze content
```

**Результат:**
```
📊 Найдено 6 функций в категории content:
- analyzeCompetitorReels.ts
- extractTopContent.ts
- findCompetitors.ts
- generateContentScripts.ts
- generateDetailedScript.ts
- generateScenarioClips.ts

💡 Рекомендуем использовать generateContentScripts.ts как шаблон
```

#### Шаг 2: Создание новой функции

```bash
/inngest-create generateVideoScripts "Генерация скриптов для видео" content
```

**Результат:**
```
✅ Функция "generateVideoScripts" создана!

📁 Путь: /src/inngest_app/functions/content/generate-video-scripts.ts
📝 Использован шаблон: generateContentScripts.ts

Следующие шаги:
1. ✅ Заполните интерфейсы и типы
2. ⏳ Реализуйте логику в step.run()
3. ⏳ Протестируйте: /inngest-test generateVideoScripts
4. ⏳ Создайте Pull Request
```

#### Шаг 3: Редактирование функции

Откройте файл и заполните логику:

```typescript
// /src/inngest_app/functions/content/generate-video-scripts.ts

export const generateVideoScripts = inngest.createFunction(
  // ... конфигурация
  async ({ event, step }) => {
    const logger = new Logger('GenerateVideoScripts')

    try {
      // ВАША ЛОГИКА ЗДЕСЬ
      const result = await step.run('generate-scripts', async () => {
        // Реализуйте генерацию скриптов
        return { scripts: [] }
      })

      return { success: true, data: result }
    } catch (error) {
      logger.error('Ошибка', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
)
```

#### Шаг 4: Тестирование

```bash
/inngest-test generateVideoScripts
```

**Результат:**
```
✅ Функция прошла все проверки!

📋 Чеклист:
✅ Файл существует
✅ Импорты корректны (inngest, logger)
✅ Структура правильная (createFunction, { event, step })
✅ Логирование настроено (logger.info, logger.error)
✅ Функция зарегистрирована

🎉 Готово к созданию Pull Request!
```

#### Шаг 5: Создание Pull Request

```bash
# Создаем ветку
git checkout -b feature/generate-video-scripts

# Добавляем файлы
git add .

# Коммитим
git commit -m "feat: add generateVideoScripts function

- Generates video scripts from input data
- Follows INNGEST_DEVELOPMENT_RULES.md
- Includes validation and error handling
- Closes #XXX"

# Пушим
git push origin feature/generate-video-scripts

# Создаем PR через GitHub CLI
gh pr create --title "feat: add generateVideoScripts function" --body "..."
```

---

## 🚨 Troubleshooting

### Проблема: "Файл не найден"

**Ошибка:**
```
Error: Функция "functionName" не найдена
```

**Решение:**
1. Проверьте, что функция действительно существует
2. Убедитесь, что имя указано правильно (camelCase)
3. Используйте `/inngest-analyze` для поиска функций

### Проблема: "Не удается зарегистрировать"

**Ошибка:**
```
Error: Не удается обновить registerFunctions.ts
```

**Решение:**
1. Проверьте права доступа к файлу
2. Убедитесь, что файл не заблокирован другим процессом
3. Создайте бэкап перед изменением
4. Отредактируйте вручную при необходимости

### Проблема: "Шаблон не найден"

**Ошибка:**
```
Error: Не найден подходящий шаблон для категории: categoryName
```

**Решение:**
1. Проверьте, что категория указана правильно
2. Используйте категорию "existing" как fallback
3. Скопируйте шаблон вручную из `/src/inngest_app/functions/existing/`

### Проблема: "Ошибки компиляции"

**Ошибка:**
```
TypeScript: Cannot find module '@/utils/logger'
```

**Решение:**
1. Проверьте, что в проекте установлен пакет логгера
2. Убедитесь, что путь к модулю корректен
3. Проверьте tsconfig.json

### Проблема: "Функция не проходит тест"

**Ошибка:**
```
⚠️ Функция имеет 3 проблем:
1. Отсутствует logger.info
2. Не используется step.run()
3. Нет обработки ошибок
```

**Решение:**
1. Добавьте `logger.info('Функция запущена', ...)`
2. Оберните логику в `step.run()`
3. Добавьте try-catch блок
4. Запустите тест снова

---

## 📊 Полезные команды

### Поиск функций

```bash
# Все Inngest функции
grep -r "createFunction" ./src/inngest_app/functions --include="*.ts"

# Функции определенной категории
ls ./src/inngest_app/functions/content/

# Поиск по имени
grep -r "functionName" ./src/inngest_app/functions --include="*.ts"
```

### Проверка регистрации

```bash
# Проверить, зарегистрирована ли функция
grep -n "functionName" ./src/inngest_app/registerFunctions.ts

# Посмотреть все импорты
grep "^import" ./src/inngest_app/registerFunctions.ts
```

### Анализ логирования

```bash
# Паттерны логирования
grep -A 1 "const logger" ./src/inngest_app/functions --include="*.ts"

# Логирование ошибок
grep "logger.error" ./src/inngest_app/functions --include="*.ts" | head -10
```

---

## 🔗 Ссылки

- 📋 **[INNGEST_DEVELOPMENT_RULES.md](../../INNGEST_DEVELOPMENT_RULES.md)** - Правила разработки
- 📁 **[registerFunctions.ts](../../src/inngest_app/registerFunctions.ts)** - Регистрация функций
- 📚 **[agent-instructions.md](agent-instructions.md)** - Подробные инструкции
- 💡 **[examples.md](examples.md)** - Примеры использования
- 📖 **[reference-functions.md](reference-functions.md)** - Справочник функций
- 🔧 **Inngest Docs** - https://www.inngest.com/docs

---

## 📞 Поддержка

Если возникли проблемы:

1. **Проверьте документацию** - `agent-instructions.md`
2. **Изучите примеры** - `examples.md`
3. **Посмотрите справочник** - `reference-functions.md`
4. **Проверьте правила** - `INNGEST_DEVELOPMENT_RULES.md`

---

## ✅ Чеклист установки

- [ ] Node.js >= 18.0.0 установлен
- [ ] npm >= 8.0.0 установлен
- [ ] Проект 999-agents-telegraf клонирован
- [ ] Переход в директорию агента выполнен
- [ ] Структура файлов проверена
- [ ] Первый запуск `/inngest-analyze` успешен
- [ ] Создание тестовой функции работает
- [ ] Тестирование функции проходит
- [ ] Удаление тестовой функции выполнено

**🎯 Если все пункты выполнены - агент готов к использованию!**

---

## 🚀 Готово к работе!

Теперь вы можете использовать агента для:

- ✅ Создания новых Inngest функций
- ✅ Тестирования и валидации
- ✅ Анализа существующих функций
- ✅ Регистрации в системе

**Помните: Лучше скопировать существующее, чем создать новое!**

---

**🎯 Удачной разработки с Claude Code Inngest Functions Specialist!**
