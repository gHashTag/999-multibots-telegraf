import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import {
  PaymentStatus,
  Currency,
  PaymentType,
} from '@/interfaces/payments.interface'
import { invalidateBalanceCache } from '@/core/supabase/getUserBalance'
import { CreatePaymentV2Schema } from '@/interfaces/zod/payment.zod'
import { calculateServiceCost } from '@/price/helpers/calculateServiceCost'
import { withUserBalanceLock } from './balanceLock'

type BalanceUpdateMetadata = {
  stars?: number
  payment_method?: string
  bot_name?: string
  language?: string
  service_type?: string
  model_name?: string // Название модели (kling_video, haiper_video, neuro_photo и т.д.)
  inv_id?: string
  modePrice?: number
  currentBalance?: number
  paymentAmount?: number
  category?: 'REAL' | 'BONUS' // Категория транзакции
  [key: string]: any
}

/**
 * Создает или обновляет запись о транзакции в таблице payments
 * @returns Promise<boolean> - успешно ли выполнено добавление/обновление записи
 */
/**
 * СОГЛАШЕНИЕ О ЗНАКЕ: направление задаёт `type`, а НЕ знак `amount`.
 *
 * ИСПРАВЛЕНИЕ ПРЕЖНЕГО КОММЕНТАРИЯ. Здесь было написано, что «сумма
 * нормализуется через Math.abs, знак игнорируется полностью». Это неправда:
 * единственный Math.abs в файле стоит ВНУТРИ вызова logger.info (поле лога), а
 * в запись уходят сырые `stars: safeAmount` и `amount: originalAmount`. Знак
 * сохраняется. Комментарий обещал защиту, которой нет, — это хуже, чем никакого
 * комментария, потому что читающий на неё полагается.
 *
 * Почему минус опасен: балансовая функция считает income − outcome, поэтому
 * MONEY_OUTCOME с отрицательными звёздами НАЧИСЛЯЕТ деньги. В payments_v2
 * лежат 114 таких строк (июнь 2025, один аккаунт) — они прибавили 1026 звёзд
 * вместо того, чтобы их списать. Формула восстановлена опытным путём:
 * scripts/probe-balance-formula.cjs, одна кандидат-формула из пяти совпала с
 * настоящей RPC у всех 24 проверенных пользователей.
 *
 * Спасало то, что ветки ниже подменяют сумму на положительную из
 * metadata.modePrice / paymentAmount / stars. Два вызова с минусом
 * (faceSwapWizard, processServiceBalanceOperation) были безопасны СЛУЧАЙНО —
 * из-за этой подмены, а не по замыслу. Оба переведены на положительную сумму.
 *
 * Передавайте ПОЛОЖИТЕЛЬНУЮ сумму и правильный `type`. Отрицательная теперь
 * отклоняется явно — см. проверку после блока подмены.
 */
// Serialized per user by withUserBalanceLock below. The implementation is
// unchanged; the lock closes the read-check-write double-spend race (#999) for
// the single-process case. Do NOT call this directly — use updateUserBalance.
// Exported ONLY for callers that already hold withUserBalanceLock for the same
// telegram_id and must run a check-then-write atomically with the balance (see
// refundUser). Calling this outside the lock reopens the race — use
// updateUserBalance instead.
export const updateUserBalanceUnlocked = async (
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description?: string,
  metadata?: BalanceUpdateMetadata,
  cost_in_stars?: number
): Promise<boolean> => {
  try {
    // Подробное логирование входных данных для диагностики
    logger.info('🔍 Входные данные updateUserBalance:', {
      log_description: 'Input parameters for updateUserBalance',
      telegram_id,
      amount,
      amount_type: typeof amount,
      type,
      operation_description: description,
      metadata: metadata ? JSON.stringify(metadata) : 'нет метаданных',
      cost_in_stars,
    })

    // Проверка входных данных
    if (!telegram_id) {
      logger.error('❌ Пустой telegram_id в updateUserBalance:', {
        description: 'Empty telegram_id in updateUserBalance',
        telegram_id,
      })
      return false
    }

    // Проверка корректности суммы операции
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      logger.error('❌ Некорректная сумма операции:', {
        description: 'Invalid operation amount',
        amount,
        telegram_id,
      })
      return false
    }

    // Безопасно преобразуем amount в число
    let safeAmount = Number(amount)
    const originalAmount = safeAmount // Сохраняем оригинальное значение для логов

    // ЭКСТРЕННОЕ ИСПРАВЛЕНИЕ: Извлечение суммы платежа из описания, если это оплата генерации
    if (
      description &&
      description.includes('Payment for generating') &&
      type === PaymentType.MONEY_OUTCOME
    ) {
      // Извлекаем значение modePrice из metadata
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        logger.info('🎯 ПРИНУДИТЕЛЬНО использую modePrice из metadata:', {
          description: 'FORCED use of modePrice from metadata',
          telegram_id,
          original_amount: safeAmount,
          modePrice: metadata.modePrice,
        })
        safeAmount = metadata.modePrice
      }
      // Или проверяем paymentAmount
      else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        logger.info('🎯 ПРИНУДИТЕЛЬНО использую paymentAmount из metadata:', {
          description: 'FORCED use of paymentAmount from metadata',
          telegram_id,
          original_amount: safeAmount,
          paymentAmount: metadata.paymentAmount,
        })
        safeAmount = metadata.paymentAmount
      } else {
        // Последний шанс - попытка извлечь из описания сумму операции
        logger.warn(
          '⚠️ Не могу определить сумму операции, устанавливаю значение по умолчанию 5:',
          {
            description:
              'Cannot determine operation amount, setting default value of 5',
            telegram_id,
            original_amount: safeAmount,
          }
        )
        safeAmount = 5 // Устанавливаем значение по умолчанию для нейрогенерации
      }
    }
    // Если не нашли в описании, пробуем другие методы определения суммы
    else {
      // --- ЛОГИКА ОПРЕДЕЛЕНИЯ ФАКТИЧЕСКОЙ СУММЫ ТРАНЗАКЦИИ ---

      // Если есть modePrice в metadata - это стоимость операции
      if (metadata?.modePrice && typeof metadata.modePrice === 'number') {
        logger.info('🎯 Найдена стоимость операции в metadata.modePrice:', {
          description: 'Found operation price in metadata.modePrice',
          telegram_id,
          original_amount: safeAmount,
          modePrice: metadata.modePrice,
        })
        safeAmount = metadata.modePrice
      }
      // Если есть paymentAmount в metadata - используем его
      else if (
        metadata?.paymentAmount &&
        typeof metadata.paymentAmount === 'number'
      ) {
        logger.info('🎯 Найдена стоимость операции в metadata.paymentAmount:', {
          description: 'Found operation price in metadata.paymentAmount',
          telegram_id,
          original_amount: safeAmount,
          paymentAmount: metadata.paymentAmount,
        })
        safeAmount = metadata.paymentAmount
      }
      // Если есть stars в metadata - используем их
      else if (metadata?.stars && typeof metadata.stars === 'number') {
        logger.info('🔄 Используем stars из metadata вместо amount:', {
          description: 'Using stars from metadata instead of amount',
          telegram_id,
          original_amount: safeAmount,
          stars_amount: metadata.stars,
        })
        safeAmount = metadata.stars
      }
      // Проверка на ситуацию когда передан баланс вместо суммы операции
      else if (
        metadata?.currentBalance &&
        Math.abs(metadata.currentBalance - safeAmount) < 100 &&
        type === PaymentType.MONEY_OUTCOME
      ) {
        // Вероятно передан новый баланс вместо суммы операции
        // Вычисляем разницу между текущим и новым балансом
        const operationAmount = Math.abs(metadata.currentBalance - safeAmount)
        logger.info('🔎 Определена сумма операции по разнице балансов:', {
          description: 'Detected operation amount as balance difference',
          telegram_id,
          currentBalance: metadata.currentBalance,
          newBalance: safeAmount,
          calculatedAmount: operationAmount,
        })
        safeAmount = operationAmount
      }
    }

    // Проверка на подозрительно большие суммы для outcome операций
    if (type === PaymentType.MONEY_OUTCOME && safeAmount > 100) {
      logger.warn('⚠️ Подозрительно большая сумма списания, возможно ошибка:', {
        description: 'Suspiciously large amount for outcome operation',
        telegram_id,
        original_amount: originalAmount,
        processed_amount: safeAmount,
      })

      // Для генерации изображений устанавливаем значение по умолчанию
      if (description && description.toLowerCase().includes('generating')) {
        logger.info('🛠️ Корректировка суммы для генерации изображения:', {
          description: 'Correcting amount for image generation',
          telegram_id,
          original_amount: safeAmount,
          new_amount: 5,
        })
        safeAmount = 5 // Стандартная стоимость генерации
      }
    }

    // Дополнительная защита: если после преобразования получили NaN, устанавливаем 0
    if (isNaN(safeAmount)) {
      logger.warn(
        '⚠️ После преобразования получили NaN, устанавливаем сумму в 0',
        {
          description: 'Got NaN after conversion, setting amount to 0',
          telegram_id,
          original_value: amount,
        }
      )
      safeAmount = 0
    }

    // ОТРИЦАТЕЛЬНАЯ СУММА ОТКЛОНЯЕТСЯ. Не нормализуется молча — отклоняется.
    //
    // Знак здесь не «лишняя информация», а прямой путь к перевёрнутой
    // проводке: MONEY_OUTCOME с отрицательными звёздами прибавляет деньги, а
    // MONEY_INCOME с отрицательными — отнимает. Ровно это и произошло: 114
    // строк по -9 звёзд, начисливших 1026 вместо списания.
    //
    // Math.abs здесь был бы хуже отказа: он превратил бы `updateUserBalance(id,
    // -500, MONEY_INCOME)` в честное начисление 500, и написавший так никогда
    // бы не узнал, что списание не сработало. Пусть операция не пройдёт громко.
    if (safeAmount < 0) {
      logger.error('❌ Отрицательная сумма операции — запись отклонена:', {
        description:
          'Negative amount rejected: sign is set by `type`, not by the number',
        telegram_id,
        original_amount: originalAmount,
        final_amount: safeAmount,
        type,
        operation_description: description,
      })
      return false
    }

    // Логируем финальную сумму для проверки
    logger.info('✅ Финальная сумма транзакции:', {
      description: 'Final transaction amount',
      telegram_id,
      original_amount: originalAmount,
      final_amount: safeAmount,
      type,
    })

    // Проверяем существование пользователя и его баланс для outcome операций
    if (type === PaymentType.MONEY_OUTCOME) {
      // Проверка существования пользователя
      const { error: userError } = await supabase
        .from('users')
        // Исправлено: выбираем telegram_id или просто проверяем существование
        .select('telegram_id', { count: 'exact', head: true })
        .eq('telegram_id', telegram_id)
      // Убираем .single(), так как head: true уже гарантирует 0 или 1 строку и не возвращает data

      // Проверяем только ошибку (например, сетевую), а не факт отсутствия пользователя
      // Отсутствие пользователя (count === 0) теперь не считается ошибкой здесь,
      // так как баланс все равно считается по payments_v2
      if (userError && userError.code !== 'PGRST116') {
        // PGRST116 - No rows found
        logger.error('❌ Ошибка при проверке существования пользователя:', {
          description: 'Error checking user existence (not user not found)',
          telegram_id,
          error: userError.message,
          errorCode: userError.code,
        })
        // Можно решить, стоит ли здесь возвращать false или продолжить,
        // полагаясь на balance check
        // return false;
      }

      // Убрана проверка if (!userData), так как head: true не возвращает data

      // Получаем баланс пользователя из таблицы payments
      // Оставляем попытку вызова RPC, но если она не сработает,
      // fallback будет использовать payments_v2
      const { data: balanceData, error: balanceError } = await supabase.rpc(
        'get_user_balance',
        { user_telegram_id: Number(telegram_id) }
      )
      console.log('balanceData 📊', balanceData)

      // Если RPC функция не существует, используем обычный SQL запрос
      let currentBalance = 0
      if (balanceError) {
        logger.warn('⚠️ Ошибка при вызове RPC get_user_balance:', {
          description: 'Error calling RPC get_user_balance',
          telegram_id,
          error: balanceError.message,
        })

        // Вычисляем баланс суммируя все транзакции из payments_v2
        const { data: paymentsData, error: paymentsError } = await supabase
          // .from('payments') // Старая таблица
          .from('payments_v2') // Новая таблица
          .select('stars, type')
          .eq('telegram_id', Number(telegram_id))
          .eq('status', PaymentStatus.COMPLETED)

        if (paymentsError) {
          logger.error('❌ Ошибка при получении истории платежей:', {
            description: 'Error getting payments history',
            telegram_id,
            error: paymentsError.message,
          })
          return false
        }

        // Вычисляем баланс: сумма всех поступлений минус сумма всех списаний.
        //
        // Здесь сравнивалось с 'money_income' в нижнем регистре, а в базе тип
        // хранится как 'MONEY_INCOME'. Условие не совпадало НИКОГДА, поэтому
        // ветка вычитала всё подряд, включая пополнения, и выдавала глубокий
        // минус. Срабатывает эта ветка только когда RPC недоступна — то есть
        // ровно во время аварии, когда неверное число опаснее всего.
        //
        // Знак задаёт тип: вычитается только MONEY_OUTCOME, остальное
        // прибавляется. Это та же формула, что и у настоящей get_user_balance —
        // восстановлена опытным путём, scripts/probe-balance-formula.cjs.
        currentBalance = (paymentsData || []).reduce((sum, payment) => {
          const stars = Number(payment.stars) || 0
          return payment.type === PaymentType.MONEY_OUTCOME
            ? sum - stars
            : sum + stars
        }, 0)
      } else {
        // Используем результат RPC функции
        currentBalance = Number(balanceData) || 0
      }

      logger.info('💰 Баланс пользователя (из payments):', {
        description: 'User balance from payments table',
        telegram_id,
        balance: currentBalance,
        required_amount: safeAmount,
      })

      // Проверка достаточности средств для списания
      //
      // THE LEVEL OF A REFUSED CHARGE, SOURCE VERSUS ECHO, WRITTEN DOWN ONCE.
      //
      // Read this before changing the level of any "the balance is short" line
      // anywhere in the repository; it was reconstructed from seven files once
      // already, and once is enough.
      //
      // The class is WARN. An empty wallet is written down, never paged.
      //
      // INFO is reserved for the SOURCE -- the line that decides the refusal
      // in the same breath as the customer is handed the top-up prompt, where
      // the message to the customer is the record and a second operator entry
      // would count one refusal twice. Two sites, both deliberate:
      //   * price/helpers/refuseUnpaidGeneration.ts -- processBalanceOperation
      //     already sent the prompt, with buttons, one frame below;
      //   * helpers/checkUserBalance.ts -- it sends that message itself.
      //
      // WARN is the ECHO -- a catch further up that re-states a refusal
      // already decided below so its handler can stop quietly. The echo is the
      // operator's record that a paid action was abandoned, and it is what a
      // question like "how many refusals today" actually counts. Today:
      // scenes/imageUpscalerWizard, scenes/aiPhotoshopScene (both upscale
      // entry points), scenes/avatarTransformScene (chain guard and outer
      // catch), and the withErrorHandling wrapper in navigation/
      // registerCommands.ts -- which was the last holdout at info and moved to
      // warn with this note, because one class logged at two levels cannot be
      // counted with one query and the miss is silent.
      //
      // A refusal that tells the customer nothing where it is logged -- this
      // guard, directPayment.ts, the two videoGenerator price helpers, the
      // model-training balance check -- is an operator record as well: it
      // returns false or throws and leaves the speaking to the caller, so it
      // is warn too. The list is the census as it stood, not a closed set;
      // what is closed is the rule above it.
      //
      // Said out loud rather than left for the next reader to trip over:
      // checkUserBalance's path ends at info with no warn above it, so those
      // refusals are invisible to a warn-level count. That is a real gap in
      // the census, not a tidy exception.
      //
      // warn, not error: logger.error is a push notification to the owner's
      // Telegram group, and a customer who cannot afford a generation is not
      // something an operator acts on at 3am.
      //
      // This is a PRE-WRITE guard. It returns before the update and the insert
      // further down, so no row was written and there is nothing to reconcile.
      //
      // warn rather than info, deliberately, for two reasons:
      //
      //  1. The house level for a refused charge is warn everywhere else --
      //     pinned by balanceRefusalIsToldApartFromAnOutage.test.ts and
      //     oneEmptyWalletIsOneRefusal.test.ts. Dropping this one to info
      //     would split one class across two levels.
      //
      //  2. `currentBalance` is not guaranteed to be the customer's real
      //     balance. Above, `Number(balanceData) || 0` turns a null/undefined
      //     RPC result into 0 WITHOUT setting balanceError, and the other
      //     branch recomputes the balance by hand from payments_v2 exactly
      //     when the RPC is down. So this line can fire during an outage for
      //     somebody who does have money. That case deserves a trace in the
      //     log; it does not deserve a page, because the charge was refused
      //     safely and no money moved.
      //
      // Every sibling in this file stays at error on purpose: bad telegram_id,
      // bad amount, a negative amount, a failed payments-history fetch, a
      // top-up rejected after the customer already paid, and the write
      // failures. Those are our machinery; this one is not.
      if (currentBalance < safeAmount) {
        logger.warn('❌ Недостаточно средств на балансе:', {
          description: 'Insufficient funds',
          telegram_id,
          balance: currentBalance,
          required_amount: safeAmount,
        })
        return false
      }
    } else {
      // Top-ups only need to know the user exists.
      //
      // limit(1) instead of .single(): telegram_id is NOT unique in `users`.
      // Measured on production 2026-08-28: 2371 rows for 2336 distinct
      // telegram_ids -- 19 people have 2-3 rows each. `.single()` errors on
      // more than one row, so for exactly those people EVERY top-up and refund
      // was rejected below as "no users row" while their money was already
      // taken. Existence is all this branch needs, so take the first row.
      const { data: userRows, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegram_id)
        .limit(1)
      const userData = userRows?.[0] ?? null

      // ЗДЕСЬ ЧЕЛОВЕК УЖЕ ЗАПЛАТИЛ. Отказ означает, что деньги списаны на
      // стороне платёжной системы, а звёзды не зачислены.
      //
      // Прежние сообщения — «Пользователь не найден при создании транзакции» —
      // не давали этого понять: по логу это выглядело как обычная неудачная
      // выборка. Между тем ветка срабатывает только для MONEY_INCOME, то есть
      // ВСЕГДА на пополнении, и путь сюда ведёт прямо от вебхука Robokassa
      // (inngest_app/functions/payments/paymentProcessing.ts:159).
      //
      // Асимметрия проверки: списание (MONEY_OUTCOME) при отсутствии профиля
      // проходит — там ошибка только пишется в лог, — а зачисление отклоняется.
      // Получается, потратить можно, а получить нельзя.
      //
      // Измерено: 44 плательщика с настоящей (не миграционной) активностью не
      // имеют строки в users, 13 из них с положительным балансом на 15 712
      // звёзд. Разбор — docs/audit/ghost-payers.md.
      //
      // Семантику НЕ меняю: создавать профиль по факту оплаты — продуктовое
      // решение (какой bot_name, какой язык, что с рефералами). Но отказ
      // теперь видно и по нему можно поставить оповещение.
      const moneyArrivedBlindly = {
        description: 'PAYMENT RECEIVED BUT NOT CREDITED: no users row',
        alert: 'ДЕНЬГИ ПОЛУЧЕНЫ, ЗВЁЗДЫ НЕ ЗАЧИСЛЕНЫ — нет профиля в users',
        telegram_id,
        type,
        amount: safeAmount,
        inv_id: metadata?.inv_id ?? null,
        payment_method: metadata?.payment_method ?? null,
        bot_name: metadata?.bot_name ?? null,
        operation_description: description,
      }

      if (userError) {
        logger.error('💸❌ Пополнение отклонено: профиля нет в users', {
          ...moneyArrivedBlindly,
          error: userError.message,
        })
        return false
      }

      if (!userData) {
        logger.error(
          '💸❌ Пополнение отклонено: профиля нет в users (пустой ответ)',
          moneyArrivedBlindly
        )
        return false
      }
    }

    // Проверяем, есть ли inv_id в метаданных (для обновления существующей записи)
    if (metadata?.inv_id) {
      logger.info('🔄 Обновление существующей записи о транзакции:', {
        description: 'Updating existing transaction record',
        telegram_id,
        inv_id: metadata.inv_id,
        amount: Math.abs(safeAmount),
        type,
      })

      // Обновляем существующую запись в payments_v2
      const { error: updateError } = await supabase
        // .from('payments') // Старая таблица
        .from('payments_v2') // Новая таблица
        .update({
          status: PaymentStatus.COMPLETED,
        })
        .eq('inv_id', metadata.inv_id)

      if (updateError) {
        logger.error('❌ Ошибка при обновлении записи о транзакции:', {
          description: 'Error updating transaction record',
          telegram_id,
          inv_id: metadata.inv_id,
          error: updateError.message,
        })
        return false
      }

      logger.info('✅ Транзакция успешно обновлена:', {
        description: 'Transaction successfully updated',
        telegram_id,
        inv_id: metadata.inv_id,
        amount: safeAmount,
        type,
      })

      // ВОЗВРАТ ОБЯЗАТЕЛЕН.
      //
      // Раньше после успешного UPDATE выполнение проваливалось ниже, к INSERT
      // с тем же inv_id, и упиралось в UNIQUE-ограничение payments_v2_inv_id_key.
      // Функция возвращала false КАЖДОМУ, кто передал существующий inv_id, —
      // хотя строка уже переведена в COMPLETED, то есть звёзды начислены
      // (баланс считается суммой COMPLETED-строк).
      //
      // Цена: обе сцены оплаты TON показывали «Платёж получен, но произошла
      // ошибка зачисления» на КАЖДОМ успешном платеже, подталкивая человека
      // заплатить второй раз. В robokassa.routes.ts этот же ложный false уже
      // ловили руками и гасили комментарием «звёзды начислены отметкой» —
      // лечили симптом, а не причину.
      return true
    }

    // Обновление баланса в таблице Users больше не требуется - используем динамическое вычисление

    // --- НОВАЯ ЛОГИКА СОХРАНЕНИЯ ТРАНЗАКЦИИ В payments_v2 ---
    const paymentRecordToValidate: any = {
      telegram_id: Number(telegram_id), // Преобразуем в число для соответствия схеме
      amount: originalAmount,
      stars: Number(safeAmount.toFixed(2)), // Сохраняем точность до 2 знаков
      currency: metadata?.currency || Currency.XTR,
      status: metadata?.status || PaymentStatus.COMPLETED,
      type: type,
      payment_method: metadata?.payment_method || 'System',
      description: description || 'System operation',
      metadata: metadata,
      bot_name: metadata?.bot_name || 'unknown_bot',
      service_type:
        type === PaymentType.MONEY_OUTCOME
          ? metadata?.service_type || 'unknown_service'
          : null,
      model_name:
        type === PaymentType.MONEY_OUTCOME
          ? metadata?.model_name || null
          : null,
      subscription_type:
        type === PaymentType.MONEY_INCOME
          ? metadata?.subscription_type || null
          : null,
      payment_date:
        metadata?.status === PaymentStatus.COMPLETED
          ? new Date().toISOString()
          : null,
      inv_id: metadata?.inv_id || `sys-${Date.now()}-${telegram_id}`,
      operation_id: metadata?.operation_id || null, // Добавляем operation_id из метаданных
      category: metadata?.category || 'REAL', // Добавляем category из метаданных, по умолчанию REAL
    }

    // Рассчитываем и добавляем cost для MONEY_OUTCOME операций
    if (type === PaymentType.MONEY_OUTCOME) {
      let calculatedCost = 0

      // Если cost_in_stars передан явно, используем его
      if (cost_in_stars !== undefined) {
        calculatedCost = cost_in_stars
        logger.info('🎯 Используем переданный cost_in_stars:', {
          telegram_id,
          service_type: metadata?.service_type,
          cost_in_stars,
        })
      } else {
        // Автоматически рассчитываем cost на основе service_type
        calculatedCost = calculateServiceCost(
          metadata?.service_type || null,
          metadata,
          safeAmount
        )
        logger.info('🧮 Автоматически рассчитан cost:', {
          telegram_id,
          service_type: metadata?.service_type,
          metadata,
          stars: safeAmount,
          calculatedCost,
        })
      }

      paymentRecordToValidate.cost = calculatedCost
    } else {
      // Для MONEY_INCOME операций cost всегда 0
      paymentRecordToValidate.cost = 0
    }

    // Валидация с помощью Zod
    try {
      const validatedPaymentRecord = CreatePaymentV2Schema.parse(
        paymentRecordToValidate
      )
      logger.info('✅ Данные для payments_v2 прошли валидацию Zod:', {
        description: 'Data for payments_v2 passed Zod validation',
        telegram_id,
        record: validatedPaymentRecord,
      })

      // Вставляем валидированную запись в payments_v2
      const { error: paymentError } = await supabase
        .from('payments_v2')
        .insert(validatedPaymentRecord)

      if (paymentError) {
        logger.error('❌ Ошибка при добавлении записи в payments_v2:', {
          description: 'Error inserting record into payments_v2',
          telegram_id,
          record: validatedPaymentRecord,
          error: paymentError.message,
          details: paymentError.details,
          hint: paymentError.hint,
        })
        return false
      }

      logger.info('✅ Запись успешно добавлена в payments_v2:', {
        description: 'Record successfully added to payments_v2',
        telegram_id,
        record_id: validatedPaymentRecord.inv_id,
        type,
        final_amount_stars: safeAmount,
        cost_in_stars: validatedPaymentRecord.cost,
      })
    } catch (validationError) {
      logger.error(
        '❌ Ошибка валидации Zod для payments_v2 (CreatePaymentV2Schema):',
        {
          description:
            'Zod validation error for payments_v2 (CreatePaymentV2Schema)',
          telegram_id,
          record: paymentRecordToValidate,
          error: validationError.errors || validationError.message,
        }
      )
      return false
    }

    // Balance cache invalidation is best-effort. The payments_v2 row is already
    // committed above (the money has moved), so a throw here must NOT reach the
    // outer catch and flip the return to false: a false 'charged=false' makes the
    // caller deliver-unbilled or retry into a double charge. invalidateBalanceCache
    // is a no-op today but is kept switchable, so the contract 'return true iff the
    // transaction committed' must not depend on it never throwing (#1174).
    try {
      await invalidateBalanceCache(telegram_id.toString())
      logger.info('💰 Кэш баланса инвалидирован для:', {
        description: 'Balance cache invalidated for',
        telegram_id,
      })
    } catch (cacheError) {
      logger.error(
        'Balance cache invalidation threw AFTER a committed transaction (non-fatal, charge stands):',
        {
          telegram_id,
          error:
            cacheError instanceof Error
              ? cacheError.message
              : String(cacheError),
        }
      )
    }

    return true
  } catch (error) {
    logger.error('❌ Неожиданная ошибка при создании транзакции:', {
      description: 'Unexpected error creating transaction',
      telegram_id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    // Возвращаем false вместо выброса исключения
    return false
  }
}

/**
 * Public entry: serialize every balance write for a given user, then run the
 * unchanged implementation. See balanceLock.ts and #999.
 */
export const updateUserBalance = (
  telegram_id: string,
  amount: number,
  type: PaymentType,
  description?: string,
  metadata?: BalanceUpdateMetadata,
  cost_in_stars?: number
): Promise<boolean> =>
  withUserBalanceLock(String(telegram_id), () =>
    updateUserBalanceUnlocked(
      telegram_id,
      amount,
      type,
      description,
      metadata,
      cost_in_stars
    )
  )
