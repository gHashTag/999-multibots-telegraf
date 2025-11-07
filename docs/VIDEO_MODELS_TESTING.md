# 🎬 Тестирование Видео Моделей - Правила и Гайд

## 🎯 Цель

Систематическая проверка всех видео моделей (Text-to-Video и Image-to-Video) для:
- Проверки работоспособности API интеграций
- Верификации webhook callbacks
- Валидации ценообразования
- Документирования фактических результатов

## 📋 ПРАВИЛА ЭКОНОМИИ ТОКЕНОВ

### ⚠️ КРИТИЧЕСКИ ВАЖНО:

1. **НЕ запускать реальные API вызовы без явного запроса пользователя**
2. **ВСЕГДА использовать test mode в первую очередь**
3. **Запускать только ОДНУ модель за раз** (если не указано иное)
4. **Использовать фиксированный промпт для всех тестов** (см. ниже)
5. **Логировать только ключевые метрики**, а не весь response
6. **НЕ делать polling если не требуется немедленный результат**

### 🔧 Стандартный Тестовый Промпт:

```
Уже в эту пятницу, 17 октября, в 11:00 приглашаю вас в Café 13 на бизнес-завтрак IP Business Club.

Я поделюсь своим опытом создания ИИ-агентов — расскажу, как можно просто и быстро создавать приложения и ботов с помощью вайбкодинга, используя обычный язык вместо программирования.

Покажу на реальных примерах, как интегрировать ИИ, находить клиентов и монетизировать эти навыки. Вас ждёт профессиональное сообщество, обмен опытом и нетворкинг.

Оргвзнос: 300 бат. Присоединяйтесь!
```

### 🖼️ Стандартное Тестовое Изображение:

- Изображение профиля пользователя (передается как параметр)
- Должно быть публично доступно по URL
- Рекомендуемый формат: JPEG/PNG
- Размер: ~1-3MB

## 📊 Модели для Тестирования

### Text-to-Video Модели (10 шт):

#### Kie.ai Провайдер (webhook: `/api/kie-ai/callback`):
1. ✅ **veo3_fast** - Veo 3 Fast (40⭐, 8 сек, 720p)
2. ✅ **veo3** - Veo 3 (202⭐, 8 сек, 1080p)
3. ✅ **runway-aleph** - Runway Aleph (182⭐ за 6 сек)

#### Kie.ai Провайдер Sora (webhook: `/api/kie-ai/sora-callback`):
4. ✅ **sora-2** - Sora 2 (2500⭐, 10 сек)
5. ✅ **sora-2-pro** - Sora 2 Pro (3333⭐, 10 сек)

#### Replicate Провайдер (polling):
6. ⏳ **minimax** - Minimax (46⭐)
7. ⏳ **hunyuan-video-fast** - Hunyuan Fast (18⭐)
8. ⏳ **wan-text-to-video** - Wan-2.1 Text (23⭐)
9. ⏳ **wan-2.2-t2v-fast** - WAN 2.2 T2V Fast (12-26⭐)
10. ⏳ **haiper-video-2** - Haiper Video 2 (text)

### Image-to-Video Модели (13 шт):

#### Kie.ai Провайдер (webhook: `/api/kie-ai/callback`):
1. ✅ **veo3_fast** + image - Veo 3 Fast I2V (40⭐, 8 сек)
2. ✅ **runway-aleph** + image - Runway Aleph I2V (182⭐ за 6 сек)

#### Replicate Провайдер (polling):
3. ⏳ **kling-v1.6-pro** - Kling v1.6 Pro (9⭐)
4. ⏳ **kling-v1.6-standard** - Kling v1.6 Standard
5. ⏳ **kling-v2.0** - Kling v2.0
6. ⏳ **kling-v2.1-standard** - Kling v2.1 Standard
7. ⏳ **kling-v2.1-pro** - Kling v2.1 Pro
8. ⏳ **ray-v2** - Ray-v2 (16⭐)
9. ⏳ **wan-image-to-video** - Wan-2.1 I2V (23⭐)
10. ⏳ **wan-2.2-i2v-fast** - WAN 2.2 I2V Fast (11-23⭐)
11. ⏳ **seedance-1-pro** - Seedance Pro (3-15⭐)
12. ⏳ **haiper-video-2** + image - Haiper Video 2 I2V
13. ⏳ **minimax** + image - Minimax I2V

## 🧪 Тестовый Протокол

### Этап 1: Сухая Валидация (БЕЗ API вызовов)

```bash
npm run test:models:validate
```

Проверяет:
- ✅ Наличие всех моделей в конфигурации
- ✅ Корректность ценообразования
- ✅ Правильность webhook URLs
- ✅ Поддерживаемые input types

### Этап 2: Mock Тестирование

```bash
npm run test:models:mock
```

Симулирует API вызовы без реальных запросов:
- ✅ Проверка форматирования запросов
- ✅ Валидация параметров
- ✅ Проверка webhook URL generation
- ✅ Тестирование обработки ответов

### Этап 3: Реальное API Тестирование (ДОРОГО!)

**⚠️ ВНИМАНИЕ: Реальные деньги и токены!**

```bash
# Одна модель за раз
npm run test:model -- --model=veo3_fast --type=text

# С изображением
npm run test:model -- --model=veo3_fast --type=image --image=<URL>

# Только создать задачу (без polling)
npm run test:model -- --model=sora-2 --no-polling
```

## 📈 Метрики для Логирования

### Минимальный набор (для экономии):
- ✅ Model ID
- ✅ Success/Failure status
- ✅ Task ID (если создан)
- ✅ Error message (если есть)
- ✅ Cost (USD + Stars)
- ✅ Processing time

### Полный набор (по запросу):
- Full request payload
- Full response payload
- Webhook callback data
- Video URL
- Video duration
- Quality metrics

## 🔍 Анализ Результатов

### Success Критерии:

**Kie.ai модели (с webhook):**
- ✅ Task создан успешно (HTTP 200, taskId получен)
- ✅ Webhook URL корректный
- ✅ Polling НЕ требуется (полагаемся на webhook)

**Replicate модели (polling):**
- ✅ Job создан (jobId получен)
- ✅ Status проверка работает
- ✅ Video URL получен в течение timeout

**Оба типа:**
- ✅ Стоимость рассчитана правильно
- ✅ Параметры модели корректны
- ✅ Нет критических ошибок

### Failure Критерии:

- ❌ HTTP error (400, 401, 403, 500)
- ❌ Timeout (>5 минут без результата)
- ❌ Content policy violation
- ❌ Webhook URL недоступен
- ❌ Неправильная цена
- ❌ Missing параметры

## 📝 Формат Отчета

```markdown
# Video Model Test Report

**Date**: YYYY-MM-DD HH:mm
**Tester**: Claude/Human
**Environment**: Production/Development

## Text-to-Video Results

| Model | Status | Task ID | Cost | Time | Notes |
|-------|--------|---------|------|------|-------|
| veo3_fast | ✅ | abc123 | 40⭐ | 15s | Webhook received |
| sora-2 | ✅ | def456 | 2500⭐ | 120s | High quality |
| minimax | ❌ | - | - | - | API timeout |

## Image-to-Video Results

| Model | Status | Task ID | Cost | Time | Notes |
|-------|--------|---------|------|------|-------|
| veo3_fast+img | ✅ | ghi789 | 40⭐ | 20s | Good quality |
| kling-v1.6-pro | ⏳ | jkl012 | 9⭐ | - | Pending |

## Issues Found

1. **minimax**: API timeout после 5 минут
2. **kling-v2.0**: Incorrect imageKey parameter

## Recommendations

- Fix minimax timeout handling
- Update kling-v2.0 image parameter format
```

## 🛠️ Команды для Быстрого Тестирования

```bash
# Проверить конфигурацию всех моделей
npm run test:models:config

# Проверить webhook URLs
npm run test:models:webhooks

# Проверить ценообразование
npm run test:models:pricing

# Тест одной модели (с real API)
npm run test:model:single -- veo3_fast

# Batch тест Text-to-Video (БЕЗ real API!)
npm run test:models:text:validate

# Batch тест Image-to-Video (БЕЗ real API!)
npm run test:models:image:validate

# Проверить webhook endpoint доступность
curl -X POST https://three-head-dragon.shop/api/kie-ai/callback \
  -H "Content-Type: application/json" \
  -d '{"taskId":"test","successFlag":1,"resultUrls":["https://example.com/test.mp4"]}'

curl -X POST https://three-head-dragon.shop/api/kie-ai/sora-callback \
  -H "Content-Type: application/json" \
  -d '{"taskId":"test","successFlag":1,"videoUrl":"https://example.com/test.mp4"}'
```

## 🚨 Emergency Recovery

Если тест застрял или потребляет слишком много токенов:

```bash
# Убить все фоновые процессы
pkill -f "video.*test"

# Очистить временные файлы
rm -rf /tmp/video-test-*

# Проверить активные задачи
npm run test:models:active

# Отменить все активные задачи
npm run test:models:cancel-all
```

## 💡 Лучшие Практики

1. **Всегда начинать с validate**, не с real API
2. **Тестировать по одной модели** за раз
3. **Использовать mock mode** для разработки
4. **Логировать минимум** для production
5. **Webhook > Polling** для Kie.ai моделей
6. **Timeout 3 мин** для Sora, 5 мин для остальных
7. **Batch тесты** только для validation, не для real API

## 🔗 Связанные Файлы

- `tests/video-models-test.ts` - Основной тестовый скрипт
- `src/services/videoModels.ts` - Конфигурация моделей
- `src/services/generateTextToVideo.ts` - Генерация видео
- `src/services/video-providers/KieAiProvider.ts` - Kie.ai клиент
- `src/api_server/routes/kie-ai-webhook.routes.ts` - Webhook handlers
- `docs/SORA_WEBHOOK_SETUP.md` - Sora webhook документация

## 📞 Support

При проблемах с тестами:
1. Проверить `.env` конфигурацию (API keys)
2. Проверить webhook URLs доступность
3. Проверить логи: `docker logs 999-multibots | grep VIDEO`
4. Проверить Supabase connections
5. Создать issue с детальным отчетом
