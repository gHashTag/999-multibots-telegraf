# 🎯 Model Training: План А vs План Б

## 📋 Текущее Состояние

**Проблема**: Тренировка модели не запускается на Replicate
**Причина**: Bot-farm отправляет Inngest события, но нет Inngest server для их обработки

---

## 🅰️ ПЛАН А: Inngest на Bot-Farm (Будущее решение)

**Идея**: Запустить Inngest server на bot-farm (212.86.115.30)

### Преимущества ✅
- Всё на одном сервере (bot-farm)
- Не зависим от внешнего ai-server
- Проще поддерживать и мониторить
- Меньше network latency

### Недостатки ❌
- Требует настройки Inngest server на bot-farm
- Нужно настроить webhook endpoints
- Больше нагрузки на bot-farm сервер

### Архитектура План А
```
User → Bot-Farm → Inngest Server (bot-farm) → Replicate
                          ↓
                   Inngest Functions
                   (выполняются локально)
```

### Реализация План А

#### 1. Установить Inngest Dev Server на bot-farm:
```bash
ssh root@212.86.115.30
cd /root/bot-farm
npm install -g inngest-cli
```

#### 2. Создать systemd service для Inngest:
```bash
# /etc/systemd/system/inngest.service
[Unit]
Description=Inngest Dev Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/bot-farm
ExecStart=/usr/local/bin/inngest dev --port 8288
Restart=always
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
```

#### 3. Настроить Nginx для Inngest:
```nginx
# В /etc/nginx/sites-available/999-agents.site
location /api/inngest {
    proxy_pass http://localhost:8288;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

#### 4. Функции уже готовы:
- ✅ `src/inngest_app/functions/generateModelTrainingFunction.ts`
- ✅ `src/inngest_app/client.ts`

---

## 🅱️ ПЛАН Б: Через AI-Server (Текущее решение)

**Идея**: Использовать проверенную схему через ai-server

### Преимущества ✅
- Уже работает и проверено
- Ai-server имеет готовый Inngest server
- Не требует изменений инфраструктуры bot-farm
- Webhook от Replicate уже настроен

### Недостатки ❌
- Зависимость от внешнего сервера (ai-server)
- Дополнительный network hop
- Сложнее отлаживать (логи на двух серверах)

### Архитектура План Б
```
User → Bot-Farm → HTTP POST → AI-Server → Replicate
                                     ↓
                              Inngest Server
                              (уже работает)
```

### Реализация План Б

#### Используем существующую функцию:
```typescript
// src/scenes/uploadTrainFluxModelScene/index.ts
import { createModelTraining } from '@/services/createModelTraining'

// Отправляем через ai-server HTTP endpoint
const response = await createModelTraining({
  filePath: zipPath,
  triggerWord,
  modelName: ctx.session.modelName,
  steps: ctx.session.steps,
  telegram_id: ctx.session.targetUserId.toString(),
  is_ru: isRu,
  botName: ctx.botInfo?.username,
  gender: gender,
}, ctx)
```

#### На ai-server уже есть:
1. ✅ Inngest server (`inngest-sdk-server.js`)
2. ✅ Функция `generateModelTraining` слушает `model/training.start`
3. ✅ Webhook endpoint `/webhooks/replicate`
4. ✅ Уведомления в Telegram

---

## 🚀 Рекомендация

**Текущий момент**: Используем **План Б** (через ai-server)
- Быстро развернуть
- Проверенное решение
- Работает немедленно

**Будущее**: Мигрировать на **План А** (Inngest на bot-farm)
- Когда будет время на настройку
- Более надежная архитектура
- Всё в одном месте

---

## 📊 Сравнительная Таблица

| Критерий | План А (Bot-Farm) | План Б (AI-Server) |
|----------|------------------|-------------------|
| **Сложность настройки** | Высокая | Низкая |
| **Время развертывания** | 2-3 часа | 5 минут |
| **Надежность** | Высокая | Средняя |
| **Зависимости** | Нет | Ai-server |
| **Мониторинг** | Проще | Сложнее |
| **Network latency** | Минимальная | Средняя |
| **Текущий статус** | Не реализовано | ✅ Работает |

---

## 🔄 Переключение между планами

### Активировать План Б (текущий):
```typescript
// src/scenes/uploadTrainFluxModelScene/index.ts
import { createModelTraining } from '@/services/createModelTraining'
await createModelTraining({...}, ctx)
```

### Активировать План А (будущее):
```typescript
// src/scenes/uploadTrainFluxModelScene/index.ts
import { inngest } from '@/inngest_app/client'
await inngest.send({
  name: 'model/training.start',
  data: {...}
})
```

---

**Создано**: 2025-10-24
**Статус**: План Б активен, План А в разработке
