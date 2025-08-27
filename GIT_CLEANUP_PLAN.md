<<<<<<< HEAD
# ⚠️ ПЛАН КРИТИЧЕСКОЙ ОЧИСТКИ GIT ИСТОРИИ

**Статус:** 🚨 КРИТИЧЕСКОЕ - НАЙДЕНЫ РЕАЛЬНЫЕ СЕКРЕТЫ В ИСТОРИИ
**Дата создания:** 2025-08-23  
**Приоритет:** НЕМЕДЛЕННЫЙ

---

## 🔍 ОБНАРУЖЕННЫЕ ПРОБЛЕМЫ

### ❌ Обнаруженные проблемы безопасности:

#### Примеры типов секретов для поиска:

**OpenAI API Keys:**
- Формат: `sk-[a-zA-Z0-9]{48}` 
- **Действие:** Проверить и отозвать на https://platform.openai.com/api-keys

**Telegram Bot Tokens:**
- Формат: `***REMOVED***`
- **Действие:** Отозвать через @BotFather командой /revoke

ℹ️ **ВАЖНО:** Все конкретные значения секретов удалены из этого файла в целях безопасности.
Для поиска секретов в вашей истории используйте скрипт `./scripts/security-scan.sh`

---

## 🎯 ПЛАН ДЕЙСТВИЙ (ПОЭТАПНО)

### ЭТАП 1: КРИТИЧЕСКИ СРОЧНЫЕ ДЕЙСТВИЯ (СДЕЛАТЬ СЕГОДНЯ!)

#### 1.1 Отзыв скомпрометированных ключей ⏰ 30 минут

**OpenAI:**
1. Зайти на https://platform.openai.com/api-keys
2. Найти все активные ключи
3. Нажать "Delete" или "Revoke" для каждого
4. Создать новые ключи
5. Сохранить в безопасном месте (НЕ В КОДЕ!)

**Telegram боты (для каждого бота):**
1. Написать @BotFather в Telegram
2. Использовать команду `/mybots`
3. Выбрать бота по токену
4. Использовать `/revoke` для отзыва токена
5. Создать новый токен командой `/newtoken`
6. Сохранить новые токены в `.env` файл

#### 1.2 Создание резервной копии ⏰ 15 минут
```bash
# Создаем полную копию репозитория
cp -r . ../repo_backup_$(date +%Y%m%d_%H%M%S)
```

#### 1.3 Уведомление команды ⏰ 10 минут
Отправить уведомление всем разработчикам:
```
🚨 КРИТИЧЕСКОЕ УВЕДОМЛЕНИЕ О БЕЗОПАСНОСТИ

Найдены скомпрометированные API ключи в git истории.
НЕМЕДЛЕННО:
1. НЕ ИСПОЛЬЗУЙТЕ старые ключи для новых запросов
2. Дождитесь инструкций по обновлению локальных копий
3. В течение 24 часов потребуется заново склонировать репозиторий

Подробности в GIT_CLEANUP_PLAN.md
```

### ЭТАП 2: ПОДГОТОВКА К ОЧИСТКЕ (ДЕНЬ 1)

#### 2.1 Установка инструментов ⏰ 15 минут
```bash
# macOS
brew install git-filter-repo

# Ubuntu/Debian
sudo apt install git-filter-repo

# Через pip
pip install git-filter-repo
```

#### 2.2 Проверка текущего состояния ⏰ 5 минут
```bash
./scripts/security-scan.sh
```

#### 2.3 Установка хуков безопасности ⏰ 5 минут
```bash
./scripts/install-security-hooks.sh
```

### ЭТАП 3: ОЧИСТКА GIT ИСТОРИИ (ДЕНЬ 2)

> ⚠️ **ВНИМАНИЕ:** Этот этап полностью изменит историю репозитория!

#### 3.1 Финальная проверка команды ⏰ 30 минут
- [ ] Все разработчики уведомлены
- [ ] Созданы резервные копии
- [ ] Новые ключи созданы и протестированы
- [ ] git-filter-repo установлен

#### 3.2 Выполнение очистки ⏰ 15 минут
```bash
# ОПАСНО! Переписывает всю историю
./scripts/clean-git-secrets.sh
```

#### 3.3 Проверка результата ⏰ 10 минут
```bash
# Проверяем что секреты удалены
./scripts/security-scan.sh

# Проверяем историю на оставшиеся секреты
# Пример: git log --all -S "ЧАСТЬ_СЕКРЕТА" --oneline
./scripts/security-scan.sh
```

### ЭТАП 4: ОБНОВЛЕНИЕ УДАЛЕННОГО РЕПОЗИТОРИЯ (ДЕНЬ 2)

#### 4.1 Force push всех веток ⏰ 10 минут
```bash
# ОПАСНО! Переписывает историю на сервере
git push --all --force
git push --tags --force
```

#### 4.2 Обновление защищенных веток
Если есть защищенные ветки (main, production):
1. Временно отключить защиту в GitHub/GitLab
2. Выполнить force push
3. Включить защиту обратно

### ЭТАП 5: ОБНОВЛЕНИЕ КОМАНДЫ (ДЕНЬ 3)

#### 5.1 Инструкции для разработчиков ⏰ 5 минут на человека
Отправить каждому:
```bash
# КРИТИЧЕСКИ ВАЖНО!
# 1. Полностью удалить локальную копию:
rm -rf your_project_folder

# 2. Заново склонировать:
git clone <repository_url>

# 3. Настроить новые переменные окружения:
cp .env.example .env
# Заполнить .env НОВЫМИ ключами (НЕ старыми!)

# 4. Установить хуки безопасности:
./scripts/install-security-hooks.sh
```

#### 5.2 Обновление CI/CD пайплайнов ⏰ 30 минут
- [ ] GitHub Actions secrets
- [ ] GitLab CI variables  
- [ ] Jenkins credentials
- [ ] Docker registry secrets
- [ ] Deployment environments

#### 5.3 Обновление продакшен серверов ⏰ 60 минут
- [ ] Обновить `.env` файлы на серверах
- [ ] Перезапустить сервисы
- [ ] Проверить работоспособность
- [ ] Мониторинг ошибок

---

## 🔒 КОНТРОЛЬНЫЙ СПИСОК

### Перед началом очистки:
- [ ] ✅ Все ключи отозваны и созданы новые
- [ ] ✅ Команда уведомлена
- [ ] ✅ Резервные копии созданы
- [ ] ✅ git-filter-repo установлен
- [ ] ✅ Доступ к защищенным веткам настроен

### После очистки:
- [ ] Секреты удалены из истории (проверено скриптом)
- [ ] Force push выполнен успешно
- [ ] Все разработчики обновили локальные копии
- [ ] CI/CD пайплайны обновлены
- [ ] Продакшен сервера обновлены
- [ ] Хуки безопасности установлены везде
- [ ] Мониторинг настроен

---

## 🚨 В СЛУЧАЕ ПРОБЛЕМ

### Если force push заблокирован:
```bash
# Временно отключить защиту ветки в GitHub/GitLab
# Затем:
git push --force-with-lease origin main
```

### Если кто-то не обновил локальную копию:
```bash
# У разработчика будут конфликты
# ЕДИНСТВЕННОЕ решение - заново склонировать
rm -rf project_folder
git clone <repo_url>
```

### Если обнаружены остатки секретов:
```bash
# Найти проблемные коммиты
git log --all -S "секрет" --oneline

# Повторить очистку с дополнительными паттернами
./scripts/clean-git-secrets.sh
```

---

## 📞 ОТВЕТСТВЕННЫЕ

- **Инженер по безопасности:** Выполнение очистки
- **DevOps:** Обновление CI/CD и серверов  
- **Тимлид:** Координация команды
- **Системный администратор:** Обновление продакшена

---

## 🎯 ДОЛГОСРОЧНЫЕ МЕРЫ

### 1. Автоматизация безопасности:
- [ ] GitHub Actions для сканирования секретов
- [ ] Pre-commit хуки на всех машинах
- [ ] Регулярное сканирование репозитория

### 2. Обучение команды:
- [ ] Документация по безопасности
- [ ] Тренинг по работе с секретами
- [ ] Регулярные аудиты

### 3. Технические меры:
- [ ] Vault/AWS Secrets Manager
- [ ] Автоматическая ротация ключей
- [ ] Мониторинг использования API

---

**📋 Статус выполнения:** 
- [x] План создан
- [ ] Ключи отозваны  
- [ ] Команда уведомлена
- [ ] Очистка выполнена
- [ ] Команда обновлена

**⏰ Дедлайн:** 72 часа с момента обнаружения (крайний срок: 2025-08-26)
=======
# Git History Cleanup Plan

## Overview
This document outlines the plan for cleaning up any sensitive information that may have been accidentally committed to the git history.

## Step 1: Pre-cleanup Preparation

### 1.1 Create Backup
```bash
# Create timestamped backup
cp -r . ../repo_backup_$(date +%Y%m%d_%H%M%S)
```

### 1.2 Install Required Tools
```bash
# Install git-filter-repo
brew install git-filter-repo

# Install other required tools
npm install
```

### 1.3 Notify Team
- Send notification to all team members
- Coordinate timing for the cleanup
- Ensure everyone has committed/pushed important changes

## Step 2: Security Scan

### 2.1 Initial Scan
```bash
# Run security scan
./scripts/security-scan.sh
```

### 2.2 Document Findings
- Note all instances of sensitive information
- Categorize by severity
- Document replacement values

## Step 3: Cleanup Process

### 3.1 Environment Setup
```bash
# Ensure clean working directory
git status
git stash # if needed

# Create cleanup branch
git checkout -b security/history-cleanup
```

### 3.2 Run Cleanup
```bash
# Execute cleanup script
./scripts/clean-git-secrets.sh
```

### 3.3 Verify Cleanup
```bash
# Check history for sensitive information
./scripts/security-scan.sh

# Manual review of key files
git log --patch
```

## Step 4: Post-cleanup Actions

### 4.1 Force Push Changes
```bash
# Force push to all branches
git push origin --force --all
git push origin --force --tags
```

### 4.2 Update Protected Branches
1. Temporarily disable branch protection
2. Force push changes
3. Re-enable branch protection

### 4.3 Clean Local Copies
Instructions for team members:
```bash
# Instructions for team
git fetch origin
git reset --hard origin/main
git clean -fd
```

## Step 5: Preventive Measures

### 5.1 Install Git Hooks
```bash
# Install pre-commit hooks
./scripts/install-hooks.sh
```

### 5.2 Update Security Practices
- Review .gitignore
- Set up automated security scanning
- Review deployment scripts

## Step 6: Documentation Updates

### 6.1 Update Security Docs
- Update SECURITY.md
- Document new security practices
- Create incident report

### 6.2 Team Training
- Schedule security training
- Review secure development practices
- Document lessons learned

## Important Files Changed
- .gitignore
- SECURITY.md
- scripts/security-scan.sh
- scripts/pre-commit-security.sh
- scripts/clean-git-secrets.sh
- src/api_server/index.ts
>>>>>>> origin/veo3-1
