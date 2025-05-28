# Руководство по промо-ссылкам НейроВидео и НейроФото

## 🎯 Обзор

Система промо-ссылок позволяет предоставлять пользователям бесплатные звезды, эквивалентные подпискам НейроВидео или НейроФото. Каждый пользователь может получить каждый тип промо-бонуса только один раз.

## 🔗 Доступные промо-ссылки

### 1. НейроВидео промо-ссылка
**URL:** `https://t.me/MetaMuse_Manifest_bot?start=neurovideo`
**Альтернативный URL:** `https://t.me/MetaMuse_Manifest_bot?start=promo%20neurovideo`

**Что получает пользователь:**
- 🎬 **1303 звезды** (эквивалент подписки НейроВидео за 2999 руб.)
- ✅ **Автоматическая активация** подписки НейроВидео
- 🎥 **Доступ к генерации видео** через нейросети

### 2. НейроФото промо-ссылка
**URL:** `https://t.me/MetaMuse_Manifest_bot?start=neurophoto`
**Альтернативный URL:** `https://t.me/MetaMuse_Manifest_bot?start=promo%20neurophoto`

**Что получает пользователь:**
- 📸 **476 звезд** (эквивалент подписки НейроФото за 1110 руб.)
- ✅ **Автоматическая активация** подписки НейроФото
- 🖼️ **Доступ к генерации фото** через нейросети

### 3. Базовая промо-ссылка
**URL:** `https://t.me/MetaMuse_Manifest_bot?start=promo`

**Что получает пользователь:**
- 🎁 **476 звезд** (эквивалент подписки НейроФото)
- ✅ **Автоматическая активация** подписки НейроФото

## 📱 Поддерживаемые команды

Система распознает следующие команды:

| Команда | Описание | Тип промо |
|---------|----------|-----------|
| `/start neurovideo` | Прямая команда НейроВидео | `neurovideo_promo` |
| `/start neurophoto` | Прямая команда НейроФото | `neurophoto_promo` |
| `/start promo neurovideo` | Промо НейроВидео | `neurovideo_promo` |
| `/start promo neurophoto` | Промо НейроФото | `neurophoto_promo` |
| `/start promo video` | Промо видео (legacy) | `neurovideo_promo` |
| `/start promo photo` | Промо фото (legacy) | `neurophoto_promo` |
| `/start promo` | Базовое промо | `welcome_bonus` |

## 🌍 Локализация

Система автоматически определяет язык пользователя и показывает соответствующие сообщения:

### Русский язык (`language_code === 'ru'`)
- **НейроВидео:** "🎬 НейроВидео промо-бонус получен! Вы получили 1303 бесплатных звезд и доступ к генерации видео!"
- **НейроФото:** "📸 НейроФото промо-бонус получен! Вы получили 476 бесплатных звезд и доступ к генерации фото!"
- **Уже получен:** "🎬 Вы уже получили промо-бонус НейроВидео!"

### Английский язык (`language_code !== 'ru'`)
- **NeuroVideo:** "🎬 NeuroVideo promo bonus received! You got 1303 free stars and access to video generation!"
- **NeuroPhoto:** "📸 NeuroPhoto promo bonus received! You got 476 free stars and access to photo generation!"
- **Already received:** "🎬 You have already received the NeuroVideo promotional bonus!"

## 🔄 Логика работы

### 1. Обнаружение промо-ссылки
```typescript
// Система проверяет сообщение на наличие промо-команд
const promoInfo = extractPromoFromContext(ctx)
if (promoInfo?.isPromo) {
  // Обрабатываем промо-ссылку
}
```

### 2. Проверка дубликатов
```typescript
// Проверяем, получал ли пользователь этот тип промо ранее
const alreadyReceived = await hasReceivedPromo(telegram_id, promoType)
if (alreadyReceived) {
  // Показываем сообщение о том, что промо уже получен
}
```

### 3. Выделение звезд
```typescript
// Добавляем звезды с метаданными промо
await directPaymentProcessor({
  telegram_id,
  amount: starAmount,
  type: PaymentType.MONEY_INCOME,
  description: `🎁 Promo bonus: ${starAmount} stars`,
  metadata: {
    is_promo: true,
    promo_type: promoConfig.promoType,
    subscription_tier_equivalent: promoConfig.defaultTier,
    stars_granted: starAmount,
    category: 'BONUS',
  },
})
```

### 4. Автоактивация подписки
```typescript
// Если у пользователя достаточно звезд, автоматически активируем подписку
if (config.autoActivateSubscription && userBalance >= requiredStars) {
  await directPaymentProcessor({
    // Создаем запись о подписке
    subscription_type: tier,
    metadata: { is_auto_activation: true }
  })
}
```

## 📊 Отслеживание в базе данных

### Таблица `payments_v2`
Все промо-операции сохраняются с метаданными:

```json
{
  "type": "MONEY_INCOME",
  "category": "BONUS",
  "metadata": {
    "is_promo": true,
    "promo_type": "neurovideo_promo",
    "subscription_tier_equivalent": "NEUROVIDEO",
    "stars_granted": 1303,
    "allocation_timestamp": "2025-05-28T15:30:00.000Z"
  }
}
```

### Автоактивация подписки
```json
{
  "type": "MONEY_OUTCOME",
  "category": "REAL",
  "subscription_type": "NEUROVIDEO",
  "metadata": {
    "is_auto_activation": true,
    "subscription_type": "NEUROVIDEO",
    "promo_activation": true,
    "activation_timestamp": "2025-05-28T15:30:01.000Z"
  }
}
```

## 🎯 Примеры использования

### Маркетинговые кампании
1. **Реклама НейроВидео:** Используйте `https://t.me/MetaMuse_Manifest_bot?start=neurovideo`
2. **Реклама НейроФото:** Используйте `https://t.me/MetaMuse_Manifest_bot?start=neurophoto`
3. **Общая реклама:** Используйте `https://t.me/MetaMuse_Manifest_bot?start=promo`

### Социальные сети
```
🎬 Попробуйте НейроВидео БЕСПЛАТНО!
Получите 1303 звезды и создавайте видео с ИИ
👉 https://t.me/MetaMuse_Manifest_bot?start=neurovideo

📸 Попробуйте НейроФото БЕСПЛАТНО!
Получите 476 звезд и создавайте фото с ИИ  
👉 https://t.me/MetaMuse_Manifest_bot?start=neurophoto
```

## 🔒 Безопасность

### Предотвращение дубликатов
- ✅ Каждый пользователь может получить каждый тип промо только **один раз**
- ✅ Проверка происходит по `telegram_id` и `promo_type`
- ✅ Система логирует все попытки получения промо

### Отслеживание
- ✅ Все промо-операции помечены `is_promo: true`
- ✅ Категория `BONUS` отличает промо от реальных платежей
- ✅ Подробные метаданные для аналитики

## 📈 Аналитика

### Запросы для анализа промо-активности

```sql
-- Количество полученных промо по типам
SELECT 
  metadata->>'promo_type' as promo_type,
  COUNT(*) as count,
  SUM(stars) as total_stars
FROM payments_v2 
WHERE metadata->>'is_promo' = 'true'
GROUP BY metadata->>'promo_type';

-- Пользователи с автоактивированными подписками
SELECT 
  telegram_id,
  subscription_type,
  payment_date
FROM payments_v2 
WHERE metadata->>'is_auto_activation' = 'true'
ORDER BY payment_date DESC;
```

## 🚀 Готово к использованию!

Система промо-ссылок полностью настроена и готова к использованию. Все ссылки работают для новых и существующих пользователей, с полной поддержкой русского и английского языков. 