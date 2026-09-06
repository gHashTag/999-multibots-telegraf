/**
 * КНОПКИ МИНИ-АППА В REPLY-КЛАВИАТУРЕ БЫТЬ НЕ ДОЛЖНО — И ЭТО НЕ ВКУСОВЩИНА.
 *
 * Этот файл раньше сторожил ОБРАТНОЕ: что кнопка «🎬 Видеоредактор» есть в
 * личке, стоит отдельной строкой, локализована и не попадает в группы. Всё
 * верно — ровно до того дня, когда выяснилось, чем такая кнопка расплачивается.
 *
 * ЧТО ВЫЯСНИЛОСЬ 06.09.2026. Владелец открыл приложение этой кнопкой и упёрся
 * в «Войти», находясь ВНУТРИ Telegram: «почему я автоматически не зашёл через
 * tma?». Причина не в приложении. Мини-апп, запущенный кнопкой
 * reply-клавиатуры, не получает ни подписи, ни пользователя — так устроен
 * Telegram. Это записано и в самом приложении:
 *
 *     atoms/telegramAuth.ts: «запуск с reply-кнопки не несёт ни подписи, ни
 *     пользователя… войти неоткуда»
 *
 * То есть кнопка выглядела главной дверью, а вела в тупик: сервер отвергает
 * запросы без подписи, и человеку показывают вход, которого для него не
 * существует.
 *
 * Подписанный запуск дают: кнопка МЕНЮ чата (у нас «APP»), прямая ссылка и
 * inline-кнопка. Поэтому reply-кнопка убрана, а вместе с ней — вся клавиатура
 * (решение владельца: «чтобы вся работа в мини аппе или в чате бота»).
 *
 * Проверки ниже сторожат новое правило: главное меню СНИМАЕТ клавиатуру и не
 * предлагает никаких reply-кнопок. Сама конфигурация мини-аппа остаётся
 * рабочей — она нужна для кнопки меню и ссылок.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const makeCtx = (chatType: 'private' | 'group'): MyContext =>
  ({
    chat: { id: 1, type: chatType },
    from: { id: 42, is_bot: false, first_name: 'T' },
    session: {},
  }) as unknown as MyContext

describe('главное меню не предлагает reply-кнопок', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isRussianFromState).mockReturnValue(true)
  })

  it('меню СНИМАЕТ клавиатуру, а не рисует пустую', () => {
    /*
     * `Markup.keyboard([])` Telegram показывает как пустую панель, и прежняя
     * клавиатура у человека может остаться висеть. Снятие — единственный
     * способ убрать её наверняка.
     */
    const kb = createMainMenuKeyboard(makeCtx('private'))
    expect(kb.reply_markup).toHaveProperty('remove_keyboard', true)
  })

  it('кнопки мини-аппа в клавиатуре НЕТ — она ломает вход', () => {
    // Ради этого файл и переписан: reply-запуск не несёт подписи.
    const kb = createMainMenuKeyboard(makeCtx('private'))
    expect(JSON.stringify(kb.reply_markup)).not.toContain('web_app')
  })

  it('в группе — то же самое', () => {
    const kb = createMainMenuKeyboard(makeCtx('group'))
    expect(kb.reply_markup).toHaveProperty('remove_keyboard', true)
  })
})

describe('конфигурация мини-аппа осталась рабочей', () => {
  /*
   * Убрана КНОПКА, а не приложение. Адрес и его сборка нужны кнопке меню
   * («APP»), ссылкам и диплинкам — то есть тем запускам, которые подпись как
   * раз несут. Стереть конфигурацию заодно означало бы сломать рабочие двери
   * вместе со сломанной.
   */
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(isRussianFromState).mockReturnValue(true)
  })

  it('адрес приложения задан', () => {
    expect(MINI_APP_URL).toMatch(/^https:\/\//)
  })

  it('диплинк добавляет start_param', () => {
    const u = buildMiniAppUrl('abc')
    expect(u).toContain(MINI_APP_URL)
    expect(u).toContain('abc')
  })

  it('web_app по-прежнему разрешён только в личке', () => {
    /*
     * Знание не устарело: вне приватного чата Telegram отклоняет web_app в
     * reply-клавиатуре с BUTTON_TYPE_INVALID. Пригодится всякому, кто решит
     * вернуть такую кнопку, — пусть узнает об этом здесь, а не в проде.
     */
    expect(canShowMiniAppButton('private')).toBe(true)
    expect(canShowMiniAppButton('group')).toBe(false)
    expect(canShowMiniAppButton('supergroup')).toBe(false)
  })

  it('подпись кнопки локализована', () => {
    expect(createMiniAppButton(true).text).toMatch(/[А-Яа-я]/)
    expect(createMiniAppButton(false).text).toMatch(/[A-Za-z]/)
  })
})
