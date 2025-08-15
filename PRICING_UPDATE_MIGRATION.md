# 📊 ОБНОВЛЕНИЕ СИСТЕМЫ ЦЕНООБРАЗОВАНИЯ - ИНСТРУКЦИЯ ДЛЯ МИГРАЦИИ

## 🎯 ВАЖНО: ВСЕ ИЗМЕНЕНИЯ НЕОБХОДИМО ПРИМЕНИТЬ НА СЕРВЕРЕ

### 📅 Дата изменений: 15.08.2025
### 👤 Инициатор: playra
### 🔄 Версия: 2.0 (обновление курса валют и централизация)

---

## 🚨 КРИТИЧЕСКИЕ ИЗМЕНЕНИЯ

### 1. НОВЫЙ КУРС ВАЛЮТ
- **БЫЛО**: 1 USD = 100 RUB
- **СТАЛО**: 1 USD = 85 RUB
- **Причина**: Приведение к реальному курсу (~80₽/$) с небольшим запасом на волатильность

### 2. БАЗОВЫЕ КОНСТАНТЫ ЦЕНООБРАЗОВАНИЯ
```
STAR_COST_USD = 0.016        // Стоимость 1 звезды в долларах
MARKUP_MULTIPLIER = 1.5      // Наценка 50%
USD_TO_RUB_RATE = 85         // Курс доллара к рублю
```

### 3. ИТОГОВАЯ ЦЕНА ДЛЯ ПОЛЬЗОВАТЕЛЯ
**1 звезда = 2.04 рубля** (рассчитано как: $0.016 × 1.5 × 85₽)

---

## 📁 ИЗМЕНЕННЫЕ ФАЙЛЫ

### 1. `/src/config/unified-pricing.config.ts`
**Полностью заменить содержимое файла:**

```typescript
/**
 * 🕉️ ЕДИНАЯ КОНФИГУРАЦИЯ ЦЕНООБРАЗОВАНИЯ
 *
 * КРИТИЧЕСКИ ВАЖНО: Это ЕДИНСТВЕННОЕ место определения цен в системе!
 * Все расчёты должны использовать эти константы.
 */

// ============================================
// БАЗОВЫЕ КОНСТАНТЫ (НЕ ИЗМЕНЯТЬ БЕЗ СОГЛАСОВАНИЯ!)
// ============================================

/**
 * Стоимость 1 звезды в USD
 * Это базовая единица расчёта во всей системе
 */
export const STAR_COST_USD = 0.016

/**
 * Множитель наценки (markup)
 * 1.5 = 50% наценки на все услуги
 */
export const MARKUP_MULTIPLIER = 1.5

/**
 * Курс USD к RUB
 * Используется для отображения цен в рублях
 * Установлен с небольшим запасом на волатильность (реальный курс ~80)
 */
export const USD_TO_RUB_RATE = 85

// ============================================
// РАСЧЁТНЫЕ ФУНКЦИИ
// ============================================

/**
 * Преобразует базовую стоимость в USD в количество звёзд с учётом наценки
 * @param baseCostUSD - базовая стоимость услуги в USD (себестоимость)
 * @returns количество звёзд (округлённое вниз)
 */
export function usdToStars(baseCostUSD: number): number {
  const starsBeforeMarkup = baseCostUSD / STAR_COST_USD
  const starsWithMarkup = starsBeforeMarkup * MARKUP_MULTIPLIER
  return Math.floor(starsWithMarkup)
}

/**
 * Преобразует количество звёзд в USD
 * @param stars - количество звёзд
 * @returns стоимость в USD
 */
export function starsToUSD(stars: number): number {
  return stars * STAR_COST_USD
}

/**
 * Преобразует количество звёзд в рубли
 * @param stars - количество звёзд
 * @returns стоимость в рублях
 */
export function starsToRUB(stars: number): number {
  const usd = starsToUSD(stars)
  return Math.round(usd * USD_TO_RUB_RATE)
}

/**
 * Преобразует рубли в количество звёзд
 * @param rub - сумма в рублях
 * @returns количество звёзд (округлённое вниз)
 */
export function rubToStars(rub: number): number {
  const usd = rub / USD_TO_RUB_RATE
  return usdToStars(usd)
}

// ============================================
// ДИНАМИЧЕСКОЕ ЦЕНООБРАЗОВАНИЕ ДЛЯ VEO
// ============================================

export interface DynamicVideoPrice {
  pricePerSecondUSD: number
  supportedDurations: number[]
  defaultDuration: number
}

/**
 * Рассчитывает цену в звёздах для видео модели с динамическим ценообразованием
 * @param pricePerSecondUSD - цена за секунду в USD
 * @param duration - длительность в секундах
 * @returns цена в звёздах
 */
export function calculateVideoPriceInStars(
  pricePerSecondUSD: number,
  duration: number
): number {
  const totalCostUSD = pricePerSecondUSD * duration
  return usdToStars(totalCostUSD)
}

// ============================================
// КОНФИГУРАЦИЯ ДИНАМИЧЕСКИХ МОДЕЛЕЙ VEO
// ============================================

export const VEO_MODELS_PRICING: Record<string, DynamicVideoPrice> = {
  'veo-3': {
    pricePerSecondUSD: 0.4,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 8,
  },
  'veo-3-fast': {
    pricePerSecondUSD: 0.3,
    supportedDurations: [2, 4, 6, 8],
    defaultDuration: 4,
  },
  'veo-2': {
    pricePerSecondUSD: 0.3,
    supportedDurations: [4, 6, 8, 10],
    defaultDuration: 8,
  },
}

// ============================================
// ВАЛИДАЦИЯ КОНФИГУРАЦИИ
// ============================================

// Проверяем корректность констант при загрузке модуля
if (STAR_COST_USD <= 0) {
  throw new Error('STAR_COST_USD must be positive')
}

if (MARKUP_MULTIPLIER < 1) {
  throw new Error('MARKUP_MULTIPLIER must be >= 1 (no negative markup allowed)')
}

if (USD_TO_RUB_RATE <= 0) {
  throw new Error('USD_TO_RUB_RATE must be positive')
}

// ============================================
// ЭКСПОРТ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ============================================

// Эти экспорты для обратной совместимости со старым кодом
export const starCost = STAR_COST_USD
export const interestRate = MARKUP_MULTIPLIER
export const rubRate = USD_TO_RUB_RATE

// Для логирования конфигурации
export function logPricingConfig(): void {
  console.log('💰 PRICING CONFIGURATION:')
  console.log(`  1 ⭐ = $${STAR_COST_USD}`)
  console.log(`  Markup: ${((MARKUP_MULTIPLIER - 1) * 100).toFixed(0)}%`)
  console.log(`  1 USD = ${USD_TO_RUB_RATE} RUB`)
  console.log('  VEO Models:')
  Object.entries(VEO_MODELS_PRICING).forEach(([model, config]) => {
    console.log(`    ${model}: $${config.pricePerSecondUSD}/sec`)
  })
}

// ============================================
// ГЕНЕРАЦИЯ ПАКЕТОВ ПОПОЛНЕНИЯ
// ============================================

/**
 * Генерирует пакет пополнения для заданной суммы в рублях
 * @param amountRub - сумма в рублях
 * @returns объект с суммой в рублях и количеством звёзд
 */
export function generateTopUpPackage(amountRub: number): { amountRub: number; stars: number } {
  const stars = rubToStars(amountRub)
  return { amountRub, stars }
}

/**
 * Стандартные пакеты пополнения в рублях
 */
export const STANDARD_RUB_PACKAGES = [10, 500, 1000, 2000, 5000, 10000]

/**
 * Готовые пакеты пополнения
 */
export const TOP_UP_PACKAGES = STANDARD_RUB_PACKAGES.map(generateTopUpPackage)
```

---

### 2. `/src/price/helpers/rubTopUpOptions.ts`
**Полностью заменить содержимое файла:**

```typescript
// Пакеты пополнения в рублях
// Рассчитано по курсу: 1 USD = 85 RUB, 1 звезда = $0.016, наценка 50%
// Цена 1 звезды для пользователя: 0.016 * 1.5 * 85 = 2.04 рубля
export const rubTopUpOptions: { amountRub: number; stars: number }[] = [
  { amountRub: 10, stars: 4 },      // 10₽ / 2.04₽ = 4.9 → 4⭐
  { amountRub: 500, stars: 245 },   // 500₽ / 2.04₽ = 245⭐
  { amountRub: 1000, stars: 490 },  // 1000₽ / 2.04₽ = 490⭐
  { amountRub: 2000, stars: 980 },  // 2000₽ / 2.04₽ = 980⭐
  { amountRub: 5000, stars: 2450 }, // 5000₽ / 2.04₽ = 2450⭐
  { amountRub: 10000, stars: 4901 },// 10000₽ / 2.04₽ = 4901⭐
].filter(option => option.stars > 0) // На всякий случай оставим фильтр

// Проверка, если вдруг все пакеты стали невалидными
if (rubTopUpOptions.length === 0) {
  console.error(
    'Не удалось сформировать пакеты пополнения рублями из фиксированного списка.'
  )
  // Добавляем хотя бы один пакет по умолчанию
  rubTopUpOptions.push({ amountRub: 100, stars: 1 })
}
```

---

### 3. `/src/price/priceCalculator.ts`
**Заменить строки 28-43 (paymentOptionsPlans и paymentOptions):**

```typescript
// У нас два тарифных плана
// Рассчитано по курсу: 1 USD = 85 RUB, 1 звезда = $0.016, наценка 50%
export const paymentOptionsPlans: PaymentOption[] = [
  { amount: 1110, stars: '544', subscription: SubscriptionType.NEUROPHOTO },  // 1110₽ = $13.06 = 544⭐
  { amount: 2999, stars: '1470', subscription: SubscriptionType.NEUROVIDEO }, // 2999₽ = $35.28 = 1470⭐
]

// Пакеты пополнения в рублях
// Рассчитано по курсу: 1 USD = 85 RUB, 1 звезда = $0.016, наценка 50%
export const paymentOptions: PaymentOption[] = [
  { amount: 500, stars: '245' },   // 500₽ / 2.04₽ = 245⭐
  { amount: 1000, stars: '490' },  // 1000₽ / 2.04₽ = 490⭐
  { amount: 2000, stars: '980' },  // 2000₽ / 2.04₽ = 980⭐
  { amount: 5000, stars: '2450' }, // 5000₽ / 2.04₽ = 2450⭐
  { amount: 10000, stars: '4901' },// 10000₽ / 2.04₽ = 4901⭐
  { amount: 1, stars: '1' },       // Админ тест
  { amount: 10, stars: '4' },      // 10₽ / 2.04₽ = 4⭐
]
```

---

### 4. `/src/scenes/textToVideoWizard/index.ts`
**Добавить импорт в начало файла (строка ~21):**
```typescript
import { calculateVideoPriceInStars } from '@/config/unified-pricing.config'
```

**Заменить строку 317:**
```typescript
// БЫЛО:
const finalPrice = Math.floor(((price * 5) / 0.016) * 1.5)
// СТАЛО:
const finalPrice = calculateVideoPriceInStars(price, 5)
```

**Заменить строку 375:**
```typescript
// БЫЛО:
const finalPrice = Math.floor(((price * 5) / 0.016) * 1.5)
// СТАЛО:
const finalPrice = calculateVideoPriceInStars(price, 5)
```

---

### 5. `/src/scenes/imageToVideoWizard/index.ts`
**Добавить импорт в начало файла (строка ~19):**
```typescript
import { calculateVideoPriceInStars } from '@/config/unified-pricing.config'
```

**Заменить строку 212:**
```typescript
// БЫЛО:
const finalPrice = Math.floor(((price * 5) / 0.016) * 1.5)
// СТАЛО:
const finalPrice = calculateVideoPriceInStars(price, 5)
```

**Заменить строку 630:**
```typescript
// БЫЛО:
const finalPrice = Math.floor(((price * 5) / 0.016) * 1.5)
// СТАЛО:
const finalPrice = calculateVideoPriceInStars(price, 5)
```

---

### 6. `/src/scenes/checkBalanceScene.ts`
**Добавить импорт (строка ~20):**
```typescript
import { USD_TO_RUB_RATE } from '@/config/unified-pricing.config'
```

**Заменить строки 39-46:**
```typescript
// БЫЛО:
export const conversionRates: ConversionRates = {
  costPerStepInStars: 0.25,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}

export const conversionRatesV2: ConversionRates = {
  costPerStepInStars: 2.1,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: 100,
}

// СТАЛО:
export const conversionRates: ConversionRates = {
  costPerStepInStars: 0.25,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: USD_TO_RUB_RATE,
}

export const conversionRatesV2: ConversionRates = {
  costPerStepInStars: 2.1,
  costPerStarInDollars: 0.016,
  rublesToDollarsRate: USD_TO_RUB_RATE,
}
```

---

### 7. `/scripts/generate-robokassa-link.ts` (если используется)
**Заменить строку 19:**
```typescript
// БЫЛО:
const testAmount = 100 // 100 рублей для теста
// СТАЛО:
const testAmount = 85 // 85 рублей для теста (1 USD по текущему курсу)
```

---

## 📊 ТАБЛИЦА ИЗМЕНЕНИЙ ЦЕН

### Пакеты пополнения в рублях:

| Сумма (₽) | Старое кол-во ⭐ | Новое кол-во ⭐ | Изменение |
|-----------|------------------|-----------------|-----------|
| 10        | 6                | 4               | -33%      |
| 500       | 217              | 245             | +13%      |
| 1000      | 434              | 490             | +13%      |
| 2000      | 869              | 980             | +13%      |
| 5000      | 2173             | 2450            | +13%      |
| 10000     | 4347             | 4901            | +13%      |

### Подписки:

| Подписка    | Цена (₽) | Старое кол-во ⭐ | Новое кол-во ⭐ | Изменение |
|-------------|----------|------------------|-----------------|-----------|
| NEUROPHOTO  | 1110     | 476              | 544             | +14%      |
| NEUROVIDEO  | 2999     | 1303             | 1470            | +13%      |

---

## 🚀 ПОРЯДОК ПРИМЕНЕНИЯ ИЗМЕНЕНИЙ

1. **Создать резервную копию базы данных**
2. **Создать резервную копию текущего кода**
3. **Применить изменения в файлах** (в порядке, указанном выше)
4. **Выполнить компиляцию TypeScript:**
   ```bash
   npm run build
   # или
   npx tsc
   ```
5. **Протестировать на тестовом сервере** (если есть)
6. **Развернуть на продакшн**
7. **Проверить работоспособность:**
   - Проверить отображение цен в боте
   - Проверить процесс покупки звезд
   - Проверить расчет стоимости услуг

---

## ⚠️ ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **Все цены теперь рассчитываются по формуле:**
   - Цена в звездах = (Сумма в рублях / 85) / 0.016 / 1.5
   - Цена 1 звезды = 2.04 рубля

2. **Централизация:**
   - ВСЕ расчеты должны использовать функции из `unified-pricing.config.ts`
   - НЕ использовать жестко закодированные значения курса или цен

3. **Обратная совместимость:**
   - Сохранены экспорты `starCost`, `interestRate`, `rubRate` для старого кода
   - Они ссылаются на новые константы

4. **Влияние на пользователей:**
   - Пользователи получат БОЛЬШЕ звезд за те же деньги
   - Снижение фактической цены на ~13%

---

## 📞 КОНТАКТЫ ДЛЯ ВОПРОСОВ

При возникновении вопросов или проблем обращаться к инициатору изменений.

---

## ✅ ЧЕКЛИСТ ПРОВЕРКИ ПОСЛЕ МИГРАЦИИ

- [ ] Компиляция TypeScript проходит без ошибок
- [ ] Бот запускается без ошибок
- [ ] Корректно отображаются цены в меню пополнения
- [ ] Работает покупка звезд через Telegram Stars
- [ ] Работает покупка подписок
- [ ] Правильно рассчитывается стоимость услуг
- [ ] Логи не содержат ошибок, связанных с ценообразованием

---

**Дата создания документа:** 15.08.2025
**Версия:** 1.0
**Автор:** AI Assistant для playra
