# 🔄 Worktree Environment Synchronization

## 🚨 Проблема

При создании новых git worktree автоматически не копируются `.env` файлы (так как они в `.gitignore`), что приводит к ошибкам при запуске проекта:

```
Error: Neither .env nor .env.example exists
Error: SUPABASE_URL is required but undefined
```

## ✅ Решение

Создана система автоматической синхронизации `.env` файлов между основным репозиторием и worktree.

## 📦 Компоненты системы

### 1. **Автоматическая синхронизация**
- `scripts/worktree-env-sync.sh` - основной скрипт синхронизации
- `scripts/sync-env.sh` - обновленный wrapper для обратной совместимости
- Автоматически копирует `.env` из основного репозитория
- Проверяет наличие критических переменных

### 2. **Git Hooks**
- `scripts/setup-worktree-hooks.sh` - настройка git hooks
- Автоматическая синхронизация при `git checkout`, `git pull`, `git merge`
- Hooks устанавливаются локально в `.git/hooks/`

### 3. **File Watcher**
- `scripts/env-watcher.sh` - мониторинг изменений в реальном времени
- Автоматически синхронизирует при изменении основного `.env` файла
- Поддерживает `fswatch` и fallback на polling

### 4. **Quick Fix**
- `scripts/fix-env.sh` - быстрое исправление всех проблем
- Выполняет полную настройку за один запуск
- Опция создания символической ссылки

## 🚀 Использование

### Быстрый старт

```bash
# Быстрое исправление всех проблем
npm run env:fix

# Или напрямую
./scripts/fix-env.sh
```

### Доступные команды

```bash
# Синхронизация .env файлов
npm run env:sync

# Настройка git hooks
npm run env:setup

# Запуск file watcher
npm run env:watch

# Полное исправление
npm run env:fix
```

### Автоматическая синхронизация

При запуске `npm run dev` или `bun dev` автоматически выполняется:
1. Синхронизация `.env` файлов
2. Проверка критических переменных
3. Убийство старых процессов
4. Запуск проекта

## 🔧 Настройка

### Установка git hooks

```bash
npm run env:setup
```

После установки `.env` будет автоматически синхронизироваться при:
- `git checkout <branch>`
- `git pull`
- `git merge`

### Символическая ссылка (рекомендуется)

Вместо копирования можно создать символическую ссылку:

```bash
# Удаляем копию
rm .env

# Создаем symlink
ln -s /Users/playra/999-agents-telegraf/.env .env
```

Преимущества:
- Мгновенная синхронизация
- Нет дублирования файлов
- Изменения видны сразу во всех worktree

## 📋 Проверяемые переменные

Скрипты автоматически проверяют наличие:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `BOT_TOKEN_*` (токены ботов)

## 🐛 Решение проблем

### Ошибка: .env file not found

```bash
# Запустите синхронизацию
./scripts/worktree-env-sync.sh
```

### Ошибка: SUPABASE_URL is undefined

```bash
# Проверьте наличие переменной
grep "SUPABASE_URL=" .env

# Если нет - скопируйте из основного репо
cp /Users/playra/999-agents-telegraf/.env .env
```

### Ошибка: Permission denied

```bash
# Сделайте скрипты исполняемыми
chmod +x scripts/*.sh
```

## 📂 Структура файлов

```
999-agents-telegraf/
├── .env                          # Основной .env файл
└── worktrees/
    └── template-1/
        ├── .env                  # Синхронизированная копия/symlink
        └── scripts/
            ├── worktree-env-sync.sh    # Основной скрипт
            ├── env-watcher.sh           # File watcher
            ├── setup-worktree-hooks.sh  # Git hooks setup
            ├── fix-env.sh               # Quick fix
            └── sync-env.sh              # Legacy wrapper
```

## ⚠️ Важные моменты

1. **Не коммитьте .env файлы** - они должны быть в `.gitignore`
2. **Регулярно синхронизируйте** - запускайте `npm run env:sync` после изменений
3. **Используйте symlink** - для мгновенной синхронизации
4. **Проверяйте переменные** - убедитесь, что все критические переменные присутствуют

## 🔐 Безопасность

- `.env` файлы никогда не должны попадать в git
- Используйте `.env.example` для шаблона без секретных данных
- Регулярно ротируйте токены и ключи
- Не делитесь `.env` файлами через публичные каналы