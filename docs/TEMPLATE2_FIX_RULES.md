# 🚨 ПРАВИЛА ПРЕДОТВРАЩЕНИЯ ПОЛОМКИ TEMPLATE 2

## ✅ ИСТОРИЯ ПРОБЛЕМЫ

### Что сломалось:
**Коммит `6a6b3d2e1` (Oct 27, 2025)** - Emergency rollback удалил ленивую инициализацию в `InngestProvider`

### Причина:
```typescript
// ❌ СЛОМАНО (после rollback):
class InngestProvider {
  constructor() {
    this.initializeConfigs() // ENV МОГУТ НЕ БЫТЬ ЗАГРУЖЕНЫ!
  }
}

// ✅ РАБОТАЕТ:
class InngestProvider {
  constructor() {
    // Ленивая инициализация
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeConfigs() // ENV УЖЕ ЗАГРУЖЕНЫ при первом вызове
    }
  }
}
```

### Последствия:
1. `RENDER_INNGEST_EVENT_KEY` = undefined при инициализации
2. RENDER instance НЕ настраивается
3. `sendRenderAvatarVideoEvent()` падает с ошибкой
4. "Запрос не ушел на ingest" ❌

---

## 🛠️ ПРАВИЛА ИСПРАВЛЕНИЯ

### 1. **Никогда НЕ удаляйте ленивую инициализацию**
```typescript
// ❌ ЗАПРЕЩЕНО:
constructor() {
  this.initializeConfigs() // ENV могут быть undefined
}

// ✅ ОБЯЗАТЕЛЬНО:
constructor() {
  // Только отложенная инициализация
}

private ensureInitialized() {
  if (!this.initialized) {
    this.initializeConfigs()
  }
}
```

### 2. **Всегда вызывайте ensureInitialized() ПЕРЕД использованием config**
```typescript
// ✅ ПРАВИЛЬНО:
getConfig(instance: InngestInstance): InngestConfig | null {
  this.ensureInitialized() // ✅ Вызываем ПЕРЕД получением config
  return this.configs.get(instance)
}
```

### 3. **Проверяйте ENV переменные ПЕРЕД деплойем**
```bash
# Обязательные переменные для Template 2:
✅ RENDER_INNGEST_EVENT_KEY
✅ RENDER_INNGEST_SIGNING_KEY
✅ ELEVENLABS_API_KEY
✅ HEDRA_API_KEY (для Hedra)
✅ HEYGEN_COCOAGE_API_KEY (для HeyGen Cocoage)
✅ HEYGEN_HAIM_API_KEY (для HeyGen Haim)
✅ KIE_AI_API_KEY
```

### 4. **Логируйте состояние инициализации**
```typescript
logger.info('🔧 [INNGEST PROVIDER] Lazy initialization completed', {
  instances: Array.from(this.configs.keys()),
  renderConfigured: this.configs.has('RENDER'),
  botConfigured: this.configs.has('BOT'),
})
```

---

## 🔍 ДИАГНОСТИКА ПРОБЛЕМ

### Симптомы:
- Пользователь выбирает Template 2
- Рассчитывается стоимость ✅
- Запрос "отправлен на render-server" ✅
- **НО**: запрос не приходит в ingest/Railway ❌

### Диагностика:
1. **Проверить endpoint**: `GET /api/diagnostic/template2`
2. **Смотреть логи**: поиск "RENDER instance missing"
3. **Проверить ENV**: `RENDER_INNGEST_EVENT_KEY` должен быть установлен

---

## 🛡️ МЕРЫ ЗАЩИТЫ

### 1. **Unit тесты для инициализации**
```typescript
describe('InngestProvider', () => {
  it('should have RENDER config after lazy init', () => {
    const config = inngestProvider.getConfig('RENDER')
    expect(config).toBeDefined()
    expect(config.eventKey).toBeTruthy()
  })
})
```

### 2. **Health check endpoint**
```typescript
router.get('/health/render-template2', async (req, res) => {
  const config = inngestProvider.getConfig('RENDER')
  res.json({
    status: config ? 'OK' : 'ERROR',
    renderConfigured: !!config,
  })
})
```

### 3. **Pre-deploy проверка**
```bash
#!/bin/bash
if [ -z "$RENDER_INNGEST_EVENT_KEY" ]; then
  echo "❌ RENDER_INNGEST_EVENT_KEY не установлен!"
  exit 1
fi
```

---

## 📋 CHECKLIST ПЕРЕД ИЗМЕНЕНИЕМ InngestProvider

- [ ] Проверить, что ленивая инициализация сохранена
- [ ] Убедиться, что `ensureInitialized()` вызывается ПЕРЕД `getConfig()`
- [ ] Проверить, что ENV переменные логируются
- [ ] Протестировать с пустыми ENV (должна быть ошибка)
- [ ] Протестировать с заполненными ENV (должно работать)
- [ ] Проверить, что RENDER instance настроен
- [ ] Запустить health check

---

## 🚀 БЫСТРОЕ ИСПРАВЛЕНИЕ

Если Template 2 сломан:

1. **Проверить ENV**:
   ```bash
   echo $RENDER_INNGEST_EVENT_KEY
   ```

2. **Перезапустить приложение** (чтобы перезагрузить ENV)

3. **Проверить health check**:
   ```bash
   curl https://your-domain.com/api/health/render-template2
   ```

4. **Если не помогло - восстановить ленивую инициализацию** (код уже исправлен)

---

## 📊 СВЯЗАННЫЕ ФАЙЛЫ

- `src/inngest_app/inngest-provider.ts` - **КРИТИЧНЫЙ** ✅ УЖЕ ИСПРАВЛЕН
- `src/inngest_app/render-server-client.ts` - Отправка в Inngest
- `src/api_server/routes/ai-reels-callback.routes.ts` - Webhook ✅ РАБОТАЕТ
- `.env` - ENV переменные ✅ НАСТРОЕНЫ

---

## 🎯 ИТОГ

**Проблема найдена и исправлена** ✅
- Ленивая инициализация восстановлена
- ENV переменные настроены
- Webhook доступен

**Возможная причина**: ENV переменные не были перезагружены на production после деплоя.

**Решение**: Перезапустить production сервер.
