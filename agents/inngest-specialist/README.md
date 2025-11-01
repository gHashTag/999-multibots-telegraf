# 🎯 Claude Code Inngest Functions Specialist

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)
![Project](https://img.shields.io/badge/project-999--agents--telegraf-green.svg)

**Специализированный Claude Code агент для создания и управления Inngest функциями в проекте 999-agents-telegraf**

---

## 📋 Содержание

- [Описание](#-описание)
- [Возможности](#-возможности)
- [Команды](#-команды)
- [Установка и использование](#-установка-и-использование)
- [Документация](#-документация)
- [Примеры](#-примеры)
- [Поддержка](#-поддержка)

---

## 🎯 Описание

Claude Code Inngest Functions Specialist - это экспертный агент, разработанный для автоматизации создания Inngest функций с соблюдением всех стандартов проекта 999-agents-telegraf.

### Ключевые особенности:
- ✅ Автоматическое следование правилам из `INNGEST_DEVELOPMENT_RULES.md`
- ✅ Использование существующих функций как шаблонов
- ✅ Встроенная валидация и тестирование
- ✅ Автоматическая регистрация в системе
- ✅ Поддержка всех категорий функций проекта

---

## 🚀 Возможности

### 1. 📝 Создание функций
- Автоматический поиск подходящих шаблонов
- Копирование структуры существующих функций
- Адаптация под новые требования
- Сохранение паттернов логирования

### 2. 🧪 Тестирование
- Валидация импортов
- Проверка структуры функции
- Контроль логирования
- Проверка регистрации

### 3. 🔍 Анализ
- Поиск существующих функций
- Группировка по категориям
- Генерация отчетов с рекомендациями
- Помощь в выборе шаблона

### 4. 📝 Регистрация
- Автоматическое обновление `registerFunctions.ts`
- Добавление импортов
- Включение в массив функций
- Обновление статистики

---

## 🖥️ Команды

### Создание новой функции

```bash
/inngest-create <название> <описание> [категория]
```

**Пример:**
```bash
/inngest-create generateContentScript "Генерация скриптов для контента" content
```

### Тестирование функции

```bash
/inngest-test <название_функции>
```

**Пример:**
```bash
/inngest-test generateAIReelsFunction
```

### Анализ существующих функций

```bash
/inngest-analyze [категория|путь]
```

**Примеры:**
```bash
/inngest-analyze content
/inngest-analyze existing
/inngest-analyze /src/inngest_app/functions/monitoring
```

### Регистрация функции

```bash
/inngest-register <название_функции>
```

**Пример:**
```bash
/inngest-register generateContentScript
```

---

## 📂 Категории функций

| Категория | Путь | Описание | Примеры |
|-----------|------|----------|---------|
| **content** | `content/` | Работа с контентом | `generateContentScripts`, `analyzeCompetitorReels` |
| **instagram** | `instagram/` | Instagram интеграция | `instagramScraper-v2`, `instagramScraper-v2-simple` |
| **monitoring** | `monitoring/` | Мониторинг системы | `criticalErrorMonitor`, `logMonitor` |
| **training** | `training/` | Обучение моделей | `modelTrainingV2`, `morphImages` |
| **generation** | `generation/` | Генерация контента | `neuroImageGeneration` |
| **payment** | `payment/` | Обработка платежей | `paymentProcessing` |
| **broadcast** | `broadcast/` | Рассылка сообщений | `broadcastMessage` |
| **render** | `render/` | Рендеринг видео | `render`, `renderAvatarVideo`, `renderRiddle` |
| **existing** | `existing/` | Шаблонные функции | `generateAIReelsFunction`, `generateModelTrainingFunction` |

---

## ⚙️ Установка и использование

### Предварительные требования

- Проект: `/Users/playra/999-agents-telegraf/worktrees/transfer-server`
- Файл правил: `INNGEST_DEVELOPMENT_RULES.md`
- Директория функций: `src/inngest_app/functions/`
- Файл регистрации: `src/inngest_app/registerFunctions.ts`

### Быстрый старт

#### 1. Создание новой функции

```bash
# Создать функцию для работы с контентом
/inngest-create generateHashtags "Генерация хештегов для Instagram" content
```

Агент автоматически:
- Найдет похожую функцию в категории `content`
- Скопирует структуру
- Создаст файл с правильным именем
- Обновит `registerFunctions.ts`

#### 2. Тестирование

```bash
# Протестировать созданную функцию
/inngest-test generateHashtags
```

#### 3. Анализ существующих функций

```bash
# Посмотреть все функции мониторинга
/inngest-analyze monitoring
```

---

## 📚 Документация

### Файлы агента:

- **[index.ts](index.ts)** - Основная логика агента
- **[agent-config.json](agent-config.json)** - Конфигурация и настройки
- **[agent-instructions.md](agent-instructions.md)** - Подробные инструкции
- **[examples.md](examples.md)** - Примеры использования
- **[README.md](README.md)** - Этот файл

### Документация проекта:

- **[INNGEST_DEVELOPMENT_RULES.md](../../INNGEST_DEVELOPMENT_RULES.md)** - Правила разработки
- **[registerFunctions.ts](../../src/inngest_app/registerFunctions.ts)** - Регистрация функций

---

## 💡 Примеры

### Создание функции генерации контента

```bash
/inngest-create generateInstagramCaptions "Генерация подписи для Instagram постов" content
```

**Результат:**
```
✅ Функция "generateInstagramCaptions" создана успешно!
📁 Путь: /src/inngest_app/functions/content/generate-instagram-captions.ts
📝 Описание: Генерация подписи для Instagram постов
🏷️ Категория: content
```

### Тестирование функции

```bash
/inngest-test generateInstagramCaptions
```

**Результат:**
```
✅ Функция "generateInstagramCaptions" прошла все проверки!

Проверки:
✅ Файл существует
✅ Импорты корректны
✅ Структура правильная
✅ Логирование настроено
✅ Функция зарегистрирована
```

### Анализ категории

```bash
/inngest-analyze render
```

**Результат:**
```
🔍 АНАЛИЗ СУЩЕСТВУЮЩИХ ФУНКЦИЙ

📊 Статистика:
- Найдено функций: 3
- Категория: render

📁 Найденные функции:
- /src/inngest_app/functions/render/render.ts
- /src/inngest_app/functions/render/renderAvatarVideo.ts
- /src/inngest_app/functions/render/renderRiddle.ts
```

---

## 🏗️ Стандартная структура функции

Все функции создаются согласно шаблону:

```typescript
/**
 * FunctionName - Описание назначения
 */
export const functionName = inngest.createFunction(
  {
    id: 'function-name',
    name: 'Function Name',
    retries: {
      attempts: 3,
      delay: '1s',
    },
    concurrency: 10,
  },
  { event: 'event.name' },
  async ({ event, step }) => {
    const logger = new Logger('FunctionName')

    try {
      logger.info('Функция запущена', { eventName: event.name })

      const result = await step.run('operation-name', async () => {
        // Основная логика
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

### Обязательные элементы:

1. **📝 JSDoc комментарий** - описание функции
2. **🔧 Конфигурация** - retries, concurrency, name
3. **🎯 Событие** - event: 'event.name'
4. **📊 Логирование** - Logger('FunctionName')
5. **🛡️ Обработка ошибок** - try-catch с логированием

---

## 🧪 Тестирование

### Автоматические проверки

При выполнении `/inngest-test` агент проверяет:

- ✅ **Существование файла** - функция создана
- ✅ **Корректность импортов** - inngest, logger
- ✅ **Структура функции** - createFunction, { event, step }
- ✅ **Паттерны логирования** - logger.info, logger.error
- ✅ **Регистрация** - функция добавлена в registerFunctions.ts

### Ручное тестирование

```bash
# Проверка компиляции
npm run build

# Тестирование Inngest функций
npm test -- --testPathPattern=inngest
```

---

## 📋 Чеклист

### Перед созданием Pull Request:

- [ ] Изучил существующие функции
- [ ] Нашел подходящий шаблон
- [ ] Скопировал структуру
- [ ] Адаптировал логику
- [ ] Проверил стиль логирования
- [ ] Убедился в консистентности
- [ ] Зарегистрировал функцию
- [ ] Протестировал работу с `/inngest-test`
- [ ] Создал Pull Request

---

## 🚨 Безопасность

### Ограничения агента:

- ❌ **НЕ может напрямую деплоить в production**
- ⚠️ **Всегда предлагает тестирование в main**
- ⚠️ **Предупреждает о рисках перед изменениями**
- 🔒 **Требует создания Pull Request**

### Рекомендации:

1. Создавайте ветку `feature/your-feature-name`
2. Тестируйте в dev/staging среде
3. Получайте code review
4. Создавайте бэкапы перед изменениями

---

## 🆘 Решение проблем

### Функция не найдена

```bash
# Решение: Проверьте правильность имени
/inngest-analyze existing  # Посмотреть все существующие
```

### Ошибки тестирования

```bash
# Решение: Проверьте ошибки и исправьте
/inngest-test yourFunctionName

# Типичные ошибки:
# - Отсутствует импорт logger
# - Неправильная структура функции
# - Нет обработки ошибок
```

### Не удается зарегистрировать

```bash
# Решение: Проверьте файл функции
ls -la /src/inngest_app/functions/your-category/

# Убедитесь, что функция экспортируется:
# export const yourFunction = inngest.createFunction(...)
```

---

## 📞 Поддержка

### Полезные команды:

```bash
# Поиск всех функций
grep -r "createFunction" ./src/inngest_app/functions --include="*.ts"

# Проверка регистрации
grep -r "functionName" ./src/inngest_app/registerFunctions.ts

# Анализ логирования
grep -r "logger" ./src/inngest_app/functions --include="*.ts" | head -20
```

### Документация:

- 📋 **[INNGEST_DEVELOPMENT_RULES.md](../../INNGEST_DEVELOPMENT_RULES.md)** - Правила разработки
- 📚 **[agent-instructions.md](agent-instructions.md)** - Подробные инструкции
- 💡 **[examples.md](examples.md)** - Примеры использования

---

## 📊 Статистика

### Текущее состояние проекта:

```
📁 Категории функций:
├── content: 6 функций
├── instagram: 2 функции
├── monitoring: 2 функции
├── training: 2 функции
├── generation: 1 функция
├── payment: 1 функция
├── broadcast: 1 функция
├── render: 3 функции
└── existing: 3 функции

📈 Итого: 21 функция
```

---

## 🎓 Принципы работы

### ✅ ПРАВИЛЬНО:

- **Использовать существующие функции как шаблоны**
- **Следовать паттернам из INNGEST_DEVELOPMENT_RULES.md**
- **Сохранять консистентность кода**
- **Тестировать перед созданием PR**
- **Получать code review**

### ❌ НЕПРАВИЛЬНО:

- **Создавать функции с нуля**
- **Изменять установленные паттерны**
- **Игнорировать архитектуру**
- **Использовать другой стиль логирования**
- **Деплоить без тестирования**

---

## 📝 Журнал изменений

### v1.0.0 (2025-11-01)
- ✅ Первоначальный релиз
- ✅ Команды: create, test, analyze, register
- ✅ Поддержка всех 9 категорий
- ✅ Автоматическая регистрация
- ✅ Валидация и тестирование
- ✅ Интеграция с INNGEST_DEVELOPMENT_RULES.md

---

## 🎯 Цели

1. **Единообразие** - все функции выглядят одинаково
2. **Переиспользование** - не изобретать велосипед
3. **Поддерживаемость** - легко понимать код
4. **Надежность** - проверенные паттерны
5. **Производительность** - оптимизированные решения

---

## 📄 Лицензия

Создано с помощью **Claude Code** для проекта **999-agents-telegraf**

---

## 🚀 Быстрый старт

```bash
# 1. Создать функцию
/inngest-create yourFunctionName "Описание" category

# 2. Протестировать
/inngest-test yourFunctionName

# 3. Зарегистрировать (если не сделано автоматически)
/inngest-register yourFunctionName

# 4. Создать PR
git checkout -b feature/your-function
git add .
git commit -m "feat: add yourFunctionName"
git push origin feature/your-function
```

---

**🎯 Помните: Лучше скопировать существующее, чем создать новое!**

---

[![Claude Code](https://img.shields.io/badge/Claude-Code-blue.svg)](https://claude.com/claude-code)
[![Inngest](https://img.shields.io/badge/Inngest-Functions-green.svg)](https://inngest.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
