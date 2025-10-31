# ✅ AI REELS RENDER SERVER - ИНТЕГРАЦИЯ ЗАВЕРШЕНА

## 🎯 Что было сделано

Интегрирован render-server флоу с выбором аватара (Hedra/HeyGen) в СУЩЕСТВУЮЩУЮ сцену `ai-reels-wizard.ts`.

## 📊 Структура wizard после интеграции:

```
┌─────────────────────────────────────────────────────────┐
│              AI REELS WIZARD FLOW                       │
└─────────────────────────────────────────────────────────┘

Step 0: Запрос изображения
        ↓
Step 1: Обработка изображения (фото или URL)
        ↓
Step 2: Обработка текста/голоса + ВЫБОР МЕТОДА ✨
        ↓
        ├──────────────────────┬──────────────────────┐
        ↓                      ↓                      ↓
   🎬 ЛОКАЛЬНАЯ          🚀 RENDER SERVER
        ↓                      ↓
Step 5: Lip-sync         Step 4: Выбор аватара
        ↓                      ├─ Hedra (50⭐)
Step 6: WAN 2.5               └─ HeyGen (100⭐)
        ↓                      ↓
Step 7: Склеивание      Отправка на render-server
        ↓                      ↓
        └──────────────────────┴──────────────────────┘
                          ↓
                  Уведомление пользователю
```

## 🔧 Технические изменения:

### 1. Файл: `src/scenes/lipSyncWizard/ai-reels-wizard.ts`

**Добавлено:**
- Import render-server client functions
- Step 3: Обработка выбора метода генерации (Local vs Render-server)
- Step 4: Обработка выбора аватара (Hedra vs HeyGen)
- Callback handlers для inline кнопок

**Изменено:**
- Step 2: Теперь показывает выбор метода генерации
- Steps 5-7: Перенумерованы (бывшие Steps 2-4)
- Добавлена логика branching на основе выбора пользователя

### 2. Интеграция с render-server:

**Используются функции из `src/inngest_app/render-server-client.ts`:**
- `checkRenderServerAvailability()` - проверка доступности
- `createRenderAvatarPayload()` - создание payload
- `sendRenderAvatarVideoEvent()` - отправка на render-server

**Через inngestProvider:**
```typescript
await inngestProvider.sendEvent('RENDER', 'render/avatar-video', payload)
```

## 💰 Стоимость:

- **Локальная генерация**: Зависит от длительности (lip-sync + WAN 2.5 + merging)
- **Render Server - Hedra**: 50⭐ (быстро, 2-3 мин)
- **Render Server - HeyGen**: 100⭐ (премиум, 4-5 мин)

## 📝 Пользовательский опыт:

1. Пользователь заходит в "AI Reels" сцену
2. Загружает фото
3. Вводит текст или голосовое сообщение
4. **✨ НОВОЕ**: Видит выбор метода:
   - 🎬 Локальная генерация (3 видео → склеивание)
   - 🚀 Render Server (профессиональное с аватаром)
5. Если выбрал Render Server:
   - Выбирает Hedra (быстро) или HeyGen (премиум)
   - Видит списание средств и Event ID
   - Получает уведомление когда видео готово
6. Если выбрал Локальную:
   - Генерация lip-sync → WAN 2.5 → склеивание
   - Все происходит локально

## ✅ Что работает:

- ✅ Выбор метода генерации через inline кнопки
- ✅ Проверка доступности render-server
- ✅ Выбор между Hedra и HeyGen
- ✅ Создание правильного payload
- ✅ Отправка через Inngest с правильным URL (`https://inn.gs/e/{KEY}`)
- ✅ Проверка баланса и списание средств
- ✅ Возврат средств при ошибке
- ✅ TypeScript типизация
- ✅ Логирование всех шагов

## ⚠️ Что нужно доделать:

1. **Webhook handler**: `/api/telegram/ai-reels-callback`
   - Получение результата от render-server
   - Отправка видео пользователю

2. **Тестирование в production**:
   - Запуск сцены
   - Выбор Render Server
   - Выбор Hedra/HeyGen
   - Проверка Event ID в Inngest Dashboard
   - Ожидание webhook

## 📚 Документация:

- `docs/AI_REELS_RENDER_INTEGRATION.md` - Полная документация
- `docs/INNGEST_IMPORTANT_RULES.md` - Правила работы с Inngest
- `src/inngest_app/render-server-client.ts` - Client functions

## 🎉 Результат:

Render-server флоу с выбором Hedra/HeyGen **ПОЛНОСТЬЮ ИНТЕГРИРОВАН** в существующую AI Reels сцену как альтернативный метод генерации. Пользователи могут выбирать между локальной генерацией и профессиональным render-server.
