/**
 * 🧪 Тесты кнопки Telegram Mini App (VIBEE видеоредактор) в главном меню
 *
 * Проверяет:
 * - кнопка появляется в личке и НЕ появляется в группах
 *   (Telegram отклоняет web_app в reply-клавиатуре вне приватных чатов)
 * - URL мини-аппа и deep-link через startParam
 * - локализацию подписи
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { KeyboardButton } from 'telegraf/types'
import { createMainMenuKeyboard } from '@/navigation/helpers/menuKeyboard'
import {
  MINI_APP_URL,
  buildMiniAppUrl,
  canShowMiniAppButton,
  createMiniAppButton,
} from '@/navigation/config/miniApp.config'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/navigation/helpers/navigationLogger', () => ({
  logSceneEnter: vi.fn(),
  logMainMenuReturn: vi.fn(),
}))

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(),
}))

vi.mock('@/core/supabase/getOwnedBots', () => ({
  isUserBotOwner: vi.fn().mockResolvedValue(false),
}))

/** Достаёт web_app-кнопки из reply-клавиатуры. */
function webAppButtons(
  keyboard: KeyboardButton[][]
): KeyboardButton.WebAppButton[] {
  return keyboard
    .flat()
    .filter(
      (b): b is KeyboardButton.WebAppButton =>
        typeof b === 'object' && b !== null && 'web_app' in b
    )
}

function makeCtx(chatType: string): MyContext {
  return {
    chat: { id: 1, type: chatType },
    from: { id: 42, language_code: 'ru' },
  } as unknown as MyContext
}

describe('Mini App button — конфигурация', () => {
  it('URL мини-аппа — https (Telegram требует https для web_app)', () => {
    expect(MINI_APP_URL).toMatch(/^https:\/\//)
  })

  it('buildMiniAppUrl без startParam возвращает базовый URL', () => {
    expect(buildMiniAppUrl()).toBe(MINI_APP_URL)
  })

  it('buildMiniAppUrl прокидывает startParam как tgWebAppStartParam', () => {
    expect(buildMiniAppUrl('video')).toBe(
      `${MINI_APP_URL}/?tgWebAppStartParam=video`
    )
  })

  it('buildMiniAppUrl экранирует startParam', () => {
    expect(buildMiniAppUrl('a b&c')).toBe(
      `${MINI_APP_URL}/?tgWebAppStartParam=a%20b%26c`
    )
  })

  it('canShowMiniAppButton — только приватные чаты', () => {
    expect(canShowMiniAppButton('private')).toBe(true)
    expect(canShowMiniAppButton('group')).toBe(false)
    expect(canShowMiniAppButton('supergroup')).toBe(false)
    expect(canShowMiniAppButton('channel')).toBe(false)
    expect(canShowMiniAppButton(undefined)).toBe(false)
  })

  it('createMiniAppButton локализует подпись', () => {
    const ru = createMiniAppButton(true) as KeyboardButton.WebAppButton
    const en = createMiniAppButton(false) as KeyboardButton.WebAppButton
    expect(ru.text).toContain('Видеоредактор')
    expect(en.text).toContain('Video editor')
  })
})

describe('Mini App button — главное меню', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isRussianFromState).mockReturnValue(true)
  })

  it('в личке кнопка есть и ведёт на мини-апп', () => {
    const kb = createMainMenuKeyboard(makeCtx('private'))
    const buttons = webAppButtons(
      kb.reply_markup.keyboard as KeyboardButton[][]
    )

    expect(buttons).toHaveLength(1)
    expect(buttons[0].web_app.url).toBe(MINI_APP_URL)
    expect(buttons[0].text).toContain('Видеоредактор')
  })

  it('кнопка стоит отдельной строкой в конце', () => {
    const rows = createMainMenuKeyboard(makeCtx('private')).reply_markup
      .keyboard as KeyboardButton[][]
    const lastRow = rows[rows.length - 1]

    expect(lastRow).toHaveLength(1)
    expect(webAppButtons([lastRow])).toHaveLength(1)
  })

  it('в группе кнопки НЕТ — иначе Telegram вернёт BUTTON_TYPE_INVALID', () => {
    for (const type of ['group', 'supergroup', 'channel']) {
      const kb = createMainMenuKeyboard(makeCtx(type))
      expect(
        webAppButtons(kb.reply_markup.keyboard as KeyboardButton[][])
      ).toHaveLength(0)
    }
  })

  it('в меню осталась ОДНА дверь — приложение, без списка категорий', () => {
    /*
     * ПРОВЕРКА ПЕРЕВЁРНУТА НАМЕРЕННО, 06.09.2026.
     *
     * Раньше она требовала, чтобы семь категорий (Фото, Видео, Аудио,
     * Аватары, Маркетплейс, Пополнить, Профиль) остались текстовыми
     * кнопками, и охраняла их от случайной потери при добавлении мини-аппа.
     * Своё дело она делала.
     *
     * Владелец убрал их сознательно: «чтобы вся работа в мини аппе или в
     * чате бота, так будет понятно». Аудит перед удалением показал, что все
     * восемь кнопок ИСПРАВНЫ и ведут в зарегистрированные сцены, — убраны не
     * поломанные, а лишние. Сами сцены остались на месте.
     *
     * Поэтому теперь охраняется обратное: список категорий не должен
     * вернуться сам собой, а кнопка приложения обязана остаться — иначе
     * дверей станет ноль.
     */
    const rows = createMainMenuKeyboard(makeCtx('private')).reply_markup
      .keyboard as KeyboardButton[][]
    const textButtons = rows.flat().filter(b => typeof b === 'string')
    expect(textButtons.length).toBe(0)
    expect(webAppButtons(rows).length).toBe(1)
  })

  it('английская локаль даёт английскую подпись', () => {
    vi.mocked(isRussianFromState).mockReturnValue(false)
    const kb = createMainMenuKeyboard(makeCtx('private'))
    const buttons = webAppButtons(
      kb.reply_markup.keyboard as KeyboardButton[][]
    )

    expect(buttons[0].text).toContain('Video editor')
  })
})
