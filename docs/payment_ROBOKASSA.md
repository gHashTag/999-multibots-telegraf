# Процесс оплаты через Telegram-бот

## Основные шаги процесса
1. Инициализация сцены оплаты (PaymentScene)
2. Выбор метода оплаты (звезды/рубли)
3. Генерация счета (Invoice)
4. Сохранение данных о платеже в Supabase
5. Отправка сообщения пользователю с ссылкой на оплату
6. Обработка статуса платежа

## Критические моменты
- Корректность сумм платежей
- Безопасность данных
- Надежность сохранения информации о платеже
- Обработка ошибок

## Технические детали реализации

### 1. Инициализация оплаты
В `paymentScene` происходит выбор способа оплаты:
- Оплата звездами (Telegram Stars)
- Оплата рублями (Robokassa)

### 2. Генерация счета

Для генерации счета Robokassa используется:
```typescript
// Генерация ID счета
const invId = Math.floor(Math.random() * 1000000);
// Получение URL для оплаты
const invoiceURL = await getInvoiceId(
  merchantLogin,
  amount,
  invId,
  description,
  password1
);
```

### 3. Сохранение платежа в базу данных

Для сохранения информации о платеже используется:
```typescript
await setPayments({
  telegram_id: userId.toString(),
  OutSum: amount.toString(),
  InvId: invId.toString(),
  currency: 'RUB',
  stars: stars,
  status: 'PENDING',
  payment_method: 'Robokassa',
  subscription: subscription,
  bot_name: bot_name,
  language: ctx.from?.language_code,
});
```

### 4. Отправка платежной информации пользователю

После генерации счета, пользователю отправляется сообщение с кнопкой для перехода к оплате:
```typescript
await ctx.reply(
  `<b>💵 Чек создан для подписки</b>
  Нажмите кнопку ниже, чтобы перейти к оплате.`,
  {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `Оплатить подписку за ${amount} р.`,
            url: invoiceURL,
          },
        ],
      ],
    },
    parse_mode: 'HTML',
  }
);
```

### 5. Обработка успешной оплаты

После успешной оплаты, платеж обрабатывается:
- Обновляется баланс пользователя
- Обновляется статус платежа в базе данных
- Отправляется уведомление пользователю

## Структура файлов

Ключевые файлы для процесса оплаты:
- `src/scenes/paymentScene/index.ts` - Сцена выбора метода оплаты
- `src/scenes/getRuBillWizard/index.ts` - Генерация счета для оплаты в рублях
- `src/scenes/getRuBillWizard/helper.ts` - Вспомогательные функции для работы с Robokassa
- `src/core/supabase/setPayments.ts` - Сохранение данных о платеже
- `src/core/supabase/updateUserSubscription.ts` - Обновление подписки пользователя
- `src/handlers/paymentHandlers/index.ts` - Обработка успешных платежей 