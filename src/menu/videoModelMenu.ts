import { Markup } from 'telegraf'
// Убираем импорт InlineKeyboardMarkup, он не нужен
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
// import { VIDEO_MODELS } from '@/interfaces' // Старый импорт не нужен
import { VIDEO_MODELS_CONFIG } from '@/config/models.config' // Импортируем конфиг
// Импортируем функцию расчета финальной цены
import { calculateFinalPrice } from '@/price/helpers'

export const videoModelKeyboard = (
  isRu: boolean
): Markup.Markup<ReplyKeyboardMarkup> => {
  // Создаем массив текстовых названий кнопок С ЦЕНОЙ В ЗВЕЗДАХ ⭐
  const buttons = Object.entries(VIDEO_MODELS_CONFIG).map(([key, config]) => {
    // Рассчитываем финальную цену в звездах (уже по новой логике)
    const finalPriceInStars = calculateFinalPrice(key)
    // Формируем текст кнопки с ценой в звездах и эмодзи ⭐
    return `${config.title} (${finalPriceInStars} ⭐)` // Заменяем ★ на ⭐
  })

  // Группируем кнопки моделей по 2 в ряд
  const rows: string[][] = [] // Массив массивов строк
  const buttonsPerRow = 2 // Можно изменить на 3
  for (let i = 0; i < buttons.length; i += buttonsPerRow) {
    rows.push(buttons.slice(i, i + buttonsPerRow))
  }

  // Добавляем кнопки Помощь и Отмена как строки
  rows.push([isRu ? 'Помощь' : 'Help'])
  rows.push([isRu ? 'Отмена' : 'Cancel'])

  // Используем Markup.keyboard и добавляем .resize()
  return Markup.keyboard(rows).resize()
}
