// import { SYSTEM_CONFIG } from '@/price/constants/modelsCost' // Удалено
// import { getUserLanguage } from '@/handlers' // Удалено
// import { minCost, maxCost, modeCosts } from '@/price/constants/modelsCost' // Удалено
// import { conversionRates } from '@/price/priceCalculator' // Удалено
import { ModeEnum } from '@/interfaces'
import { MyContext } from '@/interfaces'
import { calculateFinalStarPrice } from '@/pricing/calculator' // <-- Импорт уже есть
import { isRussian } from '@/helpers/language' // <-- Импорт уже есть
import { logger } from '@/utils/logger' // <-- Добавляем логгер

// Удалена старая функция getCost
// const getCost = (cost: number | ((param?: any) => number)): string => {
//   const numericCost = typeof cost === 'function' ? cost(1000) : cost // Используем 1000 шагов для примера
//   return `${numericCost.toFixed(0)}⭐`
// }

export async function priceCommand(ctx: MyContext) {
  const isRu = isRussian(ctx) // <-- Исправлено

  let message = isRu
    ? '<b>💰 Прайс-лист на услуги (в звездах ⭐):</b>\\n\\n'
    : '<b>💰 Price list for services (in stars ⭐):</b>\\n\\n'

  message += isRu
    ? '<i>(Цены могут меняться)</i>\\n\\n'
    : '<i>(Prices are subject to change)</i>\\n\\n'

  let pricesAdded = false

  // Проходим по всем режимам из ModeEnum
  for (const modeKey of Object.keys(ModeEnum)) {
    const mode = ModeEnum[modeKey as keyof typeof ModeEnum]

    // Пропускаем системные/внутренние режимы, если они есть
    if (
      mode === ModeEnum.MainMenu ||
      mode === ModeEnum.CheckBalanceScene ||
      mode === ModeEnum.PaymentScene ||
      mode === ModeEnum.StarPaymentScene ||
      mode === ModeEnum.HelpScene
    ) {
      continue
    }

    try {
      // Вызываем калькулятор для режима.
      // Для режимов с modelId/steps пока покажем базовую цену (или 0)
      const costResult = calculateFinalStarPrice(mode)

      if (costResult && costResult.stars > 0) {
        // Форматируем название режима (можно улучшить для читаемости)
        const modeName = modeKey
          .replace(/([A-Z])/g, ' $1') // Добавляем пробелы перед заглавными буквами
          .replace(/^./, str => str.toUpperCase()) // Первая буква заглавная

        message += `${modeName}: ${costResult.stars} ⭐\\n`
        pricesAdded = true
      }
      // Если costResult.stars === 0, считаем режим бесплатным и не выводим
    } catch (error) {
      logger.error(
        `Error calculating price for mode ${mode} in /price command`,
        { error }
      )
      // Можно добавить строку об ошибке для этого режима, но лучше пропустить
    }
  }

  if (!pricesAdded) {
    message += isRu ? 'Не найдено платных услуг.' : 'No paid services found.'
  }

  // Удаляем старый TODO и комментарии
  // message += 'TODO: Implement dynamic price list generation using calculateFinalStarPrice.\\n'

  await ctx.replyWithHTML(message)
}
