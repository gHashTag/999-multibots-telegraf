# ✅ AI Reels Template 1 (Veo 3.1) - Миграция на Fal.ai

## 🎯 Что изменилось

Переключили **lip-sync провайдер** с Kie.ai на **Fal.ai Veed Fabric 1.0 Fast**.

## 🔧 Изменения в коде

### 1. **Метод создания input** ✅
**Файл**: `src/scenes/lipSyncWizard/ai-reels-wizard.ts:812-820`

**Было**:
```typescript
const input = LipSyncInputBuilder.forVeedFabric(
  imageUrl,
  finalAudioUrl,
  telegramId,
  {
    botName: ctx.botInfo?.username || 'unknown_bot',
    resolution: '720p',
    isAudioUrl: true,
  }
)
// Создавало input с provider='kie', modelId='veed-fabric'
```

**Стало**:
```typescript
const input = LipSyncInputBuilder.forFalVeedFabric(
  imageUrl,
  finalAudioUrl,
  telegramId,
  {
    botName: ctx.botInfo?.username || 'unknown_bot',
    resolution: '720p',
  }
)
// Создает input с provider='fal', modelId='fal-veed-fabric-1.0-fast'
```

### 2. **Удалён ненужный импорт** ✅
**Файл**: `src/scenes/lipSyncWizard/ai-reels-wizard.ts:829-858`

**Удалено**:
- Импорт `KieVeedFabricProvider`
- Создание экземпляра `kieProvider`
- Устаревшие комментарии про "Fal.ai баланс исчерпан"

**Оставлено**:
- AsyncLipSyncManager автоматически создаст FalVeedFabricProvider через factory

### 3. **Обновлены логи** ✅
Все логи теперь указывают на Fal.ai:
```typescript
logger.info('🎭 [AI REELS] Запуск генерации lip-sync через Fal.ai Veed Fabric 1.0 Fast', {
  provider: input.provider, // 'fal'
  modelId: input.modelId,   // 'fal-veed-fabric-1.0-fast'
  resolution: input.resolution, // '720p'
})
```

## 🏗️ Архитектура

### AsyncLipSyncManager Workflow:
1. Получает `input` с `provider='fal'` и `modelId='fal-veed-fabric-1.0-fast'`
2. Через `lipSyncProviderFactory` создаёт `FalVeedFabricProvider`
3. Вызывает `FalVeedFabricProvider.generate(input)`
4. **Fal.ai работает СИНХРОННО** - возвращает `status: 'succeeded'` сразу
5. AsyncLipSyncManager не запускает webhook polling
6. Сразу отправляет результат пользователю

### Kie.ai vs Fal.ai:
| Параметр | Kie.ai | Fal.ai |
|----------|--------|---------|
| **API Mode** | Асинхронный (webhook) | Синхронный (blocking) |
| **Время ответа** | 2-10 минут | 30-60 секунд |
| **Fallback polling** | Да (через 2 мин) | Нет (не требуется) |
| **Webhook endpoint** | `/api/kie-ai/callback` | Не используется |
| **Цена 720p (10 сек)** | ~140⭐ | 187⭐ (с наценкой 50%) |

## 💰 Стоимость Template 1

**Текущая**: 240⭐ (фиксированная)

**Включает**:
1. ✅ **Lip-sync** (Fal.ai Veed Fabric 1.0 Fast) - ~187⭐/10сек
2. **Google Veo 3.1** (Kie.ai image-to-video) - ~160⭐
3. **FFmpeg склеивание** - бесплатно

**Примечание**: Цена 240⭐ осталась фиксированной. Может потребоваться перерасчёт после тестирования реальной длительности видео.

## 🔑 Environment Variables

**Требуется**:
```bash
FAL_KEY=71230666-ca55-444...  # ✅ Настроен в .env
```

**Не требуется для lip-sync**:
```bash
KIE_AI_API_KEY=...  # Используется только для Google Veo 3.1
BASE_WEBHOOK_URL=... # Не используется для Fal.ai
```

## ✅ Преимущества Fal.ai

1. **Быстрее** - синхронный режим, результат за 30-60 секунд
2. **Проще** - не требует webhook инфраструктуры
3. **Надёжнее** - нет проблем с fallback polling
4. **Детерминированно** - всегда получаем результат или ошибку сразу

## 🚀 Деплой изменений

```bash
# Локально
npm run build

# Production (GitHub Actions)
git add .
git commit -m "feat: migrate AI Reels Template 1 to Fal.ai provider"
git push origin production

# Или через slash команду
/deploy
```

## 🧪 Тестирование

1. Запустить бота в production
2. Выбрать "AI Reels" → "Шаблон номер один (WAN25)"
3. Загрузить изображение
4. Ввести текст для озвучки
5. Проверить логи:
   - ✅ `provider='fal'`, `modelId='fal-veed-fabric-1.0-fast'`
   - ✅ Синхронный результат без webhook polling
   - ✅ Видео готово за 30-60 секунд

## 📊 Мониторинг

**Логи успешной генерации**:
```
🎭 [AI REELS] Input создан для Fal.ai Veed Fabric 1.0 Fast
🎭 [AI REELS] Запуск генерации lip-sync через Fal.ai Veed Fabric 1.0 Fast
🚨 [FAL PROVIDER] CRITICAL DEBUG: Вызываем fal.subscribe
✅ Получен ответ от Fal.ai API
✅ Fal.ai Veed Fabric видео успешно сгенерировано
```

**Логи ошибок** (если Fal.ai недоступен):
```
❌ [FAL PROVIDER] Ошибка Fal.ai API
message: "Fal.ai API error: ..."
code: "FAL_API_ERROR"
```

## 🔄 Откат на Kie.ai (если потребуется)

Если Fal.ai баланс исчерпан или есть проблемы:

```typescript
// В ai-reels-wizard.ts:812
const input = LipSyncInputBuilder.forVeedFabric(
  imageUrl,
  finalAudioUrl,
  telegramId,
  {
    botName: ctx.botInfo?.username || 'unknown_bot',
    resolution: '720p',
    isAudioUrl: true,
  }
)
```

Это вернёт `provider='kie'` и AsyncLipSyncManager создаст KieVeedFabricProvider.
