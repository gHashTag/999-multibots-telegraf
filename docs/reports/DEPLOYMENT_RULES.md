# 📦 DEPLOYMENT RULES - ПРАВИЛА ДЕПЛОЯ

## 🚨 КРИТИЧЕСКИ ВАЖНО!

### ⚠️ ПОСЛЕДОВАТЕЛЬНОСТЬ ДЕПЛОЯ - НЕ НАРУШАТЬ!

**ОБЯЗАТЕЛЬНЫЙ ПОРЯДОК:**
1. **main** (three-head-dev.shop) → ТЕСТИРОВАНИЕ
2. **production** (212.86.115.30) → ПРОДАКШЕН

**❌ ЗАПРЕЩЕНО:**
- ❌ Запускать в production напрямую без тестирования в main
- ❌ "Быстрые" деплои в production без проверки в main
- ❌ Игнорирование тестирования в main

**✅ ПРАВИЛЬНО:**
- ✅ Сначала все изменения в main → тестирование на three-head-dev.shop
- ✅ Только после успешного тестирования → production
- ✅ Всегда проверять в main перед production

**⚠️ ПОЧЕМУ ВАЖНО:**
- Агенты могут сломать систему
- production - это продакшен пользователи
- main - безопасная среда для тестирования
- Ошибки в production = репутация, деньги, потеря клиентов

### ВЕТКИ И СЕРВЕРЫ:

1. **main** → `three-head-dev.shop`
   - SSL сертификаты: `/etc/letsencrypt/live/three-head-dev.shop/fullchain.pem`
   - SSL ключ: `/etc/letsencrypt/live/three-head-dev.shop/privkey.pem`
   - Деплой через: `deploy.yml`

2. **production** → `212.86.115.30` (IP адрес)
   - Прямой SSH доступ
   - Деплой через: `production-deploy.yml`

### ❌ НИКОГДА НЕ ПУТАТЬ!

- НЕ заливать main в 212.86.115.30
- НЕ заливать production в three-head-dev.shop
- main = домен three-head-dev.shop
- production = IP 212.86.115.30

### 🔧 Workflow файлы:

- `.github/workflows/deploy.yml` - деплоит **main** в **three-head-dev.shop**
- `.github/workflows/production-deploy.yml` - деплоит **production** в **212.86.115.30**

### 📝 КОМАНДЫ:

**ПРАВИЛЬНАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ:**

```bash
# ШАГ 1: Сначала в main (тестирование)
git push origin functional-architecture:main
# ✅ ОЖИДАНИЕ: Проверка работы на three-head-dev.shop

# ШАГ 2: Только после успешного тестирования → в production
git push origin functional-architecture:production
# ✅ ПРОДАКШЕН: Безопасный деплой
```

**❌ НЕПРАВИЛЬНО:**
```bash
# НИКОГДА так не делать!
git push origin functional-architecture:production  # БЕЗ тестирования в main
```

**✅ АВТОМАТИЧЕСКИЙ ДЕПЛОЙ:**
- GitHub Actions автоматически деплоит main → three-head-dev.shop
- GitHub Actions автоматически деплоит production → 212.86.115.30

### ⚠️ ПРОВЕРКИ ПЕРЕД ДЕПЛОЕМ:

1. Убедиться, что правильная ветка
2. Проверить server_host в deploy.yml или production-deploy.yml
3. Убедиться в SSL сертификатах для three-head-dev.shop

### ✅ ЧЕКЛИСТ ПЕРЕД PRODUCTION:

**ОБЯЗАТЕЛЬНЫЕ ШАГИ:**

- [ ] Код протестирован в main (three-head-dev.shop)
- [ ] Все функции работают корректно
- [ ] Нет критических ошибок в логах
- [ ] Боты инициализированы успешно
- [ ] API отвечает на /health
- [ ] Создан backup текущего состояния production
- [ ] Уведомлены пользователи о деплое (если необходимо)
- [ ] Готов к быстрому rollback при проблемах

**ТОЛЬКО ПОСЛЕ ЭТОГО:**
```bash
git push origin functional-architecture:production
```

### 🚨 ПОСЛЕДСТВИЯ НАРУШЕНИЙ:

- ❌ Сломанный production = потеря доверия пользователей
- ❌ Агенты несут ответственность за поломки
- ❌ Восстановление может занять часы
- ❌ Возможна потеря данных
- ❌ Репутационные потери

### 🛠️ ДЛЯ АГЕНТОВ:

**ВСЕГДА ПОМНИТЬ:**
1. main = безопасная среда для экспериментов
2. production = священное место, не трогать без разрешения
3. Сначала тестирование, потом продакшен
4. При сомнениях - спросить человека

**СТОП-ФРАЗЫ:**
- "Нужно протестировать в main"
- "Это требует проверки перед production"
- "Production требует особой осторожности"
