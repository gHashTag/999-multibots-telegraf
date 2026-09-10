import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /start — ПЕРВАЯ ДВЕРЬ ДЛЯ КАЖДОГО ЧЕЛОВЕКА, И ОНА НЕ БЫЛА ПОКРЫТА НИЧЕМ.
 *
 * Найдено 07.09.2026. В репозитории есть тесты на промо-ссылки (`/start
 * neurophoto`) и на меню, но ни одного — на сам путь: пришёл незнакомый
 * человек, написал `/start`, что дальше.
 *
 * А дальше — три разные развилки, и каждая может сломаться молча:
 *
 *   нет в базе      → сцена регистрации (единственный вход в продукт);
 *   есть в базе     → главное меню;
 *   не личный чат   → отдельный ответ, БЕЗ входа в сцену.
 *
 * Цена ошибки здесь выше, чем где-либо: человек, у которого `/start` не
 * сработал, не пишет в поддержку — он уходит. И в журнале это выглядит как
 * «пришёл один апдейт», то есть никак.
 *
 * Тест гоняет НАСТОЯЩИЙ обработчик: `registerCommands` регистрирует его на
 * подставном боте, обработчик достаётся по имени команды и вызывается.
 * Проверять копию логики здесь бессмысленно — ломается именно проводка.
 */

const supabase = vi.hoisted(() => ({
  getUserDetailsSubscription: vi.fn(),
  getReferalsCountAndUserData: vi.fn(),
  createUser: vi.fn(),
}))

vi.mock('@/core/supabase', () => supabase)
vi.mock('@/store', () => ({ defaultSession: { mode: null } }))

import { registerCommands } from '@/navigation/registerCommands'

/** Подставной бот: запоминает, что на нём зарегистрировали. */
function собратьБота() {
  const команды = new Map<string, any>()
  const bot: any = {
    command(имя: string | string[], обработчик: any) {
      for (const и of Array.isArray(имя) ? имя : [имя])
        команды.set(и, обработчик)
      return bot
    },
    use: () => bot,
    on: () => bot,
    action: () => bot,
    hears: () => bot,
    catch: () => bot,
    telegram: {
      setMyCommands: vi.fn(async () => undefined),
      setChatMenuButton: vi.fn(async () => undefined),
      // `registerCommands` спрашивает бота, кто он: без этого регистрация
      // падает целиком, и ни один обработчик не встаёт на место.
      getMe: vi.fn(async () => ({ id: 1, username: 'тест_бот' })),
    },
    botInfo: { username: 'тест_бот' },
  }
  return { bot, команды }
}

function собратьКонтекст(текст = '/start', тип = 'private') {
  const сцена = {
    current: null as any,
    enter: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  }
  return {
    ctx: {
      chat: { id: 1, type: тип },
      from: { id: 4242, username: 'кто-то', language_code: 'en' },
      message: { text: текст },
      session: {} as any,
      state: {},
      scene: сцена,
      reply: vi.fn(async () => undefined),
      replyWithHTML: vi.fn(async () => undefined),
      telegram: { sendMessage: vi.fn(async () => undefined) },
      // `botInfo` нужен ответу для групп: он собирает текст из имени бота, а
      // без имени бросает — и ответ молча гаснет в catch.
      botInfo: { username: 'тест_бот' },
    } as any,
    сцена,
  }
}

describe('/start: первая дверь', () => {
  let команды: Map<string, any>

  beforeEach(() => {
    vi.clearAllMocks()
    const собранное = собратьБота()
    команды = собранное.команды
    registerCommands({ bot: собранное.bot })
  })

  it('обработчик вообще зарегистрирован', () => {
    // Без этого все проверки ниже зеленели бы на пустом месте: именно так в
    // этом репозитории дважды жили маршруты, до которых никто не доходил.
    expect(команды.has('start')).toBe(true)
  })

  it('НЕЗНАКОМЫЙ человек попадает в сцену регистрации', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: false })
    const { ctx, сцена } = собратьКонтекст()
    await команды.get('start')(ctx)
    expect(сцена.enter).toHaveBeenCalledWith('create_user_scene')
  })

  it('ЗНАКОМЫЙ человек в сцену регистрации НЕ попадает', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({
      isExist: true,
      subscriptionType: null,
    })
    const { ctx, сцена } = собратьКонтекст()
    await команды.get('start')(ctx)
    const входы = сцена.enter.mock.calls.map(c => c[0])
    expect(входы).not.toContain('create_user_scene')
  })

  it('в группе — ответ, и НИ ОДНОГО входа в сцену', async () => {
    /*
     * Telegram отказывает в web_app-кнопках вне личного чата, и отказ рушит
     * всё сообщение целиком. Вход в сцену из группы означал бы, что общая
     * беседа тащит человека в мастер.
     */
    const { ctx, сцена } = собратьКонтекст('/start', 'supergroup')
    await команды.get('start')(ctx)
    expect(сцена.enter).not.toHaveBeenCalled()
    /*
     * ПРОВЕРЯЕТСЯ КАКОЙ ОТВЕТ, А НЕ «ЧТО-ТО ОТВЕТИЛИ».
     *
     * Первая версия утверждала лишь `toHaveBeenCalled()` — и мутация «снять
     * проверку личного чата» прошла насквозь: обработчик шёл дальше, спотыкался
     * о неподготовленную базу и извинялся. Ответ был, свойство — нет.
     */
    const сказанное = String(ctx.reply.mock.calls[0]?.[0] ?? '')
    expect(сказанное).toContain('личном чате')
    expect(сказанное).not.toContain('ошибка')
  })

  it('реферальный код из ссылки доживает до сессии', async () => {
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: false })
    const { ctx } = собратьКонтекст('/start 144022504')
    await команды.get('start')(ctx)
    expect(ctx.session.inviteCode).toBe('144022504')
  })

  it('ссылка клуба доживает до сессии, а не до локальной переменной', async () => {
    // Новый человек сперва уходит в регистрацию, и локальная переменная до
    // показа клуба не дожила бы — воронка с лендинга обрывалась бы молча.
    supabase.getUserDetailsSubscription.mockResolvedValue({ isExist: false })
    const { ctx } = собратьКонтекст('/start foundry')
    await команды.get('start')(ctx)
    expect(ctx.session.foundryDeepLink).toBe(true)
  })

  it('падение базы не роняет обработчик и объясняет человеку', async () => {
    /*
     * Необработанное исключение здесь — это ТИШИНА в ответ на первое в жизни
     * сообщение боту. Человек не пишет в поддержку, он уходит.
     */
    supabase.getUserDetailsSubscription.mockRejectedValue(
      new Error('база легла')
    )
    const { ctx } = собратьКонтекст()
    await expect(команды.get('start')(ctx)).resolves.not.toThrow()
    expect(ctx.reply).toHaveBeenCalled()
  })
})
