# 🚀 Краткое руководство по использованию

## 🎯 Быстрый старт

### 1. Активация (один раз)
```bash
# Запустить активационный скрипт
bash .claude/activate-hooks.sh

# Выбрать глобальную активацию (рекомендуется)
# Выбрать опцию 1
```

### 2. Проверка работы
```bash
# Быстрая проверка
bash .claude/quick-check.sh

# Если все ✅ - система готова!
```

### 3. Использование
Просто работайте с Claude Code как обычно! 

**Каждый ваш промпт автоматически:**
- 🤖 Обрабатывается через Claude Flow AI-агентов
- 🛡️ Проверяется на безопасность  
- 🧹 Очищается от мусора
- 📊 Логируется для анализа

## 🔍 Как понять что Claude Flow работает

### После любого промпта проверьте:

1. **Логи интеграции созданы:**
   ```bash
   ls -la .claude/logs/claude-flow-integration_*.log
   ```

2. **Сессии AI-агентов появились:**
   ```bash
   ls -la .hive-mind/sessions/
   ```

3. **Отчет сгенерирован:**
   ```bash
   cat .claude/claude-flow-report.md
   ```

4. **В логах видны записи Claude Flow:**
   ```bash
   tail -10 .claude/logs/claude-flow-integration_*.log | grep "CLAUDE-FLOW"
   ```

## 📋 Типичные проверки

### ✅ Система работает правильно если:
- Создаются логи интеграции для каждого промпта
- Появляются новые сессии в .hive-mind/sessions/
- Генерируются summary.md файлы с анализом
- Security проверки блокируют токены
- Мусор автоматически очищается

### ⚠️ Возможные проблемы:

**Claude Flow не запускается:**
```bash
# Проверить установку
npx claude-flow@alpha --version

# Установить если нужно
npm install -g claude-flow@alpha

# Проверить переменную среды
echo $CLAUDE_PROJECT_DIR
```

**Хуки не срабатывают:**
```bash
# Проверить настройки
cat ~/.claude/settings.json

# Или локальные
cat .claude/settings.json

# Перезапустить Claude Code
```

**Секреты не детектируются:**
```bash
# Ручной запуск security сканера
bash .claude/hooks/security-scan.sh
```

## 🎛️ Основные команды

```bash
# 🔧 АКТИВАЦИЯ И НАСТРОЙКА
bash .claude/activate-hooks.sh          # Активация системы
bash .claude/quick-check.sh             # Быстрая проверка
bash .claude/validate-claude-flow.sh    # Полная валидация

# 🧪 ТЕСТИРОВАНИЕ  
bash .claude/test-claude-flow.sh        # Тест Claude Flow интеграции

# 🛡️ SECURITY
bash .claude/hooks/security-scan.sh     # Полное сканирование
bash .claude/hooks/cleanup.sh           # Очистка мусора

# 📊 МОНИТОРИНГ
ls -la .claude/logs/                     # Все логи
ls -la .hive-mind/sessions/              # Сессии AI-агентов
cat .claude/claude-flow-report.md       # Последний отчет
```

## 💡 Полезные советы

### Для лучшей работы Claude Flow:
- Формулируйте промпты четко и конкретно
- Разбивайте сложные задачи на этапы
- Используйте контекст и детали

### Для отладки:
- Проверяйте логи при проблемах
- Используйте `tail -f .claude/logs/*.log` для мониторинга в реальном времени
- Анализируйте summary файлы в сессиях

### Для оптимизации:
- Регулярно очищайте старые сессии: `find .hive-mind/sessions -mtime +30 -delete`
- Мониторьте размер проекта: `du -sh .`
- Проверяйте покрытие security сканированием

---

## 🎉 Готово!

Теперь у вас есть полная AI-assisted среда разработки с автоматической защитой. 

**Просто работайте как обычно - система все сделает сама!** 🚀