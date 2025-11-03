# 🚀 БЫСТРОЕ ИСПРАВЛЕНИЕ TEMPLATE 2

## ⚡ В КРАТЦЕ

**Проблема**: После rollback коммита `6a6b3d2e1` удалили ленивую инициализацию в `InngestProvider`, из-за чего ENV переменные не загружались при старте.

**Решение**: ✅ Код исправлен, нужна перезагрузка production.

---

## 📋 ЧТО СДЕЛАНО

### 1. ✅ Восстановлена ленивая инициализация
```typescript
// src/inngest_app/inngest-provider.ts
private ensureInitialized() {
  if (!this.initialized) {
    this.initializeConfigs() // ENV уже загружены
  }
}
```

### 2. ✅ Добавлена диагностика
- Endpoint: `GET /api/diagnostic/template2`
- Проверяет ENV и конфигурацию InngestProvider

### 3. ✅ Созданы тесты
- `tests/test-template2-send-event.ts`
- Проверяет готовность к отправке

### 4. ✅ Документированы правила
- `docs/TEMPLATE2_FIX_RULES.md`
- Предотвращение повторения

---

## 🎯 ЧТО НУЖНО СДЕЛАТЬ СЕЙЧАС

### 1. Перезапустить production сервер (5 минут)
```bash
# Подключиться к серверу
ssh root@212.86.115.30

# Перезапустить сервис
pm2 restart all
# или
systemctl restart bot-service

# Проверить логи
tail -f /var/log/bot.log
```

### 2. Проверить диагностику
```bash
curl https://three-head-dragon.shop/api/diagnostic/template2
```

**Ожидаемый результат**:
```json
{
  "renderInngest": {
    "EVENT_KEY_SET": true,
    "SIGNING_KEY_SET": true
  },
  "inngestProvider": {
    "INITIALIZED": true,
    "RENDER_CONFIG": {
      "HAS_EVENT_KEY": true,
      "HAS_CLIENT": true
    }
  }
}
```

### 3. Протестировать Template 2
1. Зайти в бот
2. AI Reels → Template 2
3. Выбрать Hedra или HeyGen
4. Заполнить все поля
5. Нажать "Создать"
6. Проверить логи на Railway

---

## 🔍 ПРОВЕРКА В ЛОГАХ

### В bot.log искать:
```
✅ [INNGEST PROVIDER] Lazy initialization completed
✅ [INNGEST PROVIDER] RENDER instance configured
✅ [AI REELS RENDER] Event sent successfully
```

### В Railway логах искать:
```
Received Inngest event: render-riddle
Processing job: telegram-{id}-{timestamp}
```

---

## ❌ ЕСЛИ НЕ РАБОТАЕТ

### Проверить ENV на сервере:
```bash
ssh root@212.86.115.30
cat /etc/environment | grep RENDER_INNGEST
```

**Должно быть**:
```
RENDER_INNGEST_EVENT_KEY=G3Bx0PKnHRRyDwyxJy1QIOT...
RENDER_INNGEST_SIGNING_KEY=signkey-branch-8e271f30535f3894656ff9b5e4cf97e1673880aa06c7b5d1470b3082110b2cf6
```

### Если ENV не найдены:
1. Отредактировать `/etc/environment`
2. Добавить ключи из `.env` файла
3. Перезагрузить сервер: `reboot`

---

## 📞 ПОДДЕРЖКА

### Файлы отчета:
- `docs/TEMPLATE2_INVESTIGATION_REPORT.md` - Полный отчет
- `docs/TEMPLATE2_FIX_RULES.md` - Правила предотвращения
- `scripts/diagnose-render-template2.sh` - Скрипт диагностики

### Диагностика:
- `GET /api/diagnostic/template2` - Проверка ENV
- `tests/test-template2-send-event.ts` - Локальный тест

---

**Статус**: ✅ Код исправлен
**Действие**: Перезапустить production сервер
**Время**: 5 минут
**Блокирует**: Template 2 (AI Reels через Inngest)
