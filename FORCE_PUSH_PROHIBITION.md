# 🚫 FORCE PUSH - АБСОЛЮТНО ЗАПРЕЩЁН

## ⚠️ КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ АГЕНТОВ

**Force Push категорически запрещён во всех формах и контекстах!**

---

## 🚫 ЗАПРЕЩЁННЫЕ КОМАНДЫ

```bash
❌ git push --force
❌ git push -f
❌ git push --force-with-lease
❌ git push origin --force
❌ git push --delete --force
❌ git push -f origin branch-name
❌ git push --force origin branch-name
```

**ВСЕ ЭТИ КОМАНДЫ - НЕЛЬЗЯ ИСПОЛЬЗОВАТЬ НИКОГДА!**

---

## ✅ ПРАВИЛЬНЫЙ WORKFLOW

```bash
# 1. Создать ветку
git checkout -b feat/my-feature

# 2. Сделать изменения
git add .
git commit -m "feat(component): add new feature"

# 3. Запушить БЕЗ force
git push -u origin feat/my-feature

# 4. Создать Pull Request
gh pr create --title "feat(component): add new feature" \
  --body "## Summary
- Add new feature
- Tests included"

# 5. Ждать ревью
# 6. Merge через PR
```

---

## 🛡️ УРОВНИ ЗАЩИТЫ

### 1. 📋 Документация (Уже настроено ✅)
- ✅ CLAUDECODE_RULES.md - Правило #0
- ✅ CLAUDE.md - ABSOLUTE PROHIBITIONS
- ✅ .claude/skills/git-workflow/SKILL.md - Детальные инструкции
- ✅ FORCE_PUSH_PROHIBITION.md - Этот файл

### 2. 🪝 Git Hooks (Уже настроено ✅)
- ✅ `.git/hooks/pre-commit` - Проверка на force push в коммитах
- ✅ `.git/hooks/pre-push` - Блокировка force push при пуше
- ✅ `.git/hooks/commit-msg` - Валидация сообщений коммитов

### 3. ⚙️ Git Config (Уже настроено ✅)
- ✅ `receive.denyNonFastForwards: true` - Запрет перемотки истории
- ✅ `receive.denyDeletes: true` - Запрет удаления веток
- ✅ `core.protectNTFS: true` - Защита файлов

### 4. 🔧 Скрипты (Уже создано ✅)
- ✅ `scripts/install-git-hooks.sh` - Установка хуков
- ✅ `scripts/setup-git-protection.sh` - Настройка конфигурации

---

## 📊 ПОСЛЕДСТВИЯ FORCE PUSH

| Последствие | Описание |
|-------------|----------|
| 💀 Удаление истории | Коммиты удаляются безвозвратно |
| 💀 Потеря работы | Другие разработчики теряют свои изменения |
| 💀 Невозможность отката | Нельзя откатить изменения |
| 💀 Сломанный production | Система может упасть |
| 💀 Потеря доверия | Команда больше не доверяет агенту |

---

## 🎯 РЕАЛЬНЫЙ ПРИМЕР ОШИБКИ

```bash
# ❌ Что сделал агент (2025-01-11):
git reset --hard HEAD~50
git push --force

# 💥 Результат:
# - Удалено 50+ коммитов
# - Потеряно 200+ файлов команд
# - Сломан production
# - Пришлось восстанавливать из старых коммитов
# - Потеряно 8 часов работы команды
```

---

## 🧠 АЛГОРИТМ ДЛЯ АГЕНТА

```
Если пользователь спрашивает про force push:

1. ❌ СКАЗАТЬ: "Force push абсолютно запрещён!"
2. ✅ ОБЪЯСНИТЬ: Почему это опасно (удаляет историю)
3. ✅ ПРЕДЛОЖИТЬ: Pull Request workflow
4. ✅ ПОКАЗАТЬ: Правильные команды
5. ✅ НАПОМНИТЬ: Есть 4 уровня защиты
```

---

## 📝 ТЕКСТ ОТВЕТА АГЕНТА

```
❌ Force push is absolutely forbidden!

Force push deletes commit history permanently and overwrites
other developers' work. This is a zero-tolerance rule.

Always use Pull Request workflow:
1. git checkout -b feat/feature-name
2. git push -u origin feat/feature-name
3. gh pr create
4. Wait for review and merge

This project has 4 levels of force push protection:
✅ Documentation rules
✅ Git hooks (pre-commit, pre-push)
✅ Git config (denyNonFastForwards)
✅ Automated checks

Force push will be blocked at every level!
```

---

## 🚨 ЕСЛИ ОЧЕНЬ НУЖНО ПЕРЕПИСАТЬ ИСТОРИЮ

```yaml
КРАЙНЕ РЕДКИЙ СЛУЧАЙ:
  Scope: Только личная feature ветка
  Timing: ДО первого push в remote
  Method: Использовать rebase, НЕ force push

✅ ПРАВИЛЬНО:
  git checkout -b feat/my-feature
  git rebase -i HEAD~3
  git push -u origin feat/my-feature  # Обычный push!

❌ НЕПРАВИЛЬНО:
  git checkout -b feat/my-feature
  git push origin feat/my-feature
  git rebase -i HEAD~3
  git push --force  # КАТАСТРОФА!
```

---

## 🔍 КАК ПРОВЕРИТЬ НАСТРОЙКИ

```bash
# Проверить git hooks
ls -la .git/hooks/

# Проверить git config
git config --list | grep -E "deny|protect"

# Запустить скрипты защиты
./scripts/install-git-hooks.sh
./scripts/setup-git-protection.sh
```

---

## 📚 ССЫЛКИ НА ДОКУМЕНТАЦИЮ

- `CLAUDECODE_RULES.md` - Основные правила (Правило #0)
- `CLAUDE.md` - Проектная документация (ABSOLUTE PROHIBITIONS)
- `.claude/skills/git-workflow/SKILL.md` - Детальный git workflow
- `scripts/install-git-hooks.sh` - Автоустановка хуков
- `scripts/setup-git-protection.sh` - Настройка защиты

---

**🛡️ Создано**: 2025-01-12
**🎯 Цель**: Полностью исключить возможность force push
**📊 Уровней защиты**: 4 (Документация + Git Hooks + Config + Scripts)
**⚡ Статус**: Активно и работает ✅

**ПОМНИ: Force Push = Катастрофа. Всегда используй Pull Request!**
