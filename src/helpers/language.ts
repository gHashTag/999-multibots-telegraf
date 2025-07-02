import { Context } from 'telegraf'
import { MyContext } from '@/interfaces'

// Оригинальная функция - используется как fallback
export const isRussian = (ctx: Context) => ctx.from?.language_code === 'ru'

// ✅ Новые функции для работы с пользовательским выбором языка

/**
 * Сохраняет выбор языка пользователя в сессии
 */
export const setUserLanguage = (ctx: MyContext, language: 'ru' | 'en') => {
  if (!ctx.session) {
    ctx.session = {}
  }
  ctx.session.userLanguage = language
}

/**
 * Получает язык пользователя с учетом его выбора или fallback на Telegram язык
 */
export const getUserLanguage = (ctx: MyContext): 'ru' | 'en' => {
  // Если у пользователя есть сохраненный выбор языка, используем его
  if (ctx.session?.userLanguage) {
    return ctx.session.userLanguage
  }

  // Иначе используем язык из Telegram
  return ctx.from?.language_code === 'ru' ? 'ru' : 'en'
}

/**
 * Проверяет, является ли текущий язык русским (с учетом пользовательского выбора)
 */
export const isRussianWithUserChoice = (ctx: MyContext): boolean => {
  return getUserLanguage(ctx) === 'ru'
}

/**
 * Переключает язык пользователя на противоположный
 */
export const toggleUserLanguage = (ctx: MyContext): 'ru' | 'en' => {
  const currentLanguage = getUserLanguage(ctx)
  const newLanguage = currentLanguage === 'ru' ? 'en' : 'ru'
  setUserLanguage(ctx, newLanguage)
  return newLanguage
}
