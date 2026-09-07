/**
 * 🎹 ГЕНЕРАЦИЯ КЛАВИАТУР МЕНЮ
 *
 * Создание клавиатур для главного меню и подменю категорий.
 */

import { Markup } from 'telegraf'
import type {
  ReplyKeyboardMarkup,
  ReplyKeyboardRemove,
  KeyboardButton,
} from 'telegraf/types'
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
import { isAdmin } from '@/middleware/adminOnly'
import { standardButtons } from './actionButtons'

/**
 * Создаёт клавиатуру главного меню (категории)
 * Кнопки по 3 в ряду для компактности
 */
export function createMainMenuKeyboard(
  ctx: MyContext
): Markup.Markup<ReplyKeyboardRemove> {
  const isRu = isRussianFromState(ctx)

  /*
   * ДВЕ ДВЕРИ ВМЕСТО ВОСЬМИ КНОПОК.
   *
   * Здесь строилась клавиатура из категорий — Фото, Видео, Аудио, Аватары,
   * Маркетплейс, Пополнить, Профиль — плюс мини-апп. Владелец убрал её
   * сознательно: «чтобы вся работа в мини аппе или в чате бота, так будет
   * понятно».
   *
   * И это не косметика. Восемь кнопок обещали восемь разных способов
   * работать, а на деле каждая вела в свой мастер со своими шагами. Человек
   * выбирал не действие, а ветку меню. Две двери — приложение и разговор —
   * описывают продукт честнее: либо ты работаешь руками в приложении, либо
   * говоришь агенту, что нужно.
   *
   * Аудит перед удалением показал, что все восемь кнопок ИСПРАВНЫ и ведут в
   * зарегистрированные сцены. Убраны не поломанные, а лишние: сами сцены
   * остаются на месте и доступны, просто их больше не предлагают списком.
   *
   * КНОПКА ПРИЛОЖЕНИЯ В КЛАВИАТУРЕ ТОЖЕ УБРАНА — И ЭТО НЕ ЭСТЕТИКА.
   *
   * Мини-апп, запущенный кнопкой reply-клавиатуры, НЕ ПОЛУЧАЕТ ни подписи, ни
   * пользователя: Telegram так устроен, и это записано в самом приложении
   * (atoms/telegramAuth.ts: «запуск с reply-кнопки не несёт ни подписи, ни
   * пользователя»). Владелец увидел ровно это: открыл приложение из бота и
   * упёрся в «Войти», хотя он уже внутри Telegram.
   *
   * Подписанный запуск даёт кнопка МЕНЮ чата (у нас она называется «APP»),
   * ссылка и inline-кнопка. Поэтому широкая кнопка внизу была не «понятной
   * подсказкой», а единственной дверью, которая ломает вход.
   *
   * Клавиатура убирается целиком (removeKeyboard), а не подменяется пустой:
   * пустой массив кнопок Telegram показывает как пустую панель, и старая
   * клавиатура у человека может остаться висеть.
   */
  return Markup.removeKeyboard()
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
): Markup.Markup<ReplyKeyboardMarkup | ReplyKeyboardRemove> {
  const isRu = isRussianFromState(ctx)
  const category = getCategoryById(categoryId)

  if (!category) {
    logger.warn(`[menuKeyboard] Category not found: ${categoryId}`)
    return createMainMenuKeyboard(ctx)
  }

  /*
   * АДМИНСКИЕ КНОПКИ НЕ ВИДЕЛ НИКТО — ВКЛЮЧАЯ АДМИНОВ.
   *
   * Здесь стояло безусловное `if (item.adminOnly) continue`: пункт
   * отбрасывался у ВСЕХ, и проверки «а ты админ?» не было вовсе. То есть
   * «🎬 ИИ Рилс» и «🔍 Парсинг Instagram» не рисовались никому и никогда,
   * хотя их обработчики зарегистрированы и срабатывают, если набрать
   * название текстом.
   *
   * Это не «скрыто от посторонних», а «спрятано от собственного владельца».
   * Признак ровно тот, на который жаловался владелец: кнопки не работают —
   * потому что их нет на экране.
   *
   * Проверка берётся из уже существующего `isAdmin` (src/middleware/adminOnly),
   * того же ADMIN_IDS_ARRAY, которым пользуются сцены. Второго списка админов
   * заводить незачем: разошлись бы.
   */
  const админ = isAdmin(ctx.from?.id ?? 0)

  // Собираем все кнопки функций (админские — только админам)
  const buttons: string[] = []
  for (const item of category.items) {
    if (item.adminOnly && !админ) {
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
): Promise<Markup.Markup<ReplyKeyboardMarkup | ReplyKeyboardRemove>> {
  const isRu = isRussianFromState(ctx)
  const category = getCategoryById(categoryId)

  if (!category) {
    logger.warn(`[menuKeyboard] Category not found: ${categoryId}`)
    return createMainMenuKeyboard(ctx)
  }

  // Проверяем является ли пользователь владельцем бота (или админом)
  const telegramId = ctx.from?.id
  const isBotOwner = await isUserBotOwner(telegramId)

  // Та же поправка, что и в синхронной версии выше: админский пункт скрыт от
  // не-админа, а не от всех. Две копии одного цикла разошлись бы молча, если
  // починить только одну — а именно эту версию и зовёт меню «Профиля».
  const админ = isAdmin(telegramId ?? 0)

  // Собираем все кнопки функций
  const buttons: string[] = []
  for (const item of category.items) {
    if (item.adminOnly && !админ) {
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

  /*
   * THE GREETING NO LONGER PROMISES A LIST THAT WAS DELIBERATELY REMOVED.
   *
   * It said "Выберите категорию:" while `createMainMenuKeyboard` returns
   * `Markup.removeKeyboard()` -- the owner took the eight category buttons out
   * on purpose (see that function). So the last thing a person saw, from 108
   * call sites including the end of new-user onboarding, was an instruction to
   * choose from nothing.
   */
  const greeting = isRu
    ? '🏠 *Главное меню*\n\nДве двери: приложение или разговор со мной.'
    : '🏠 *Main menu*\n\nTwo doors: the app, or a conversation with me.'

  try {
    await ctx.reply(greeting, {
      parse_mode: 'Markdown',
      reply_markup: createMainMenuKeyboard(ctx).reply_markup,
    })

    /*
     * AND SOMETHING TO PRESS, WHICH THIS SCREEN HAD NONE OF.
     *
     * Owner: "always send the answers with buttons so the user can react
     * without writing text", and "the bot must proactively offer to pay right
     * after /start". The offer existed but was wired to ONE branch of /start --
     * the EXISTING-user branch. A brand-new person went to CreateUserScene,
     * through the free demo, and landed here, which is where the whole
     * onboarding chain ends: greeting, keyboard removed, nothing to tap.
     *
     * It is a second message rather than a keyboard on the greeting because
     * the greeting carries `remove_keyboard`, and Telegram allows one
     * reply_markup per message. The removal is load-bearing: 87 places still
     * send a reply keyboard, and this is what clears a stale wizard one.
     *
     * The failure is swallowed: a menu that displayed is not undone by a
     * follow-up that did not.
     */
    const next = isRu
      ? 'Что дальше? Для генераций нужен баланс в звёздах — пополнить можно прямо здесь. ' +
        'Или просто напишите, что нужно сделать.'
      : 'What next? Generations run on a star balance -- you can top it up right here. ' +
        'Or just tell me what you need.'
    await ctx.reply(next, standardButtons(isRu)).catch(() => {
      // The menu is already on screen; a missing follow-up is not a failure of it.
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
      // Клавиатура может быть и снятием (removeKeyboard) — у него рядов нет.
      keyboardRows:
        'keyboard' in (keyboard.reply_markup ?? {})
          ? ((keyboard.reply_markup as ReplyKeyboardMarkup).keyboard?.length ??
            0)
          : 0,
      messageLength: description.length,
    })

    await ctx.reply(description, {
      reply_markup: keyboard.reply_markup,
    })

    logger.info('✅ [showCategoryMenu] Category menu displayed', {
      telegramId,
      categoryId,
      messageLength: description.length,
      // Клавиатура может быть и снятием (removeKeyboard) — у него рядов нет.
      keyboardRows:
        'keyboard' in (keyboard.reply_markup ?? {})
          ? ((keyboard.reply_markup as ReplyKeyboardMarkup).keyboard?.length ??
            0)
          : 0,
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
