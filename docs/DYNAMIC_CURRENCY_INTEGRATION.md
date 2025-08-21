# 💱 Интеграция динамического курса USDT/RUB

## 📋 Обзор

Система динамического курса автоматически получает актуальные курсы USDT/RUB через Bybit API и централизованно управляет всеми расчетами в рублях по всему проекту.

## 🏗️ Архитектура

### Основные компоненты:

1. **Модуль получения курса** (`src/modules/currency-rate/`)
   - Получение курса через Bybit API
   - Кэширование на 5 минут
   - Fallback на статический курс при ошибках

2. **Централизованная конфигурация** (`src/config/unified-pricing.config.ts`)
   - Единая точка управления ценообразованием
   - Асинхронные функции для динамических расчетов
   - Обратная совместимость со статическими константами

3. **Обновленные модули:**
   - `src/price/helpers/rubTopUpOptions.ts` - динамические пакеты пополнения
   - `src/price/priceCalculator.ts` - расчет стоимости с актуальным курсом
   - `src/handlers/handleSelectRubAmount/` - отображение актуальных цен
   - `src/scenes/rublePaymentScene.ts` - обработка платежей с динамическим курсом

## 🚀 Использование

### Получение актуального курса

```typescript
import { getCurrentRate } from '@/modules/currency-rate'
import { getUsdToRubRate } from '@/config/unified-pricing.config'

// Прямое обращение к Bybit API
const rate = await getCurrentRate()

// Через централизованную конфигурацию (рекомендуется)
const unifiedRate = await getUsdToRubRate()
```

### Конвертация валют

```typescript
import { 
  starsToRUBAsync, 
  rubToStarsAsync 
} from '@/config/unified-pricing.config'

// Звезды в рубли с актуальным курсом
const rubles = await starsToRUBAsync(1000)

// Рубли в звезды с актуальным курсом  
const stars = await rubToStarsAsync(2000)
```

### Динамические пакеты пополнения

```typescript
import { 
  getDynamicRubTopUpOptions 
} from '@/price/helpers/rubTopUpOptions'

// Получить пакеты с актуальным курсом
const packages = await getDynamicRubTopUpOptions()
console.log(packages) // [{ amountRub: 500, stars: 245 }, ...]
```

### Расчет стоимости услуг

```typescript
import { 
  calculateCostDynamic,
  getStepCostInRubles 
} from '@/price/priceCalculator'

// Стоимость шага с актуальным курсом
const stepCost = await getStepCostInRubles()

// Полный расчет стоимости
const cost = await calculateCostDynamic(100, 'v1')
console.log(cost) // { steps: 100, stars: 22, dollars: 0.35, rubles: 29.8 }
```

## 📊 API Bybit

### Endpoint
```
https://www.bybit.com/x-api/fiat/public/channel/payment-list?crypto=USDT&fiat=RUB
```

### Структура ответа
```json
{
  "ret_code": 0,
  "ret_msg": "OK", 
  "result": {
    "items": [
      {
        "fiatUnit": "RUB",
        "price": "95.50",
        "payment": "Банковская карта",
        "currencyUnit": "USDT"
      }
    ]
  }
}
```

### Логика выбора курса
- Берется **минимальная** цена из всех доступных предложений
- Округляется до целого числа
- При ошибках используется fallback значение (85 RUB/USD)

## ⚡ Кэширование

- **TTL**: 5 минут (300000ms)
- **Стратегия**: В памяти приложения
- **Fallback**: Статический курс 85 RUB/USD
- **Логирование**: Все операции логируются

## 🔄 Миграция с статических константов

### Было (статическое)
```typescript
const USD_TO_RUB_RATE = 85
const rubles = stars * 0.016 * USD_TO_RUB_RATE
```

### Стало (динамическое)
```typescript
const rate = await getUsdToRubRate()
const rubles = await starsToRUBAsync(stars)
```

### Обратная совместимость
Старые функции помечены как `@deprecated`, но продолжают работать со статическим курсом 85 RUB/USD.

## 🧪 Тестирование

### Запуск тестов
```bash
# Тест динамического курса
npx tsx scripts/test-dynamic-rate.ts

# Стандартные тесты
npm test
```

### Тестовая утилита
Показывает:
- Сравнение статического и динамического курса
- Разницу в конвертации звезд/рублей
- Обновленные пакеты пополнения
- Расчет стоимости услуг

## 📈 Преимущества

### Для пользователей:
- **Справедливые цены** по актуальному курсу валют
- **Больше звезд** за те же деньги при падении курса доллара
- **Прозрачность** ценообразования

### Для бизнеса:
- **Автоматическая адаптация** к колебаниям курса
- **Снижение валютных рисков**
- **Конкурентоспособные цены**

### Для разработки:
- **Централизованное управление** ценами
- **Легкое добавление** новых валютных пар
- **Надежность** с fallback механизмами

## ⚠️ Важные замечания

1. **Производительность**: Динамический курс кэшируется на 5 минут
2. **Надежность**: Всегда есть fallback на статический курс
3. **Логирование**: Все операции с курсами логируются для мониторинга
4. **Безопасность**: API Bybit публичное, не требует аутентификации

## 🔧 Конфигурация

### Основные параметры
```typescript
// В src/modules/currency-rate/index.ts
const CACHE_TTL = 300000        // 5 минут
const DEFAULT_RATE = 85         // Fallback курс
const BYBIT_API_URL = '...'     // URL API

// В src/config/unified-pricing.config.ts  
const STAR_COST_USD = 0.016     // Стоимость звезды в USD
const MARKUP_MULTIPLIER = 1.5   // Наценка 50%
```

### Изменение настроек
Все настройки centralized в `unified-pricing.config.ts` - единой точке конфигурации ценообразования.

## 🚀 Развертывание

### Чеклист
- [ ] Проверить доступность API Bybit в production
- [ ] Настроить мониторинг курсов валют
- [ ] Проверить логирование операций
- [ ] Протестировать fallback механизмы
- [ ] Уведомить команду об изменениях

### Мониторинг
- Логи получения курса: `💰 Курс USDT/RUB получен`
- Ошибки API: `❌ Ошибка получения курса USDT/RUB`
- Использование кэша: `💰 Курс USDT/RUB получен из кеша`

---

**Дата создания:** 21.08.2025  
**Версия:** 1.0  
**Автор:** AI Assistant для централизации рублевого ценообразования