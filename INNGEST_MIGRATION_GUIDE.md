# 🧪 Руководство по Тестированию Миграции Inngest

**Дата**: 2025-11-02
**Статус**: Готово к тестированию
**Версия**: 1.0

---

## 📋 Что Мигрировано

### ✅ Завершено
1. **Inngest Client** - обновлён для возврата ID событий
2. **Webhook Handler** - создан для получения результатов
3. **neuroPhotoWizardV2** - мигрирован на Inngest
4. **Status Tracking** - добавлен обработчик статуса
5. **Bot Integration** - webhook подключён к боту

### 🔄 В процессе
- Тестирование на staging
- Миграция textToImageWizard

---

## 🚀 Шаги Тестирования

### ШАГ 1: Подготовка Окружения

#### 1.1 Настройка переменных окружения
```bash
# Добавить в .env файл
INNGEST_EVENT_KEY=your_inngest_event_key
BOT_INNGEST_EVENT_KEY=your_inngest_event_key
INNGEST_SIGNING_KEY=your_inngest_signing_key
BOT_INNGEST_SIGNING_KEY=your_inngest_signing_key

# Для тестирования
TEST_BOT_NAME=your_bot_username
USE_INNGEST=true
```

#### 1.2 Проверка зависимостей
```bash
# Установить зависимости
npm install

# Собрать проект
npm run build
```

---

### ШАГ 2: Запуск Автотестов

#### 2.1 Выполнение тестового скрипта
```bash
# Запуск тестов
node test-inngest-migration.js
```

#### 2.2 Ожидаемый результат
```
🚀 Starting Inngest Migration Tests
==================================================
🧪 [TEST 1] Testing Inngest Client...
✅ [TEST 1] Inngest event sent successfully
   Event ID: generation-neuro-image-1234567890-abc123...

🧪 [TEST 2] Testing Webhook Handler...
   Webhook payload: {...}
✅ [TEST 2] Webhook handler structure is valid

🧪 [TEST 3] Testing Bot Integration...
✅ [TEST 3] Bot integration structure is valid

🧪 [TEST 4] Testing NeuroPhoto Scene...
   Scene ID: neuro_photo_v2
   Steps: 3
✅ [TEST 4] NeuroPhoto scene is valid

🧪 [TEST 5] Testing Full Flow Simulation...
   Step 1: User sends prompt...
   Step 2: Bot sends Inngest event...
   Step 3: Inngest processes...
   Step 4: Webhook sends result...
   Step 5: User receives image...
✅ [TEST 5] Full flow simulation passed

==================================================
📊 TEST RESULTS:
==================================================
✅ Passed: 5/5
❌ Failed: 0/5

🎉 All tests passed! Migration is successful!
```

---

### ШАГ 3: Тестирование в Staging

#### 3.1 Запуск бота в development режиме
```bash
# Запуск с тестовым ботом
npm run dev
```

#### 3.2 Тестовые сценарии

**Сценарий 1: Генерация одного изображения**
1. Отправить `/start` боту
2. Выбрать "🧠 Нейрофото V2"
3. Описать желаемое изображение: `"beautiful sunset over mountains"`
4. **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**:
   - Мгновенный ответ: "⏳ Создаю изображение... ID задачи: abc123... Вы получите уведомление когда будет готово!"
   - Inline кнопка "🔄 Проверить статус"

**Сценарий 2: Проверка статуса**
1. Нажать кнопку "🔄 Проверить статус"
2. **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**:
   - Обновление сообщения со статусом
   - Кнопки "🔄 Обновить" и "🏠 Главное меню"

**Сценарий 3: Multi-photo (если применимо)**
1. Загрузить несколько изображений
2. Выбрать количество: "2"
3. Ввести промпт
4. **ОЖИДАЕМЫЙ РЕЗУЛЬТАТ**:
   - "⏳ Создаю 2 изображения..."

#### 3.3 Логи для проверки
```bash
# Проверить логи на наличие:
🖼️ [NEURO-PHOTO-V2] Starting conversation
🤖 [NEURO-PHOTO-V2] Bot determined
🎨 [NEURO-PHOTO-V2] Processing single image
📤 [INNGEST] Sending event: generation/neuro-image
✅ [INNGEST] Event sent: generation-neuro-image-...
🔍 [STATUS] Checking generation status
```

---

### ШАГ 4: Тестирование Webhook

#### 4.1 Симуляция webhook (для разработки)
```bash
# Используя curl
curl -X POST http://localhost:3000/inngest-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "generation-completed",
    "data": {
      "eventId": "test-event-123",
      "status": "completed",
      "userId": "123456789",
      "result": {
        "imageUrl": "https://example.com/test.jpg"
      },
      "metadata": {
        "prompt": "beautiful sunset"
      }
    }
  }'
```

#### 4.2 Ожидаемый результат
- Лог: `📨 [WEBHOOK] Received Inngest webhook`
- Лог: `✅ [GENERATION] Completed`
- Пользователь получает изображение

---

### ШАГ 5: Проверка Fallback (на случай ошибки)

#### 5.1 Тест с неработающим Inngest
```bash
# Отключить Inngest (временно)
USE_INNGEST=false npm run dev
```

#### 5.2 Ожидаемый результат
- Бот должен работать с старой логикой
- Ошибки в логах о недоступности Inngest

---

## 🔍 Критерии Успеха

### ✅ Функциональные тесты
- [ ] Бот запускается без ошибок
- [ ] neuroPhotoWizardV2 работает корректно
- [ ] События отправляются в Inngest
- [ ] Статус трекинг работает
- [ ] Webhook обрабатывает результаты

### ✅ Производительность
- [ ] Время ответа бота: < 100ms (до Inngest)
- [ ] Пользователь получает мгновенную обратную связь
- [ ] Нет блокирующих операций в боте

### ✅ Логирование
- [ ] Все события логируются
- [ ] Ошибки обрабатываются корректно
- [ ] Логи информативны и понятны

---

## 🐛 Известные Проблемы и Решения

### Проблема 1: Inngest не отвечает
**Симптомы**:
- Ошибка: "Failed to send Inngest event"
- Бот зависает

**Решение**:
```javascript
// Добавить таймаут в sendInngestEvent
const response = await Promise.race([
  inngest.send({...}),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), 5000)
  )
])
```

### Проблема 2: Webhook не доставляется
**Симптомы**:
- Событие в Inngest завершено, но пользователь не получает результат

**Решение**:
- Проверить webhook URL: `https://your-domain.com/inngest-webhook`
- Проверить Inngest логи
- Использовать ngrok для локального тестирования

### Проблема 3: Ошибка "Scene is not defined"
**Симптомы**:
- TypeError при запуске бота

**Решение**:
```typescript
// Убедиться что импорт корректен
import { Scenes } from 'telegraf'
```

---

## 📊 Мониторинг в Production

### Метрики для отслеживания
1. **Количество событий в Inngest**
   - Отправлено
   - Обработано
   - Ошибок

2. **Время обработки**
   - Среднее время генерации
   - Время доставки webhook

3. **Ошибки**
   - Ошибки отправки событий
   - Ошибки webhook
   - Ошибки пользователей

### Алерты
- > 5% ошибок генерации
- > 10 секунд среднее время обработки
- Потеря webhook более 1%

---

## 🔄 Откат (Rollback)

Если миграция неудачна, быстрый откат:

### ШАГ 1: Отключить Inngest
```bash
# В .env
USE_INNGEST=false
```

### ШАГ 2: Вернуть старый файл
```bash
mv src/scenes/neuroPhotoWizardV2/index_old.ts src/scenes/neuroPhotoWizardV2/index.ts
npm run build
```

### ШАГ 3: Перезапустить бота
```bash
npm run dev
```

---

## 📞 Поддержка

### Контакты
- **Технический лидер**: [ваше имя]
- **DevOps**: [ваше имя]
- **QA**: [ваше имя]

### Ресурсы
- [Документация Inngest](https://www.inngest.com/docs)
- [Логи проекта](./logs)
- [Known Issues](./KNOWN_ISSUES.md)

---

## ✅ Чек-лист Перед Production

- [ ] Все тесты проходят
- [ ] Staging тестирование завершено
- [ ] Performance тесты пройдены
- [ ] Логирование настроено
- [ ] Мониторинг настроен
- [ ] Fallback работает
- [ ] Команда обучена
- [ ] Документация обновлена
- [ ] Rollback план готов

---

**Удачного тестирования! 🚀**

*Документ обновляется по мере продвижения миграции*
