# Обработка проблем с Telegram ботами

## 🚨 КРИТИЧЕСКОЕ ПРАВИЛО: Автоматический вызов telegram-scene-builder

**Если проблема связана с Telegram ботами - СРАЗУ вызывай telegram-scene-builder агента!**

Без этого агента ты не можешь решить проблемы с:
- Wizard сценами
- Клавиатурами
- Навигацией
- Обработкой сообщений
- Scene transitions
- Context/session

## Признаки проблем с Telegram:

### 1. Проблемы с клавиатурами
- ❌ "Клавиатура не появляется"
- ❌ "Кнопки не работают"
- ❌ "Не видно меню"
- ❌ "Keyboard not showing"

**Действие:** Немедленно вызови telegram-scene-builder

### 2. Проблемы со сценами
- ❌ "Wizard не работает"
- ❌ "Сцена зависает"
- ❌ "Требуется два нажатия"
- ❌ "Scene не переключается"

**Действие:** Немедленно вызови telegram-scene-builder

### 3. Проблемы с сообщениями
- ❌ "Бот не отвечает"
- ❌ "Сообщение не приходит"
- ❌ "Update не обрабатывается"

**Действие:** Немедленно вызови telegram-scene-builder

### 4. Проблемы с навигацией
- ❌ "Не могу вернуться в меню"
- ❌ "Навигация не работает"
- ❌ "Застрял в wizard"

**Действие:** Немедленно вызови telegram-scene-builder

## Telegram-scene-builder агент: Возможности

Агент специализируется на:

1. **Telegraf WizardScene паттернах**
   - Правильная структура wizard'ов
   - Lifecycle понимание (.enter(), steps, .leave())
   - Context и session управление

2. **Keyboard management**
   - Reply keyboards
   - Inline keyboards
   - Keyboard removal
   - Button handling

3. **Scene transitions**
   - ctx.scene.enter()
   - ctx.scene.leave()
   - Scene switching
   - Race conditions

4. **Update handling**
   - Message processing
   - Callback queries
   - Update consumption
   - Handler middleware

5. **Best practices**
   - Telegraf документация
   - Общие паттерны
   - Типичные ошибки
   - Proven solutions

## Как вызывать агента:

```typescript
Task({
  subagent_type: "telegram-scene-builder",
  description: "Analyze [краткое описание проблемы]",
  prompt: `
Проблема: [Детальное описание проблемы]

Контекст:
1. [Что делает пользователь]
2. [Что происходит]
3. [Что должно происходить]

Лог:
[Вставить релевантные логи]

Файлы:
- [Путь к файлу wizard/scene]

Недавние изменения:
- [Что было изменено]

Рабочий пример:
- [Ссылка на рабочий wizard для сравнения]

Задача:
1. Прочитай файл wizard/scene
2. Сравни с рабочим примером
3. Найди причину проблемы
4. Предложи исправление
5. Объясни техническую причину

ВАЖНО: НЕ деплой! Только анализ и решение.
`
})
```

## Примеры правильного использования:

### Пример 1: Проблема с клавиатурой
```
User: "Почему клавиатура с меню не появилась?"
