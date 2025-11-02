# 🚀 ПРАВИЛА ДЕПЛОЯ - ОБЯЗАТЕЛЬНО К ПРОЧТЕНИЮ

## ⚠️ КРИТИЧЕСКИ ВАЖНО

### НИКОГДА НЕ ДЕПЛОИТЬ В PRODUCTION!
- **Production сервер**: 212.86.115.30
- **Запрещено**: Пушить, деплоить, тестировать на production
- **Нарушение**: Может сломать живую систему!

### ✅ ТОЛЬКО MAIN BRANCH
- **Главная ветка**: \`main\` (staging)
- **Сервер**: 45.66.11.152 (DEV)
- **Разрешено**: Все эксперименты, тесты, деплой

---

## 🏗️ АРХИТЕКТУРА DEPLOYMENT

\`\`\`
production (212.86.115.30)  ←  НЕ ТРОГАТЬ!
    ↓
main (45.66.11.152)         ←  ЗДЕСЬ ВСЁ РАБОТАЕМ!
    ↓
temp-main (локально)        ←  Разработка
\`\`\`

---

## 📋 WORKFLOW

### 1. Разработка
\`\`\`bash
git checkout temp-main  # или создать feature branch
# Кодим, тестируем локально
git add .
git commit -m "feat: описание изменений"
\`\`\`

### 2. Деплой в DEV (main)
\`\`\`bash
git push origin temp-main  # Пушим в temp-main
# ИЛИ создаем PR в main
\`\`\`

### 3. После проверки в main
\`\`\`bash
# Если всё ок - мерджим в main (автоматически деплоится на DEV)
git checkout main
git merge temp-main
\`\`\`

### 4. PRODUCTION ДЕПЛОЙ
\`\`\`bash
# ТОЛЬКО после полного тестирования в main!
# ДЕЛАЕТСЯ РУЧНО и ОСОБО ВНИМАТЕЛЬНО!
git checkout production
git merge main
# Затем ручной деплой на production сервер
\`\`\`

---

## 🚫 ЗАПРЕЩЕНО

- ❌ \`git push origin production\` - НИКОГДА!
- ❌ \`git push origin main --force\` - Может сломать!
- ❌ Деплой на 212.86.115.30 без проверки
- ❌ Изменения в production branch напрямую
- ❌ Скрипты deploy.sh без проверки

---

## ✅ РАЗРЕШЕНО

- ✅ \`git push origin temp-main\` - Да!
- ✅ \`git push origin main\` - Да!
- ✅ Деплой на 45.66.11.152 - Да!
- ✅ Эксперименты в main - Да!
- ✅ PR в main - Да!

---

## 🔧 КОМАНДЫ

### Проверка ветки
\`\`\`bash
git branch --show-current
\`\`\`

### Переключение на main
\`\`\`bash
git checkout main
\`\`\`

### Проверка remote
\`\`\`bash
git remote -v
\`\`\`

### Статус изменений
\`\`\`bash
git status
\`\`\`

---

## 🎯 ИТО

**ЗАПОМНИТЬ:**
1. **main** = DEV сервер (45.66.11.152) = можно всё
2. **production** = LIVE сервер (212.86.115.30) = НЕ ТРОГАТЬ!
3. Все пуши → temp-main → PR в main → автоматический деплой

**НАРУШЕНИЕ ПРАВИЛ МОЖЕТ СЛОМАТЬ СИСТЕМУ!**
