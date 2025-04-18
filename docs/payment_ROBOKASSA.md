# Процесс принятия оплаты через Telegram-бот

## Обзор

Этот документ описывает процесс создания и отправки счета для оплаты подписки через Telegram-бот. Логика реализована в файле `src/scenes/getRuBillWizard/index.ts`. Ниже приведены ключевые шаги и детали работы кода.

## Шаги процесса оплаты

1. **Инициализация сцены `getRuBillWizard`**

   - Сцена `getRuBillWizard` создается как `WizardScene` из библиотеки `telegraf/scenes`.
   - Она состоит из одного шага `generateInvoiceStep`, который обрабатывает создание счета.

2. **Получение данных о подписке**

   - Функция `generateInvoiceStep` получает данные о выбранной подписке из сессии пользователя (`ctx.session.selectedPayment`).
   - Определяется сумма платежа и количество звезд в зависимости от типа подписки:
     - Для `neurophoto` (НейроФото): сумма = 1110 рублей, звезды = 476.
     - Для `neurobase` (НейроБаза): сумма = 2999 рублей, звезды = 1303.

3. **Генерация уникального ID счета**

   - Генерируется случайный идентификатор счета (`invId`) с помощью `Math.floor(Math.random() * 1000000)`.

4. **Создание ссылки на оплату**

   - Вызывается функция `getInvoiceId` из модуля `helper`, которая формирует URL для оплаты через Robokassa.
   - Параметры для создания ссылки включают:
     - `merchantLogin` - логин мерчанта.
     - `amount` - сумма платежа.
     - `invId` - идентификатор счета.
     - `description` - описание платежа.
     - `password1` - пароль для подписи запроса.

5. **Сохранение данных о платеже в Supabase**

   - Вызывается функция `setPayments` для сохранения информации о платеже со статусом `PENDING`.
   - Сохраняются данные, такие как:
     - `telegram_id` - ID пользователя в Telegram.
     - `OutSum` - сумма платежа.
     - `InvId` - идентификатор счета.
     - `currency` - валюта (RUB).
     - `stars` - количество звезд.
     - `status` - статус платежа (PENDING).
     - `payment_method` - метод оплаты (Telegram).
     - `subscription` - тип подписки.
     - `bot_name` - имя бота.
     - `language` - язык пользователя.

6. **Отправка сообщения пользователю**

   - Формируется сообщение с информацией о созданном счете.
   - Создается inline-клавиатура с кнопкой, содержащей ссылку на оплату (`url: invoiceURL`).
   - Текст кнопки включает название подписки и сумму (например, "Оплатить НейроФото за 1110 р.").
   - Сообщение отправляется пользователю с форматированием HTML и инструкцией по оплате, а также контактом для поддержки в случае проблем (`@neuro_sage`).

7. **Завершение сцены**

   - После отправки сообщения сцена завершается вызовом `ctx.scene.leave()`.

8. **Обработка ошибок**
   - В случае ошибки при создании счета или сохранении данных пользователю отправляется сообщение об ошибке на соответствующем языке (русском или английском).

## Критические моменты

- **Корректность суммы**: Важно, чтобы суммы для подписок были заданы правильно (1110 рублей для НейроФото и 2999 рублей для НейроБаза).
- **Безопасность данных**: Данные для оплаты (например, `password1`) должны быть защищены и не отображаться в логах в открытом виде.
- **Сохранение платежа**: Сохранение данных в Supabase со статусом `PENDING` необходимо для отслеживания статуса платежа.
- **Пользовательский опыт**: Сообщение с кнопкой оплаты должно быть понятным и содержать прямую ссылку на оплату, чтобы минимизировать действия пользователя.

## Исходный код

Ниже приведен полный код файла `src/scenes/getRuBillWizard/index.ts` для фиксации текущего состояния:

```typescript
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussian } from '@/helpers'
import {
  getInvoiceId,
  merchantLogin,
  password1,
  description,
  subscriptionTitles,
} from './helper'
import { setPayments } from '../../core/supabase'
import { WizardScene } from 'telegraf/scenes'
import { getBotNameByToken } from '@/core'

const generateInvoiceStep = async (ctx: MyContext) => {
  console.log('CASE: generateInvoiceStep')
  const isRu = isRussian(ctx)
  const selectedPayment = ctx.session.selectedPayment

  if (selectedPayment) {
    const email = ctx.session.email
    console.log('Email from session:', email)

    const subscription = selectedPayment.subscription
    let amount: number
    let stars: number
    if (subscription === 'neurophoto') {
      amount = 1110 // Правильная сумма для НейроФото
      stars = 476
    } else if (subscription === 'neurobase') {
      amount = 2999 // Правильная сумма для НейроБаза
      stars = 1303
    }

    try {
      const userId = ctx.from?.id
      console.log('User ID:', userId)

      const invId = Math.floor(Math.random() * 1000000)
      console.log('Generated invoice ID:', invId)

      // Получение invoiceID
      const invoiceURL = await getInvoiceId(
        merchantLogin,
        amount, // Используем исправленную сумму
        invId,
        description,
        password1
      )
      console.log('Invoice URL:', invoiceURL)
      const { bot_name } = getBotNameByToken(ctx.telegram.token)

      try {
        // Сохранение платежа со статусом PENDING
        await setPayments({
          telegram_id: userId.toString(),
          OutSum: amount.toString(),
          InvId: invId.toString(),
          currency: 'RUB',
          stars,
          status: 'PENDING',
          payment_method: 'Telegram',
          subscription: subscription,
          bot_name,
          language: ctx.from?.language_code,
        })
        console.log('Payment saved with status PENDING')
      } catch (error) {
        console.error('Error in setting payments:', error)
        await ctx.reply(
          isRu
            ? `Ошибка при создании платежа. Пожалуйста, попробуйте снова. ${error}`
            : `Error in creating payment. Please try again. ${error}`
        )
      }

      // Отправка сообщения пользователю с ссылкой на оплату
      const inlineKeyboard = [
        [
          {
            text: isRu
              ? `Оплатить ${
                  subscriptionTitles(isRu)[subscription]
                } за ${amount} р.`
              : `Pay for ${
                  subscriptionTitles(isRu)[subscription]
                } for ${amount} RUB.`,
            url: invoiceURL,
          },
        ],
      ]

      await ctx.reply(
        isRu
          ? `<b>💵 Чек создан для подписки ${
              subscriptionTitles(isRu)[subscription]
            }</b>
Нажмите кнопку ниже, чтобы перейти к оплате.

В случае возникновения проблем с оплатой, пожалуйста, свяжитесь с нами @neuro_sage`
          : `<b>💵 Invoice created for subscription ${
              subscriptionTitles(isRu)[subscription]
            }</b>
Click the button below to proceed with payment.

In case of payment issues, please contact us @neuro_sage`,
        {
          reply_markup: {
            inline_keyboard: inlineKeyboard,
          },
          parse_mode: 'HTML',
        }
      )
      console.log('Payment message sent to user with URL button')

      // Завершение сцены
      return ctx.scene.leave()
    } catch (error) {
      console.error('Error in creating invoice:', error)
      await ctx.reply(
        isRu
          ? 'Ошибка при создании чека. Пожалуйста, попробуйте снова.'
          : 'Error creating invoice. Please try again.'
      )
    }
  }
}

export const getRuBillWizard = new WizardScene(
  'getRuBillWizard',
  generateInvoiceStep
)
```

## Заключение

Этот документ фиксирует текущую реализацию процесса оплаты через Telegram-бот. Все суммы, шаги и критические моменты задокументированы для дальнейшего использования и поддержки. Если потребуется внести изменения, этот файл можно будет обновить.

import { MERCHANT_LOGIN, PASSWORD1, RESULT_URL2 } from '@/config'
import { Subscription } from '@/interfaces/supabase.interface'
import { levels } from '@/menu/mainMenu'
import md5 from 'md5'

export const merchantLogin = MERCHANT_LOGIN
export const password1 = PASSWORD1

export const description = 'Покупка звезд'

export const paymentOptions: {
amount: number
stars: string
subscription: Subscription
}[] = [
{ amount: 1999, stars: '1250', subscription: 'neurophoto' },
{ amount: 9999, stars: '1000', subscription: 'neurobase' },
{ amount: 49999, stars: '5000', subscription: 'neuromeeting' },
{ amount: 99999, stars: '7500', subscription: 'neuroblogger' },
// { amount: 120000, stars: '10000', subscription: 'neuromentor' },
]

export const subscriptionTitles = (isRu: boolean) => ({
neurophoto: isRu ? levels[2].title_ru : levels[2].title_en,
neurobase: isRu ? '📚 НейроБаза' : '📚 NeuroBase',
neuromeeting: isRu ? '🧠 НейроВстреча' : '🧠 NeuroMeeting',
neuroblogger: isRu ? '🤖 НейроБлогер' : '🤖 NeuroBlogger',
// neuromentor: isRu ? '🦸🏼‍♂️ НейроМентор' : '🦸🏼‍♂️ NeuroMentor',
})

export const resultUrl2 = RESULT_URL2

export function generateRobokassaUrl(
merchantLogin: string,
outSum: number,
invId: number,
description: string,
password1: string
): string {
const signatureValue = md5(
`${merchantLogin}:${outSum}:${invId}:${encodeURIComponent(
      resultUrl2
    )}:${password1}`
).toUpperCase()
const url = `https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=${merchantLogin}&OutSum=${outSum}&InvId=${invId}&Description=${encodeURIComponent(
    description
  )}&SignatureValue=${signatureValue}&ResultUrl2=${encodeURIComponent(
    resultUrl2
  )}`

return url
}

export async function getInvoiceId(
merchantLogin: string,
outSum: number,
invId: number,
description: string,
password1: string
): Promise<string> {
console.log('Start getInvoiceId rubGetWizard', {
merchantLogin,
outSum,
invId,
description,
password1,
})
try {
const signatureValue = md5(
`${merchantLogin}:${outSum}:${invId}:${password1}`
)
console.log('signatureValue', signatureValue)

    const response = generateRobokassaUrl(
      merchantLogin,
      outSum,
      invId,
      description,
      password1
    )
    console.log('response', response)

    return response

} catch (error) {
console.error('Error in getInvoiceId:', error)
throw error
}
}
