/**
 * 🎹 ГЕНЕРАЦИЯ КЛАВИАТУР МЕНЮ
 *
 * Создание клавиатур для главного меню и подменю категорий.
 */

import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup, KeyboardButton } from 'telegraf/types'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import {
  CATEGORIES,
  getCategoryById,
  getCategoryText,
  getItemText,
} from '../config/categories.config'
import { NAVIGATION_BUTTONS, getButtonText } from '../config/buttons.config'
import {
  canShowMiniAppButton,
  createMiniAppButton,
} from '../config/miniApp.config'
import { logSceneEnter, logMainMenuReturn } from './navigationLogger'
import { logger } from '@/utils/logger'
import { isUserBotOwner } from '@/core/supabase/getOwnedBots'

/**
 * Создаёт клавиатуру главного меню (категории)
 * Кнопки по 3 в ряду для компактности
 */
export function createMainMenuKeyboard(
  ctx: MyContext
): Markup.Markup<ReplyKeyboardMarkup> {
  const isRu = isRussianFromState(ctx)

  // Кнопки категорий (3 в ряд)
  const categoryButtons = CATEGORIES.map(cat => getCategoryText(cat, isRu))
  const rows: KeyboardButton[][] = []

  for (let i = 0; i < categoryButtons.length; i += 3) {
    const row: KeyboardButton[] = [categoryButtons[i]]
    if (categoryButtons[i + 1]) {
      row.push(categoryButtons[i + 1])
    }
    if (categoryButtons[i + 2]) {
      row.push(categoryButtons[i + 2])
    }
    rows.push(row)
  }

  // Мини-апп (видеоредактор) отдельной строкой — только в личке:
  // вне приватного чата Telegram отклоняет web_app в reply-клавиатуре.
  if (canShowMiniAppButton(ctx.chat?.type)) {
    rows.push([createMiniAppButton(isRu)])
  }

  return Markup.keyboard(rows).resize()
}

/**
 * Создаёт клавиатуру для категории
 * Кнопки по 3 в ряду для компактности
 *
 * NOTE: Для поддержки ownerOnly кнопок используйте createCategoryKeyboardAsync
 */
export function createCategoryKeyboard(
  ctx: MyContext,
  categoryId: string,
  options: { includeBack?: boolean } = {}
): Markup.Markup<ReplyKeyboardMarkup> {
  const isRu = isRussianFromState(ctx)
  const category = getCategoryById(categoryId)

  if (!category) {
    logger.warn(`[menuKeyboard] Category not found: ${categoryId}`)
    return createMainMenuKeyboard(ctx)
  }

  // Собираем все кнопки функций (без админских, скрытых и ownerOnly)
  const buttons: string[] = []
  for (const item of category.items) {
    // Пропускаем админские кнопки
    if (item.adminOnly) {
      continue
    }
    // ✅ Пропускаем скрытые кнопки (например, "Подписка" - не нужна пользователям)
    if (item.hidden) {
      continue
    }
    // Пропускаем ownerOnly кнопки в синхронной версии
    // Для их показа используйте createCategoryKeyboardAsync
    if (item.ownerOnly) {
      continue
    }
    buttons.push(getItemText(item, isRu))
  }

  // Группируем по 2 в ряд (для красивой раскладки)
  const rows: string[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    const row = [buttons[i]]
    if (buttons[i + 1]) {
      row.push(buttons[i + 1])
    }
    rows.push(row)
  }

  // Кнопка "Главное меню" отдельной строкой
  if (options.includeBack !== false) {
    rows.push([getButtonText(NAVIGATION_BUTTONS.mainMenu, isRu)])
  }

  return Markup.keyboard(rows).resize()
}

/**
 * Асинхронная версия createCategoryKeyboard с поддержкой ownerOnly кнопок
 * Проверяет является ли пользователь владельцем бота для показа ownerOnly кнопок
 */
export async function createCategoryKeyboardAsync(
  ctx: MyContext,
  categoryId: string,
  options: { includeBack?: boolean } = {}
): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  const isRu = isRussianFromState(ctx)
  const category = getCategoryById(categoryId)

  if (!category) {
    logger.warn(`[menuKeyboard] Category not found: ${categoryId}`)
    return createMainMenuKeyboard(ctx)
  }

  // Проверяем является ли пользователь владельцем бота (или админом)
  const telegramId = ctx.from?.id
  const isBotOwner = await isUserBotOwner(telegramId)

  // Собираем все кнопки функций
  const buttons: string[] = []
  for (const item of category.items) {
    // Пропускаем админские кнопки
    if (item.adminOnly) {
      continue
    }
    // Пропускаем скрытые кнопки
    if (item.hidden) {
      continue
    }
    // Проверяем ownerOnly кнопки - показываем только владельцам
    if (item.ownerOnly && !isBotOwner) {
      continue
    }
    buttons.push(getItemText(item, isRu))
  }

  // Группируем по 2 в ряд (для красивой раскладки)
  const rows: string[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    const row = [buttons[i]]
    if (buttons[i + 1]) {
      row.push(buttons[i + 1])
    }
    rows.push(row)
  }

  // Кнопка "Главное меню" отдельной строкой
  if (options.includeBack !== false) {
    rows.push([getButtonText(NAVIGATION_BUTTONS.mainMenu, isRu)])
  }

  return Markup.keyboard(rows).resize()
}

/**
 * Показывает главное меню
 */
export async function showMainMenu(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  logMainMenuReturn(ctx, 'showMainMenu')

  const greeting = isRu
    ? '🏠 *Главное меню*\n\nВыберите категорию:'
    : '🏠 *Main menu*\n\nChoose a category:'

  try {
    await ctx.reply(greeting, {
      parse_mode: 'Markdown',
      reply_markup: createMainMenuKeyboard(ctx).reply_markup,
    })

    logger.info('✅ [showMainMenu] Main menu displayed', { telegramId })
  } catch (error) {
    logger.error('❌ [showMainMenu] Error displaying menu', {
      error,
      telegramId,
    })

    // Fallback без форматирования
    await ctx.reply(
      isRu ? '🏠 Главное меню' : '🏠 Main menu',
      createMainMenuKeyboard(ctx)
    )
  }
}

/**
 * Показывает меню категории
 */
export async function showCategoryMenu(
  ctx: MyContext,
  categoryId: string
): Promise<void> {
  logger.info('🗺 [showCategoryMenu] START', {
    telegramId: ctx.from?.id,
    categoryId,
    hasContext: !!ctx,
    hasMessage: !!ctx.message,
    currentScene: ctx.scene?.current?.id,
  })

  const isRu = isRussianFromState(ctx)
  const telegramId = ctx.from?.id

  logger.info('🗺 [showCategoryMenu] Looking for category...', {
    telegramId,
    categoryId,
    totalCategories: CATEGORIES.length,
    availableCategories: CATEGORIES.map(c => c.id),
  })

  const category = getCategoryById(categoryId)

  if (!category) {
    logger.error('❌ [showCategoryMenu] Category not found', {
      telegramId,
      categoryId,
      availableCategories: CATEGORIES.map(c => c.id),
    })

    await showMainMenu(ctx)
    return
  }

  logger.info('✅ [showCategoryMenu] Category found', {
    telegramId,
    categoryId,
    categoryRu: category.ru,
    categoryEn: category.en,
    itemsCount: category.items.length,
  })

  logSceneEnter(ctx, category.sceneId, 'showCategoryMenu')

  const title = getCategoryText(category, isRu)
  const description = isRu
    ? `${title}\n\nВыберите функцию:`
    : `${title}\n\nChoose a function:`

  try {
    logger.info('🗺 [showCategoryMenu] Creating keyboard...', {
      telegramId,
      categoryId,
    })

    // Для категории profile используем асинхронную версию для поддержки ownerOnly кнопок
    const keyboard =
      categoryId === 'profile'
        ? await createCategoryKeyboardAsync(ctx, categoryId)
        : createCategoryKeyboard(ctx, categoryId)

    logger.info('🗺 [showCategoryMenu] Sending message...', {
      telegramId,
      categoryId,
      keyboardRows: keyboard.reply_markup?.keyboard?.length || 0,
      messageLength: description.length,
    })

    await ctx.reply(description, {
      reply_markup: keyboard.reply_markup,
    })

    logger.info('✅ [showCategoryMenu] Category menu displayed', {
      telegramId,
      categoryId,
      messageLength: description.length,
      keyboardRows: keyboard.reply_markup?.keyboard?.length || 0,
    })
  } catch (error) {
    logger.error('❌ [showCategoryMenu] Error displaying category', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      telegramId,
      categoryId,
    })
    await showMainMenu(ctx)
  }
}

/**
 * Переход в главное меню с выходом из текущей сцены
 */
export async function navigateToMainMenu(ctx: MyContext): Promise<void> {
  try {
    // Выходим из текущей сцены
    if (ctx.scene?.current) {
      await ctx.scene.leave()
    }

    // Показываем главное меню
    await showMainMenu(ctx)
  } catch (error) {
    logger.error('❌ [navigateToMainMenu] Error', { error })
    await showMainMenu(ctx)
  }
}

/**
 * Переход в категорию с выходом из текущей сцены
 */
export async function navigateToCategory(
  ctx: MyContext,
  categoryId: string
): Promise<void> {
  try {
    // Выходим из текущей сцены
    if (ctx.scene?.current) {
      await ctx.scene.leave()
    }

    // Показываем меню категории
    await showCategoryMenu(ctx, categoryId)
  } catch (error) {
    logger.error('❌ [navigateToCategory] Error', { error, categoryId })
    await showMainMenu(ctx)
  }
}
