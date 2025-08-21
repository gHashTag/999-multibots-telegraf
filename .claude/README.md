# Claude Code Integration System

Полная система интеграции Claude Code с Claude Flow + автоматическая защита от утечек токенов и поддержание чистоты проекта.

## 🤖 Claude Flow Интеграция

### UserPromptSubmit хуки (для каждого промпта):
- **Автоматический запуск** Claude Flow hive-mind для каждого промпта
- **Создание AI-агентов** для анализа и выполнения задач
- **Генерация summary** и отчетов по результатам работы
- **Сохранение сессий** в .hive-mind/sessions/ для истории
- **Интеллектуальная обработка** сложных многошаговых задач

## 🛡️ Что делают хуки

### PostToolUse хуки (после каждого действия):
- **Автоматическое сканирование** недавно измененных файлов на токены
- **Проверка git staged** файлов на секреты
- **Блокирование commit** с токенами
- **Автоочистка** мелкого мусора (.tmp, ~, .DS_Store)

### Stop хуки (при завершении задачи):
- **Полное security сканирование** всего проекта
- **Финальная проверка** git статуса
- **Принудительная очистка** больших проектов
- **Блокирование завершения** при обнаружении проблем
- **Генерация отчета** о проверках

### PreToolUse хуки (перед действиями):
- **Предупреждения** при работе с .env файлами
- **Блокирование** опасных bash команд
- **Защита** от случайного вывода секретов

## 📁 Структура файлов

```
.claude/
├── settings.json           # Конфигурация хуков
├── README.md              # Эта документация
├── activate-hooks.sh       # Скрипт активации системы
├── quick-check.sh         # Быстрая проверка интеграции
├── validate-claude-flow.sh # Полная валидация Claude Flow
├── test-claude-flow.sh    # Тестирование Claude Flow интеграции
├── logs/                  # Логи выполнения хуков
│   ├── claude-flow-integration_*.log  # Логи Claude Flow
│   ├── post-task-security_*.log       # Логи security проверок
│   └── stop-cleanup_*.log             # Логи финальной очистки
├── hooks/
│   ├── claude-flow-integration.sh  # 🤖 Интеграция с Claude Flow
│   ├── security-scan.sh           # 🛡️ Полное security сканирование
│   ├── cleanup.sh                 # 🧹 Очистка мусора
│   ├── post-task-security.sh      # ⚡ Быстрая проверка после действий
│   └── stop-cleanup.sh            # 🔚 Финальная проверка при завершении
├── claude-flow-report.md   # Отчет о работе Claude Flow
├── SECURITY_ALERT.txt      # Создается при обнаружении проблем
└── COMPLETION_BLOCKED.txt  # Создается при блокировке завершения

.hive-mind/                 # Claude Flow workspace
├── sessions/               # Сессии AI-агентов
└── memory/                 # Память и контекст
```

## 🚀 Активация системы

### 1. Глобальная активация (рекомендуется):

```bash
# Создать символическую ссылку в глобальных настройках Claude Code
mkdir -p ~/.claude
ln -sf "$(pwd)/.claude/settings.json" ~/.claude/settings.json
```

### 2. Локальная активация (только для этого проекта):
Хуки уже настроены локально в `.claude/settings.json`

### 3. Проверка активации:
```bash
# Быстрая проверка интеграции
bash .claude/quick-check.sh

# Полная валидация (займет больше времени)  
bash .claude/validate-claude-flow.sh

# Проверить логи
ls -la .claude/logs/
```

## ⚡ Автоматические проверки

### Детектируемые типы секретов:
- 🤖 **Telegram Bot токены**: `123456789:ABC-DEF1234...`
- 🔑 **OpenAI API ключи**: `sk-...`
- 🗄️ **Supabase ключи**: `eyJ...`
- 🔐 **Общие API ключи** в переменных
- 🔒 **Hardcoded пароли**

### Автоматическая очистка:
- ❌ Временные файлы (*.tmp, *~, *.bak)
- ❌ System файлы (.DS_Store, Thumbs.db)
- ❌ Пустые директории
- ❌ Старые логи (>7 дней)
- ❌ Cache директории

## 🚨 Когда система срабатывает

### Предупреждения:
```
⚠️  ВНИМАНИЕ: Редактирование .env файла!
🚨 ОПАСНАЯ КОМАНДА ОБНАРУЖЕНА!
```

### Блокировка действий:
```json
{
  "decision": "block",
  "message": "🛡️ Заблокирован потенциально небезопасный запрос"
}
```

### Блокировка завершения:
```
🛑 ЗАВЕРШЕНИЕ ЗАБЛОКИРОВАНО: Security сканирование обнаружило проблемы
Проверьте .claude/COMPLETION_BLOCKED.txt
```

## 🔧 Устранение проблем

### При обнаружении секретов:

1. **Найти проблему**:
   ```bash
   cat .claude/SECURITY_ALERT.txt
   cat .claude/logs/post-task-security_*.log | tail -50
   ```

2. **Исправить**:
   - Удалить или заменить найденные токены
   - Переместить секреты в `.env` файлы
   - Добавить `.env` в `.gitignore`

3. **Убрать блокировку**:
   ```bash
   rm -f .claude/SECURITY_ALERT.txt
   rm -f .claude/COMPLETION_BLOCKED.txt
   ```

### При блокировке завершения:

1. **Проверить причину**:
   ```bash
   cat .claude/COMPLETION_BLOCKED.txt
   ```

2. **Исправить проблемы**
3. **Удалить файл блокировки**:
   ```bash
   rm -f .claude/COMPLETION_BLOCKED.txt
   ```

4. **Повторить завершение**

## 🛠️ Ручной запуск проверок

### Полное security сканирование:
```bash
bash .claude/hooks/security-scan.sh
```

### Очистка мусора:
```bash
bash .claude/hooks/cleanup.sh
```

### Быстрая проверка:
```bash
bash .claude/hooks/post-task-security.sh "Manual" "test"
```

### Тестирование Claude Flow интеграции:
```bash
bash .claude/test-claude-flow.sh
```

## 🤖 Работа с Claude Flow

### Проверка активности Claude Flow:
```bash
# Проверить логи интеграции
ls -la .claude/logs/claude-flow-integration_*.log

# Посмотреть последний лог
tail -20 .claude/logs/claude-flow-integration_*.log | tail -1

# Проверить созданные сессии
ls -la .hive-mind/sessions/

# Посмотреть последний summary
find .hive-mind/sessions -name "summary.md" -exec ls -lt {} + | head -1
```

### Анализ результатов Claude Flow:
```bash
# Отчет о последней интеграции
cat .claude/claude-flow-report.md

# Детальный анализ последней сессии
LATEST_SESSION=$(ls -t .hive-mind/sessions/ | head -1)
echo "Последняя сессия: $LATEST_SESSION"
cat .hive-mind/sessions/$LATEST_SESSION/summary.md
```

### Статистика работы агентов:
```bash
# Количество сессий
echo "Всего сессий: $(ls -1 .hive-mind/sessions/ | wc -l)"

# Размер workspace
echo "Размер .hive-mind: $(du -sh .hive-mind)"

# Активность по дням
find .hive-mind/sessions -name "*.md" -newermt "1 day ago" | wc -l
```

## 📊 Мониторинг

### Просмотр логов:
```bash
# Последние security проверки
ls -lt .claude/logs/post-task-security_*.log | head -5

# Последние cleanup операции  
ls -lt .claude/logs/stop-cleanup_*.log | head -5

# Просмотр последнего лога
tail -50 .claude/logs/post-task-security_*.log | tail -1
```

### Статистика проекта:
```bash
# Размер проекта
du -sh .

# Количество файлов
find . -type f -not -path "./node_modules/*" | wc -l

# Последние изменения
find . -type f -newermt "1 hour ago" -not -path "./node_modules/*"
```

## ⚙️ Настройка

### Отключение отдельных проверок:
Редактируйте `.claude/settings.json` и закомментируйте ненужные хуки.

### Добавление новых паттернов:
Отредактируйте скрипты в `.claude/hooks/` для добавления новых проверок.

### Настройка timeout:
Измените значения `timeout` в `settings.json` для медленных операций.

---

## 🎯 Результат

🤖 **Claude Flow автоматически обрабатывает каждый промпт**  
✅ **Никакие токены не попадут в git**  
✅ **Проект всегда остается чистым**  
✅ **Автоматическая защита от утечек**  
✅ **Полная прозрачность через логи**  
🧠 **AI-агенты помогают с каждой задачей**  
📊 **Детальная аналитика работы системы**  

**Теперь у вас есть полная AI-assisted среда разработки с автоматической защитой!**

## 🚀 Как это работает

1. **Отправляете промпт в Claude Code** 
2. **Автоматически запускается Claude Flow** → создает AI-агентов для анализа
3. **Агенты обрабатывают задачу** → генерируют решения и рекомендации  
4. **Claude Code выполняет задачу** → с учетом рекомендаций агентов
5. **Security система проверяет результат** → блокирует утечки токенов
6. **Генерируется отчет** → сохраняется в .hive-mind/sessions/
7. **Проект очищается** → удаляется мусор, оптимизируется размер

**Все происходит автоматически, вы просто работаете как обычно!**