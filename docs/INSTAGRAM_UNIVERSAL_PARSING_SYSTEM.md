# 🔍 Универсальная система парсинга Instagram - Полная документация

## 📋 Обзор системы

**Стек:** Node.js + Express + Inngest + PostgreSQL + Instagram API  
**Принцип:** Универсальный алгоритм парсинга для любых пользователей с подписками на мониторинг конкурентов

---

## 🎯 Основные компоненты

### 1. **Frontend API Endpoints**

#### Подписки на конкурентов
- `GET /api/competitor-subscriptions` - Получение подписок пользователя
- `POST /api/competitor-subscriptions` - Создание подписки (лимит: 10 активных)  
- `PUT /api/competitor-subscriptions/:id` - Обновление параметров подписки
- `DELETE /api/competitor-subscriptions/:id` - Удаление подписки
- `GET /api/competitor-subscriptions/:id` - Получение отдельной подписки

### 2. **Inngest функции** (на сервере)
- `instagramScraperV2` - Основной парсер похожих пользователей
- `competitorAutoParser` - Автоматический мониторинг (cron: каждые 24 часа в 08:00 UTC)
- `createInstagramUser` - Ручное создание пользователя в БД

### 3. **База данных PostgreSQL**
- `instagram_similar_users` - Найденные похожие пользователи
- `instagram_user_reels` - Рилсы пользователей с аналитикой
- `competitor_subscriptions` - Подписки на мониторинг
- `projects` - Проекты пользователей

---

## 🔌 API Reference

### **Параметры instagramScraperV2**
```typescript
{
  username_or_id: "target_user",     // обязательно
  project_id: 123,                   // обязательно
  max_users: 50,                     // 1-100, по умолчанию 50
  max_reels_per_user: 50,           // 1-200, по умолчанию 50
  scrape_reels: false,              // по умолчанию false
  requester_telegram_id: "user123", // обязательно
  bot_name: "your_bot"              // опционально
}
```

### **Создание подписки**
```typescript
POST /api/competitor-subscriptions
{
  user_telegram_id: "user123",
  bot_name: "your_bot",
  competitor_username: "competitor1",
  max_reels: 10,                    // 1-50
  min_views: 1000,                  // минимальные просмотры
  max_age_days: 7,                  // 1-30 дней
  delivery_format: "digest"         // digest/individual/archive
}
```

### **Ответ API**
```typescript
{
  success: true,
  subscriptions?: CompetitorSubscription[],
  subscription?: CompetitorSubscription,
  total_count?: number,
  active_count?: number,
  message?: string,
  error?: string
}
```

---

## 📊 Структура данных

### **InstagramUser**
```typescript
interface InstagramUser {
  id: string
  username: string
  full_name: string
  followers_count: number
  following_count: number
  media_count: number
  is_verified: boolean
  is_private: boolean
  profile_pic_url?: string
  bio?: string
  external_url?: string
  category?: string
  is_business_account?: boolean
}
```

### **CompetitorSubscription**
```typescript
interface CompetitorSubscription {
  id: string
  user_telegram_id: string
  bot_name: string
  competitor_username: string
  max_reels: number              // 1-50
  min_views: number              // минимальные просмотры
  max_age_days: number           // 1-30 дней
  delivery_format: 'digest' | 'individual' | 'archive'
  is_active: boolean
  created_at: Date
  updated_at: Date
  last_delivery?: Date
}
```

### **InstagramReel**
```typescript
interface InstagramReel {
  id: string
  shortcode: string
  user_id: string
  caption?: string
  media_url: string
  thumbnail_url?: string
  video_duration?: number
  view_count?: number
  like_count?: number
  comment_count?: number
  created_at: Date
  hashtags?: string[]
  mentions?: string[]
}
```

---

## ⚙️ Универсальный алгоритм парсинга

### **Этапы обработки:**
1. **Zod валидация** → Проверка входных параметров
2. **Проверка project_id** → Существование в БД
3. **Instagram API** → Запрос с retry логикой + rate limiting
4. **Валидация данных** → Zod схемы для очистки данных
5. **Сохранение БД** → ON CONFLICT обработка дубликатов
6. **Парсинг рилсов** → Опционально для каждого пользователя (до 200 рилсов)
7. **Генерация отчетов** → HTML/Excel/ZIP архив
8. **Telegram уведомления** → Отправка результатов пользователю

### **Обработка ошибок:**
- **Rate limiting (429)** → Автоматический retry с экспоненциальной задержкой
- **Валидация ошибок** → Детальное описание через Zod
- **БД транзакции** → Rollback при ошибках
- **Сетевые ошибки** → Повтор запросов с backoff стратегией

---

## 🎨 Frontend интеграция

### **Универсальная форма парсинга**
```javascript
const ParsingForm = {
  targetUsername: { 
    required: true, 
    validation: /^[a-zA-Z0-9._]{1,30}$/ 
  },
  projectId: { 
    required: true, 
    type: "number", 
    min: 1 
  },
  maxUsers: { 
    type: "number", 
    min: 1, 
    max: 100, 
    default: 50 
  },
  scrapeReels: { 
    type: "boolean", 
    default: false 
  },
  maxReelsPerUser: { 
    type: "number", 
    min: 1, 
    max: 200, 
    default: 50 
  }
}
```

### **Управление подписками**
```javascript
const SubscriptionManager = {
  list: () => fetch('/api/competitor-subscriptions?user_telegram_id=X&bot_name=Y'),
  create: (data) => fetch('/api/competitor-subscriptions', { 
    method: 'POST', 
    body: JSON.stringify(data) 
  }),
  update: (id, data) => fetch(`/api/competitor-subscriptions/${id}?user_telegram_id=X&bot_name=Y`, { 
    method: 'PUT', 
    body: JSON.stringify(data) 
  }),
  delete: (id) => fetch(`/api/competitor-subscriptions/${id}?user_telegram_id=X&bot_name=Y`, { 
    method: 'DELETE' 
  }),
  maxActive: 10 // лимит активных подписок
}
```

---

## 🔒 Валидация и безопасность

### **Zod схемы валидации**
```typescript
// Создание подписки
export const CreateSubscriptionSchema = z.object({
  user_telegram_id: z.string().min(1),
  bot_name: z.string().min(1),
  competitor_username: z.string()
    .regex(/^[a-zA-Z0-9._]{1,30}$/, 'Invalid Instagram username'),
  max_reels: z.number().int().min(1).max(50),
  min_views: z.number().int().min(0),
  max_age_days: z.number().int().min(1).max(30),
  delivery_format: z.enum(['digest', 'individual', 'archive'])
})
```

### **Rate Limiting**
- **100 запросов/час** на пользователя
- **10 одновременных** задач парсинга
- **Кеширование результатов:** 1 час
- **Лимит подписок:** 10 активных на пользователя

### **Валидация входных данных**
```javascript
// Username валидация
const validateUsername = (username) => 
  /^[a-zA-Z0-9._]{1,30}$/.test(username)

// Project ID валидация
const validateProjectId = (id) => 
  Number.isInteger(id) && id > 0

// Subscription лимиты
const validateSubscriptionLimits = {
  maxReels: (count) => count >= 1 && count <= 50,
  minViews: (count) => count >= 0,
  maxAgeDays: (days) => days >= 1 && days <= 30
}
```

---

## 🚀 Instagram API интеграция

### **RapidAPI конфигурация**
```javascript
const RAPIDAPI_CONFIG = {
  host: 'real-time-instagram-scraper-api1.p.rapidapi.com',
  endpoints: {
    similarUsers: '/v1/similar_users_v2',
    userReels: '/v1/user_reels'
  },
  headers: {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY,
    'X-RapidAPI-Host': 'real-time-instagram-scraper-api1.p.rapidapi.com'
  }
}
```

### **Retry логика**
```javascript
const retryWithBackoff = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000) // Экспоненциальная задержка
        continue
      }
      throw error
    }
  }
}
```

---

## 📱 Telegram Bot интеграция

### **Уведомления о завершении парсинга**
```typescript
interface InstagramParsingResult {
  projectName: string
  targetUsername: string
  competitorsFound: number
  reelsFound?: number
  reportUrls?: {
    html?: string
    excel?: string
    archive?: string
  }
  processingTimeMs: number
  success: boolean
  error?: string
}
```

### **Форматы доставки подписок**
- **digest** - Сводка с топ рилсами в одном сообщении
- **individual** - Каждый рилс отдельным сообщением (макс. 10)
- **archive** - ZIP архив с метаданными, превью и отчетами

---

## 🗄️ База данных

### **Основные таблицы**
```sql
-- Найденные пользователи Instagram
CREATE TABLE instagram_similar_users (
  id SERIAL PRIMARY KEY,
  instagram_user_id VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  followers_count INTEGER DEFAULT 0,
  similarity_score DECIMAL(5,2),
  project_id INTEGER NOT NULL,
  target_username VARCHAR(255) NOT NULL,
  analysis_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(instagram_user_id, project_id)
);

-- Рилсы пользователей
CREATE TABLE instagram_user_reels (
  id SERIAL PRIMARY KEY,
  reel_id VARCHAR(255) NOT NULL,
  shortcode VARCHAR(255) NOT NULL,
  instagram_user_id VARCHAR(255) NOT NULL,
  view_count BIGINT,
  like_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  project_id INTEGER NOT NULL,
  UNIQUE(reel_id, project_id)
);

-- Подписки на мониторинг
CREATE TABLE competitor_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_telegram_id VARCHAR(255) NOT NULL,
  bot_name VARCHAR(255) NOT NULL,
  competitor_username VARCHAR(255) NOT NULL,
  max_reels INTEGER CHECK (max_reels >= 1 AND max_reels <= 50),
  min_views INTEGER CHECK (min_views >= 0),
  max_age_days INTEGER CHECK (max_age_days >= 1 AND max_age_days <= 30),
  delivery_format VARCHAR(50) CHECK (delivery_format IN ('digest', 'individual', 'archive')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### **Аналитические представления**
```sql
-- Аналитика по проектам
CREATE VIEW instagram_project_analytics AS
SELECT 
  p.name as project_name,
  COUNT(DISTINCT isu.instagram_user_id) as total_competitors,
  COUNT(DISTINCT iur.reel_id) as total_reels,
  AVG(isu.followers_count) as avg_followers,
  AVG(isu.similarity_score) as avg_similarity
FROM projects p
LEFT JOIN instagram_similar_users isu ON p.id = isu.project_id
LEFT JOIN instagram_user_reels iur ON p.id = iur.project_id
GROUP BY p.id, p.name;
```

---

## 🧪 Тестирование

### **Автоматический тест API**
```bash
# Запуск полного набора тестов
node scripts/test-instagram-api.js

# Тестирование отдельных endpoint'ов
npm run test:instagram-api
```

### **Тестовые сценарии**
1. **Health Check** - Проверка работоспособности сервера
2. **CRUD операции** - Создание, чтение, обновление, удаление подписок
3. **Валидация** - Некорректные данные и ограничения
4. **Авторизация** - Доступ только к своим подпискам
5. **Лимиты** - Ограничение на 10 активных подписок

---

## 📈 Мониторинг и аналитика

### **Ключевые метрики**
- **Время обработки** парсинга (цель: < 5 минут)
- **Success rate** API запросов (цель: > 95%)
- **Количество найденных** конкурентов на запрос
- **Активные подписки** пользователей
- **Rate limit hits** и повторные запросы

### **Логирование**
```typescript
logger.info('[Instagram API] Operation completed', {
  operation: 'create_subscription',
  userTelegramId: 'user123',
  competitorUsername: 'competitor1',
  processingTimeMs: 1500,
  success: true
})
```

---

## 🚀 Развертывание

### **Environment Variables**
```bash
# Instagram API
RAPIDAPI_KEY=your_rapidapi_key_here

# Database
NEON_DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Inngest
INNGEST_EVENT_KEY=your_inngest_key_for_production

# Server
NODE_ENV=production
PORT=2999
```

### **Скрипты развертывания**
```bash
# Создание таблиц БД
psql $DATABASE_URL -f scripts/database/instagram_tables.sql

# Запуск API сервера
npm run build:prod
npm start

# Проверка интеграции
npm run test:instagram-api
```

---

## 📚 Примеры использования

### **Создание подписки через curl**
```bash
curl -X POST "http://localhost:2999/api/competitor-subscriptions" \
  -H "Content-Type: application/json" \
  -d '{
    "user_telegram_id": "123456789",
    "bot_name": "my_bot",
    "competitor_username": "neuro_sage",
    "max_reels": 15,
    "min_views": 5000,
    "max_age_days": 14,
    "delivery_format": "digest"
  }'
```

### **Интеграция в React/Vue/Angular**
```javascript
// React Hook для управления подписками
const useInstagramSubscriptions = (userTelegramId, botName) => {
  const [subscriptions, setSubscriptions] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchSubscriptions = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/competitor-subscriptions?user_telegram_id=${userTelegramId}&bot_name=${botName}`
      )
      const data = await response.json()
      setSubscriptions(data.subscriptions || [])
    } catch (error) {
      console.error('Failed to fetch subscriptions:', error)
    } finally {
      setLoading(false)
    }
  }

  const createSubscription = async (subscriptionData) => {
    const response = await fetch('/api/competitor-subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_telegram_id: userTelegramId,
        bot_name: botName,
        ...subscriptionData
      })
    })
    
    if (response.ok) {
      fetchSubscriptions() // Refresh list
      return response.json()
    }
    throw new Error('Failed to create subscription')
  }

  return { subscriptions, loading, fetchSubscriptions, createSubscription }
}
```

---

## ✅ Готовые возможности

- ✅ **Универсальный парсинг** Instagram для любых аккаунтов
- ✅ **CRUD API** для подписок на конкурентов  
- ✅ **Zod валидация** всех входных данных
- ✅ **PostgreSQL** с оптимизированными схемами и индексами
- ✅ **Rate limiting** и обработка ошибок
- ✅ **Telegram уведомления** с мультиязычностью
- ✅ **HTML/Excel отчеты** с ZIP архивами
- ✅ **Автоматические тесты** API endpoints
- ✅ **Inngest интеграция** для фонового парсинга
- ✅ **Аналитические представления** и функции БД

**Система полностью готова к использованию в production! 🎯**

---

*Создано НейроКодером 🤖 | Om Shanti 🙏*