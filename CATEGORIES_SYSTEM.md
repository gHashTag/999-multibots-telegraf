# Система категорий транзакций

## Обзор

В системе используется enum `simple_transaction_category` в базе данных PostgreSQL с двумя значениями:

- `REAL` - реальные транзакции (покупки пользователей)
- `BONUS` - бонусные транзакции (промо-коды, компенсации)

## Админские операции

Админские операции **НЕ** имеют отдельной категории в enum. Вместо этого они определяются по:

1. **payment_method = 'Admin'** - основной способ идентификации
2. **description содержит 'Admin balance'** - дополнительный способ

## Структура в коде

### Zod схема
```typescript
export const TransactionCategoryEnum = z.enum(['REAL', 'BONUS'])
export type TransactionCategory = z.infer<typeof TransactionCategoryEnum>
```

### Метаданные баланса
```typescript
type BalanceUpdateMetadata = {
  category?: 'REAL' | 'BONUS' // Только эти две категории
  payment_method?: string     // 'Admin' для админских операций
  // ... другие поля
}
```

## Отчеты и аналитика

В Excel отчетах админские операции определяются по логике:

```typescript
// Определение админских операций
const adminPayments = payments.filter(p => 
  p.payment_method === 'Admin' || 
  (p.description && p.description.includes('Admin balance'))
)
```

### Отображение в отчетах:
- 💎 **Реальные** - category = 'REAL'
- 🎁 **Бонусы** - category = 'BONUS'  
- 👨‍💼 **Админские** - payment_method = 'Admin' или description содержит 'Admin balance'

## Админские команды

### /addbalance
- Использует `payment_method: 'Admin'`
- Категория устанавливается как `'BONUS'`
- Описание содержит "Admin balance"

### Пример использования:
```bash
/addbalance 484954118 1000 Бонус за активность
/addbalance 484954118 -500 Корректировка баланса
```

## Важные моменты

1. **Никогда не используйте category = 'ADMIN'** - такого значения нет в enum базы данных
2. **Админские операции всегда имеют payment_method = 'Admin'**
3. **В отчетах админские операции выделяются отдельно от REAL и BONUS**
4. **Все админские операции логируются с подробной информацией об администраторе**

## Статистика (на момент последней проверки)

- **REAL**: 878 транзакций (87.8%)
- **BONUS**: 122 транзакций (12.2%)
- **Админские** (по payment_method): 4 транзакции 