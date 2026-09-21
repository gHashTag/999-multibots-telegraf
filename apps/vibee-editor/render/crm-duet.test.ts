/**
 * crm_duet -- the seller<->buyer duet loop with doubles for the agent, the
 * buyer model and both sessions. Spec: t27 specs/automation/crm-duet.t27.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  runDuet,
  mediaOf,
  okOf,
  reportOf,
  sellerBrief,
  buyerPersona,
  dedupeLinks,
  mediaKind,
  mediaNote,
  promisesFile,
  claimsDoneWork,
  producedWork,
  isLimitError,
  retryAllowed,
  deniedToolsFor,
  refusedOf,
  claimsFamiliarity,
  claimsLivedExperience,
  LIVED_EXPERIENCE_REWRITE,
  REWRITE_DENY_REASONS,
  DUET_DENY_REASONS,
  planNoteForSeller,
  PLAN_MEANING_RULE,
  NO_LIVED_EXPERIENCE_RULE,
  NO_PUBLISH_RULE,
  linkReelToPlan,
  namesPlan,
  reelPlanOf,
  sellerGenderSlip,
  DISCOVERY_SELLER_TURNS,
  SELLER_RETRY_PAUSE_MS,
  summaryOf,
  askBuyerModel,
  buyerRequestBody,
  PAID_TOOLS,
  TURNS_MAX,
  type DuetRun,
  type DuetDeps,
} from './src/agent/crm-duet-tool'
import { dispatchToolCall } from './src/agent/chat'
import type { ChatMessage, ToolDenial } from './src/agent/chat'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
/** An invented buyer: no real person's id appears in this repository. */
const BUYER = '900000060'
const ctx = { telegramId: OWNER, pool: {} } as unknown as ToolContext

function freshRun(over: Partial<DuetRun> = {}): DuetRun {
  return {
    id: 'duet-test',
    buyer: BUYER,
    owner: OWNER,
    turns: 2,
    dry_run: false,
    state: 'running',
    started_at: new Date(0).toISOString(),
    transcript: [],
    coverage: {},
    paid_calls: 0,
    media_sent: 0,
    violations: [],
    voice_flags: [],
    ...over,
  }
}

type Sent = { from: string; to: string; text?: string; url?: string }

function deps(
  sellerScript: Array<Array<Record<string, unknown>>>,
  buyerScript: string[]
): {
  d: DuetDeps
  sent: Sent[]
  histories: ChatMessage[][]
  slept: number[]
  denies: Array<ReadonlySet<string> | undefined>
} {
  const sent: Sent[] = []
  const histories: ChatMessage[][] = []
  const slept: number[] = []
  const denies: Array<ReadonlySet<string> | undefined> = []
  let s = 0
  let b = 0
  const d: DuetDeps = {
    agent: (history, _ctx, opts) => {
      histories.push(history.map(m => ({ ...m })))
      denies.push(opts?.denyTools)
      const events = sellerScript[s++] ?? []
      return (async function* () {
        for (const e of events) yield e as never
      })()
    },
    buyerModel: async () => buyerScript[b++] ?? '',
    sendText: async (from, to, text) => {
      sent.push({ from: String(from.telegramId), to, text })
    },
    sendMedia: async (from, to, url) => {
      sent.push({ from: String(from.telegramId), to, url })
    },
    now: () => 1000,
    sleep: async ms => {
      slept.push(ms)
    },
  }
  return { d, sent, histories, slept, denies }
}

const text = (t: string) => ({ тип: 'текст', текст: t }) // cyrillic-ok
const result = (name: string, value: unknown, ms = 5) => ({
  тип: 'результат', // cyrillic-ok
  имя: name, // cyrillic-ok
  значение: value, // cyrillic-ok
  мс: ms, // cyrillic-ok
})

describe('crm_duet loop', () => {
  it('seller opens, sides alternate, sends go from the right session to the right person', async () => {
    const { d, sent } = deps(
      [
        [result('pricing', { ok: true }), text('Привет! Показать прайс?')],
        [text('Вот пример поста про 72 плана.')],
      ],
      ['Да, покажите цены.', 'Спасибо, беру пример.']
    )
    const run = await runDuet(freshRun(), ctx, d)
    expect(run.state).toBe('done')
    expect(run.transcript.map(t => t.from)).toEqual([
      'seller',
      'buyer',
      'seller',
      'buyer',
    ])
    expect(sent.map(x => `${x.from}->${x.to}`)).toEqual([
      `${OWNER}->${BUYER}`,
      `${BUYER}->${OWNER}`,
      `${OWNER}->${BUYER}`,
      `${BUYER}->${OWNER}`,
    ])
    expect(run.transcript.every(t => t.sent)).toBe(true)
    expect(run.coverage.pricing).toEqual({ calls: 1, ok: 1, fail: 0 })
    expect(run.paid_calls).toBe(0)
  })

  it('the buyer hears the seller and the seller hears the buyer, with the brief first', async () => {
    const { d, histories } = deps(
      [[text('Здравствуйте.')], [text('Ок.')]],
      ['Кто вы?', 'Ясно.']
    )
    await runDuet(freshRun(), ctx, d)
    expect(histories[0][0].role).toBe('user')
    expect(histories[0][0].content).toContain('Лила Чакра')
    expect(histories[1].at(-1)?.content).toContain(
      'Покупатель (@playom): Кто вы?'
    )
  })

  it('a finished generation is forwarded as media and counted as paid; a failed one is not', async () => {
    const { d, sent } = deps(
      [
        [
          result('image_generate', {
            сделано: true, // cyrillic-ok
            url: 'https://cdn.example/leela.png',
          }), // cyrillic-ok
          result('audio_generate', { сделано: false, причина: 'нет токенов' }), // cyrillic-ok
          text('Картинка для игры готова.'),
        ],
      ],
      ['Красиво.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.paid_calls).toBe(2)
    expect(run.media_sent).toBe(1)
    expect(run.coverage.audio_generate).toEqual({ calls: 1, ok: 0, fail: 1 })
    expect(sent.filter(x => x.url)).toEqual([
      { from: OWNER, to: BUYER, url: 'https://cdn.example/leela.png' },
    ])
    expect(run.transcript[0].media).toEqual(['https://cdn.example/leela.png'])
  })

  it('dry_run keeps everything off Telegram but keeps the transcript', async () => {
    const { d, sent } = deps([[text('Привет.')]], ['Привет.'])
    const run = await runDuet(freshRun({ turns: 1, dry_run: true }), ctx, d)
    expect(sent).toEqual([])
    expect(run.transcript).toHaveLength(2)
    expect(run.transcript.every(t => t.sent === false)).toBe(true)
    expect(reportOf(run)).toContain('dry_run')
  })

  it('a silent seller ends the run without sending an empty message', async () => {
    const { d, sent } = deps([[]], ['…'])
    const run = await runDuet(freshRun({ turns: 2 }), ctx, d)
    // crm-duet.t27 ABORTED_RUN_STATE: a run that did not play every turn is
    // failed, not done, and keeps the turn's error.
    expect(run.state).toBe('failed')
    expect(run.error).toBe('turn 0: seller produced no text')
    expect(run.transcript).toHaveLength(1)
    expect(run.transcript[0].error).toBe('seller produced no text')
    expect(sent).toEqual([])
  })

  it('a send failure marks the run failed with the reason and stops', async () => {
    const { d } = deps([[text('Привет.')]], ['Привет.'])
    d.sendText = async () => {
      throw new Error('FLOOD_WAIT_30')
    }
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.error).toBe('FLOOD_WAIT_30')
    expect(run.transcript[0].sent).toBe(false)
  })

  it('a forbidden tool call is reported as a violation, not hidden', async () => {
    const { d } = deps(
      [[result('tg_send', { ok: true }), text('Отправил.')]],
      ['?']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.violations).toEqual(['turn 0: tg_send'])
    expect(reportOf(run)).toContain('Нарушения брифа')
  })

  it('button markers are stripped from the seller text before it is sent', async () => {
    const { d, sent } = deps([[text('Смотри [[Прайс|pricing]] сюда.')]], ['ок'])
    await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(sent[0].text).toBe('Смотри  сюда.')
  })
})

describe('crm_duet helpers', () => {
  it('mediaOf accepts only a finished generation with an http url', () => {
    const done = { сделано: true, url: 'https://x/y.png' } // cyrillic-ok
    expect(mediaOf(done)).toBe('https://x/y.png')
    expect(mediaOf({ сделано: false, url: 'https://x/y.png' })).toBeNull() // cyrillic-ok
    expect(mediaOf({ сделано: true, url: '/relative.png' })).toBeNull() // cyrillic-ok
    expect(mediaOf({ url: 'https://x/y.png' })).toBeNull()
    expect(mediaOf('https://x/y.png')).toBeNull()
    // reel_render speaks gotovo, not sdelano -- run duet-mtzo7ogz lost its mp4 here
    expect(
      mediaOf({ готово: true, renderId: 'r1', url: 'https://x/reel.mp4' })
    ).toBe(
      // cyrillic-ok
      'https://x/reel.mp4'
    )
    expect(mediaOf({ готово: false, renderId: 'r1' })).toBeNull() // cyrillic-ok
  })

  it('okOf reads the tools\u2019 own failure shapes', () => {
    expect(okOf({ сделано: false })).toBe(false) // cyrillic-ok
    expect(okOf({ ошибка: 'нет ключа' })).toBe(false) // cyrillic-ok
    expect(okOf({ error: 'boom' })).toBe(false)
    expect(okOf({ готово: false, причина: 'не уложился' })).toBe(false) // cyrillic-ok
    expect(okOf({ началось: false, причина: 'нет токенов' })).toBe(false) // cyrillic-ok
    expect(okOf({ ok: true })).toBe(true)
    expect(okOf([1, 2])).toBe(true)
  })

  it('the briefs carry the Leela canon and the honesty rules; the paid set has five tools', () => {
    const brief = sellerBrief(BUYER)
    expect(brief).toContain('72 планов')
    expect(brief).toContain('t27.ai/leela')
    expect(brief).toContain('discovery')
    expect(brief).toContain('LeelaPlanReel')
    expect(brief).toContain('leela_plan')
    expect(brief).toContain('Профиль клиента не настроен')
    expect(brief).toContain('Не вызывай tg_*')
    expect(brief).toContain('не больше одного раза')
    expect(brief).toContain('Здесь нет правильного ответа')
    expect(brief).not.toContain('не больше трёх')
    expect(buyerPersona()).toContain('@playom')
    expect(buyerPersona('Я хозяйка стола.')).toContain('Я хозяйка стола.')
    expect(PAID_TOOLS.size).toBe(5)
    expect(TURNS_MAX).toBe(8)
  })

  it('an installed client profile is quoted into the brief: discovery questions, series, forbidden claims, her template', () => {
    const profile = {
      name: 'Гея',
      handle: '@playom',
      status: 'draft',
      role: 'Хранительница Лилы',
      business: {
        product: 'Лила — игра самопознания',
        surfaces: ['@leela_chakra_ai_bot'],
      },
      audience_hypotheses: ['новичок после первого броска'],
      discovery_questions: ['Где живёт ваша аудитория?'],
      content_series: [
        { rubric: 'устройство партии', ideas: ['вход с шестёрки'] },
      ],
      forbidden_claims: ['первый / единственный / лучший'],
      reel_template: { composition: 'LeelaPlanReel' },
      approved_cta: { text: 'Приходите на доску.', button: '🎲 Играть' },
    }
    const brief = sellerBrief(BUYER, profile)
    expect(brief).toContain('Гея (@playom)')
    expect(brief).toContain('Где живёт ваша аудитория?')
    expect(brief).toContain('новичок после первого броска')
    expect(brief).toContain('устройство партии: вход с шестёрки')
    expect(brief).toContain('первый / единственный / лучший')
    expect(brief).toContain('«Приходите на доску.»')
    expect(brief).not.toContain('Профиль клиента не настроен')
  })

  it('a link already sent is dropped from a later line; the first stays', () => {
    const sent = new Set<string>()
    const a = dedupeLinks('Играть: https://t27.ai/leela/ — посмотрите.', sent)
    expect(a.text).toContain('https://t27.ai/leela/')
    expect(a.dropped).toEqual([])
    const b = dedupeLinks('Ещё раз ссылка https://t27.ai/leela/ и бот.', sent)
    expect(b.text).not.toContain('https://')
    expect(b.dropped).toEqual(['https://t27.ai/leela/'])
  })

  it('a pressure word costs the seller one correction round; the rewrite is what is sent and the flag is reported', async () => {
    const { d, sent, histories } = deps(
      [
        [text('Сегодня последний шанс, вы молодец!')],
        [text('Расскажите, где сейчас живёт ваша аудитория?')],
        [text('Спокойно продолжим.')],
      ],
      ['В канале.', 'Хорошо.']
    )
    const run = await runDuet(freshRun(), ctx, d)
    expect(run.state).toBe('done')
    expect(run.voice_flags.length).toBe(1)
    expect(run.voice_flags[0]).toMatch(/turn 0/)
    expect(sent[0].text).toBe('Расскажите, где сейчас живёт ваша аудитория?')
    expect(histories[1].at(-1)?.content).toContain('Проверка голоса')
    expect(reportOf(run)).toContain('Проверка голоса')
  })

  it('the profile is read by the duet itself: the brief carries her name, the buyer borrows her SOUL, off-brand generations are flagged', async () => {
    const { d, histories } = deps(
      [
        [
          result('image_generate', { ok: true, url: 'https://x/y.jpg' }),
          text('Смотрите пример.'),
        ],
      ],
      ['Это не в стиле игры.']
    )
    d.clientProfile = async () => ({
      has_profile: true,
      profile: {
        name: 'Гея',
        handle: '@playom',
        reel_template: { composition: 'LeelaPlanReel' },
      },
      soul_excerpt: 'Я хозяйка стола.',
    })
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.profile_used).toBe(true)
    expect(histories[0][0].content).toContain('Гея (@playom)')
    expect(run.violations.some(v => /image_generate/.test(v))).toBe(true)
  })

  it('without a profile the run says so in the report', async () => {
    const { d } = deps([[text('Здравствуйте.')]], ['Кто вы?'])
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.profile_used).toBe(false)
    expect(reportOf(run)).toContain('crm_client_setup')
  })
})

/*
 * Duet duet-mub68idg, 2026-09-21, judged afterwards (gHashTag/t27#4522).
 * Invented ids only: the owner, the buyer, and a stranger whose plan must
 * never be touched.
 */
const JUDGED_OWNER = '900000050'
const JUDGED_BUYER = '900000051'
const STRANGER = '900000052'
const judgedCtx = (pool: unknown = {}) =>
  ({ telegramId: JUDGED_OWNER, pool }) as unknown as ToolContext
const judgedRun = (over: Partial<DuetRun> = {}) =>
  freshRun({
    id: 'duet-judged',
    buyer: JUDGED_BUYER,
    owner: JUDGED_OWNER,
    ...over,
  })
const announce = (name: string, args: unknown) => ({
  ['тип']: 'инструмент', // cyrillic-ok: event envelope
  ['имя']: name, // cyrillic-ok: event envelope
  ['аргументы']: JSON.stringify(args), // cyrillic-ok: event envelope
})
const LIVE_LIVED =
  'да, я сам бросал кубик и читал планы, это моя ежедневная работа'

describe('crm_duet: no lived experience (t27#4522 NO_LIVED_EXPERIENCE_CLAIM)', () => {
  it('fires on the live sentence and on first-person practice', () => {
    expect(claimsLivedExperience(LIVE_LIVED)).toBe(true)
    // The live sentence trips two rules at once; each gets its own line here,
    // or a broken rule hides behind the other.
    for (const s of [
      'Я сам бросал кубик в Лиле.',
      'Это моя ежедневная работа.',
      'Я лично играл в Лилу много раз.',
      'Я не раз проходил поле до 68.',
      'Мы сами играем в Лилу каждую неделю.',
      'Моя ежедневная практика — читать план утром.',
      'По своему опыту скажу: первый бросок волнует.',
      'Мне сразу выпала шестёрка.',
      'Я сам читал этот план много раз.',
    ])
      expect(claimsLivedExperience(s), s).toBe(true)
  })

  /*
   * Review of PR #2709: close rewordings of the live sentence were quiet --
   * an adverb between the subject and the verb, a dropped pronoun, the object
   * first, a perfective verb, a habit after the verb, "from experience" with
   * a first-person verb, and "you" in a sentence that is still the speaker's.
   * These are what a rewrite round is likely to produce, so the promise "a
   * second miss is reported" depends on catching them.
   */
  it('fires on close rewordings of the live sentence', () => {
    for (const s of [
      'Да, я уже бросал кубик.',
      'Да, я и правда бросал кубик.',
      'Да, я действительно играл в Лилу.',
      'Сам бросал кубик, это моя работа каждый день.',
      'Да, сам бросал кубик.',
      'Я бросил кубик и прочитал план.',
      'Я кубик бросал каждый день.',
      'Я сам уже много раз играл.',
      'Я тоже когда-то играл в Лилу.',
      'Я сыграл в Лилу вчера.',
      'Я сам через это прошёл.',
      'Я прошёл поле до 68.',
      'Мы прошли всё поле до 68.',
      'Я читаю планы каждое утро.',
      'Я каждое утро читаю план.',
      'Скажу по опыту: первый бросок волнует.',
      'Знаю по себе: первый бросок волнует.',
      'это моя работа каждый день',
      'По своему опыту скажу вам: первый бросок волнует.',
      'По своему опыту скажу: вы почувствуете волнение.',
      // No "I will tell" to lean on: "his own experience" alone, with "you"
      // in the next clause, or "you" in the dative.
      'По своему опыту: вы почувствуете волнение на первом броске.',
      'По своему опыту подскажу вам: первый бросок волнует.',
    ])
      expect(claimsLivedExperience(s), s).toBe(true)
  })

  it('the wider net still lets through sends, negations, other subjects and conditionals', () => {
    for (const s of [
      // "threw" is slang for "sent"
      'Я уже кидал вам ссылку на приложение.',
      'Я бросил вам ссылку на бота.',
      // a negation or a new clause ends the chain
      'Я никогда не играл в Лилу.',
      'Я ещё не бросал кубик.',
      'Я давно не играл.',
      'Я знаю, кто играл в Лилу вчера.',
      'Я знаю кто играл в Лилу.',
      // somebody else does the playing
      'Сам игрок бросал кубик и читал план.',
      'Сами игроки бросали кубик.',
      'Тоже играли в Лилу?',
      'Я понимаю, что игроки бросают кубик каждый день.',
      // "his own experience" is the nominative subject's of its clause
      'По своему опыту вы поймёте, какой план ваш.',
      // a conditional is not a memory
      'Я на вашем месте играл бы по плану.',
      'Я бы играл по плану 6.',
      // tool work and an honest job description
      'Я прочитал план 6 и собрал ролик.',
      'Я читал текст плана 6 в этом ходу.',
      'Я уже прошёл по вашему каналу и посмотрел посты.',
      'Моя работа — собрать ролик вашим шаблоном.',
    ])
      expect(claimsLivedExperience(s), s).toBe(false)
  })

  it('stays quiet on offers, production, negation and talk about the product', () => {
    for (const s of [
      'Я могу собрать один ролик вашим шаблоном.',
      'Я собрал пробный ролик по плану 6.',
      'Я сам не играл — скажу по тексту плана.',
      'Я прочитал текст плана 6 из канона.',
      'Я не видел ни кадра.',
      'Игроки бросают кубик и читают план — это их ежедневная практика.',
      'Вы сами бросаете кубик и читаете текст плана.',
      'Каждый игрок читает план по своему опыту.',
      'Если выпала шестёрка, вы входите на поле.',
      'Сама игра старше любого ролика.',
      'Я прошёл по вашим постам в канале.',
    ])
      expect(claimsLivedExperience(s), s).toBe(false)
  })

  it('the live line gets one rewrite about the product; the rewrite goes out and the miss is reported', async () => {
    const REWRITE =
      'В Лиле игрок бросает кубик и читает текст плана — так устроена игра. Какой план вам ближе?'
    const { d, sent, histories } = deps(
      [[text(LIVE_LIVED)], [text(REWRITE)]],
      ['Шестой.']
    )
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(), d)
    expect(histories).toHaveLength(2)
    expect(histories[1].at(-1)?.content).toContain(LIVED_EXPERIENCE_REWRITE)
    expect(sent[0].text).toBe(REWRITE)
    expect(run.transcript[0].text).toBe(REWRITE)
    expect(run.violations).toEqual([
      'turn 0: личный опыт от лица человека — переписано',
    ])
  })

  it('a second miss is sent as is and reported; a later turn is checked too', async () => {
    const { d, sent } = deps(
      [
        [text('Здравствуйте. Кому вы играете чаще?')],
        [text('Понял. Какой план ближе?')],
        [text(LIVE_LIVED)],
        [text('Я лично играл в Лилу, поверьте.')],
      ],
      ['Новичкам.', 'Шестой.', 'Хорошо.']
    )
    const run = await runDuet(judgedRun({ turns: 3 }), judgedCtx(), d)
    expect(sent.filter(x => x.from === JUDGED_OWNER).at(-1)?.text).toBe(
      'Я лично играл в Лилу, поверьте.'
    )
    expect(run.violations).toEqual([
      'turn 4 (после правки): личный опыт от лица человека',
    ])
  })
})

/*
 * THE AGENT DOUBLE OBEYS THE DENIAL THE WAY runAgent DOES.
 *
 * A scripted result for a tool the call's options deny is replaced by what
 * the REAL dispatcher answers for it (dispatchToolCall, which refuses before
 * any handler) -- so a test about the gate cannot pass on a double that
 * decided the refusal itself. Every call's options are recorded.
 */
function obeyDenial(d: DuetDeps): Array<ToolDenial | undefined> {
  const seen: Array<ToolDenial | undefined> = []
  const agent = d.agent
  d.agent = (h, c, o) => {
    seen.push(o)
    return (async function* () {
      for await (const ev of agent(h, c, o)) {
        const e = ev as unknown as Record<string, unknown>
        // Quoted keys: the event envelope's own field names.
        const name = String(e['имя'] ?? '')
        const isResult = e['тип'] === 'результат'
        if (!isResult || !o?.denyTools?.has(name)) {
          yield ev
          continue
        }
        const gen = dispatchToolCall({ function: { name } }, c, o)
        let step = await gen.next()
        while (!step.done) step = await gen.next()
        yield result(name, step.value) as never
      }
    })()
  }
  return seen
}

describe('crm_duet: a rewrite round changes words, not work (review of #2709)', () => {
  const U = 'https://bucket.example/renders/leela-plan-6.mp4'
  const U2 = 'https://bucket.example/renders/leela-plan-6-again.mp4'
  const reel = (url: string) => [
    announce('reel_render', {
      compositionId: 'LeelaPlanReel',
      props: { plan: 6 },
    }),
    result('reel_render', { ['готово']: true, url }), // cyrillic-ok: tool result key
  ]
  const REWRITTEN =
    'В Лиле игрок бросает кубик и читает текст плана — так устроена игра. Какой план вам ближе?'

  it('after discovery, a lived-experience rewrite cannot render again, pay again, publish or send a second file', async () => {
    const { d, sent, histories } = deps(
      [
        [text('Здравствуйте. Кому вы играете чаще?')],
        [text('Понял. Какой план ближе?')],
        // Turn 4, first attempt: a real reel, and the live line.
        [...reel(U), text(LIVE_LIVED)],
        // The rewrite tries to render again.
        [...reel(U2), text(REWRITTEN)],
      ],
      ['Новичкам.', 'Шестой.', 'Вижу.']
    )
    d.clientProfile = noProfile
    const seen = obeyDenial(d)
    const run = await runDuet(judgedRun({ turns: 3 }), judgedCtx(), d)

    expect(run.state).toBe('done')
    expect(seen).toHaveLength(4)
    // Every call of the run carries the publish ban, the rewrite included.
    for (const o of seen) expect(o?.denyTools?.has('feed_publish')).toBe(true)
    // The turn itself may render (discovery is over); its rewrite may not.
    expect(seen[2]?.denyTools?.has('reel_render')).toBe(false)
    for (const t of PAID_TOOLS) expect(seen[3]?.denyTools?.has(t), t).toBe(true)
    expect(seen[3]?.denyReasons?.get('reel_render')).toBe(
      REWRITE_DENY_REASONS.get('reel_render')
    )
    // One reel paid for, one file sent -- the first attempt's.
    expect(run.paid_calls).toBe(1)
    expect(run.media_sent).toBe(1)
    expect(sent.filter(x => x.url).map(x => x.url)).toEqual([U])
    expect(sent.find(x => x.text)?.text).not.toBe(LIVE_LIVED)
    expect(run.violations).toEqual([
      'turn 4: личный опыт от лица человека — переписано',
      'turn 4: reel_render на правке реплики — отклонён',
    ])
    // The rewrite is told the reel of this turn already exists.
    expect(histories[3].at(-1)?.content).toContain(LIVED_EXPERIENCE_REWRITE)
    expect(histories[3].at(-1)?.content).toContain(U)
  })

  it('every rewrite round runs under the rewrite gate: voice, done work, familiarity, lived', async () => {
    const { d } = deps(
      [
        // Turn 0: pressure; its rewrite assumes an agreement; that rewrite
        // claims lived practice; the last one is clean.
        [text('Срочно: скажу по делу. Кому вы играете?')],
        [text('Как договорились, пишу вам. Кому вы играете?')],
        [text('Я сам бросал кубик. Кому вы играете?')],
        [text('Здравствуйте. Кому вы играете чаще?')],
        // Turn 2: claimed work with no tool.
        [text('Я уже собрал готовый ролик по плану 6.')],
        [text('Могу собрать один пример вашим шаблоном. Какой план?')],
      ],
      ['Новичкам.', 'Шестой.']
    )
    const seen = obeyDenial(d)
    const run = await runDuet(judgedRun({ turns: 2 }), judgedCtx(), d)
    expect(seen).toHaveLength(6)
    expect(run.voice_flags[0]).toContain('turn 0')
    expect(run.violations).toEqual([
      'turn 0: ссылка на несуществующую договорённость — переписано',
      'turn 0: личный опыт от лица человека — переписано',
      'turn 2: заявлена сделанная работа без инструмента — переписано',
    ])
    // Calls 1, 2, 3 (voice, familiarity, lived) and 5 (done work) are rewrites.
    for (const k of [1, 2, 3, 5]) {
      expect(seen[k]?.denyReasons, `call ${k}`).toBe(REWRITE_DENY_REASONS)
      for (const t of [...PAID_TOOLS, 'feed_publish'])
        expect(seen[k]?.denyTools?.has(t), `call ${k}: ${t}`).toBe(true)
    }
  })

  it('the same file twice in one turn reaches her once', async () => {
    const { d, sent } = deps(
      [
        [
          ...reel(U),
          ...reel(U),
          text('Собрал пример по плану 6. Что не в стиле?'),
        ],
      ],
      ['Вижу.']
    )
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(), d)
    expect(sent.filter(x => x.url).map(x => x.url)).toEqual([U])
    expect(run.media_sent).toBe(1)
    expect(run.transcript[0].media).toEqual([U])
  })
})

describe('crm_duet: the brief names the judged rules (t27#4522)', () => {
  it('the brief the seller receives says: meaning from leela_plan, no lived experience, no feed_publish', async () => {
    const { d, histories } = deps([[text('Здравствуйте.')]], ['Кто вы?'])
    await runDuet(judgedRun({ turns: 1 }), judgedCtx(), d)
    const brief = histories[0][0].content
    expect(brief).toContain(PLAN_MEANING_RULE)
    expect(brief).toContain(NO_LIVED_EXPERIENCE_RULE)
    expect(brief).toContain(NO_PUBLISH_RULE)
    expect(PLAN_MEANING_RULE).toContain(
      'только из ответа leela_plan в этом же ходу'
    )
  })
})

describe('crm_duet: persona consent is not consent (t27#4522)', () => {
  it('every seller turn hands the agent the publish ban and the reason it may read', async () => {
    const { d } = deps(
      [[text('Здравствуйте.')], [text('Ясно.')], [text('Хорошо.')]],
      ['a', 'b', 'c']
    )
    const seen: Array<ToolDenial | undefined> = []
    const agent = d.agent
    d.agent = (h, c, o) => {
      seen.push(o)
      return agent(h, c, o)
    }
    await runDuet(judgedRun({ turns: 3 }), judgedCtx(), d)
    expect(seen).toHaveLength(3)
    for (const o of seen) {
      expect(o?.denyTools?.has('feed_publish')).toBe(true)
      expect(o?.denyReasons?.get('feed_publish')).toContain(
        'не одобрение клиента'
      )
    }
  })

  it('a refused feed_publish is reported once, as the ban, and is not a paid call', async () => {
    const refusal = {
      ['ошибка']: 'инструмент feed_publish недоступен на этом ходу', // cyrillic-ok: tool result key
      ['отказано']: true, // cyrillic-ok: tool result key
    }
    const { d } = deps(
      [[result('feed_publish', refusal), text('Ролик уже у вас в чате.')]],
      ['Хорошо.']
    )
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(), d)
    expect(run.paid_calls).toBe(0)
    expect(run.violations).toEqual([
      'turn 0: feed_publish в дуэте — отклонён (согласие персоны не согласие клиента)',
    ])
  })

  it('a feed_publish that got past the ban is still reported', async () => {
    const { d } = deps(
      [[result('feed_publish', { ok: true }), text('Смотрите в ленте.')]],
      ['Хорошо.']
    )
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(), d)
    expect(run.violations).toContain('turn 0: feed_publish')
  })
})

/*
 * A POOL DOUBLE THAT DOES NOT AGREE WITH THE CALLER (blind-guards forms 1, 21).
 *
 * It knows the real columns of content_plan_items and throws on any other
 * identifier; it filters rows ONLY by the conditions the SQL actually states,
 * so a dropped `telegram_id = $1` returns a stranger's card here exactly as it
 * would in Postgres; the status it writes is read from the SQL, not assumed.
 */
type PlanItem = {
  id: number
  telegram_id: string
  title: string
  note: string | null
  status: string
  template_id: string | null
}
const PLAN_COLUMNS = new Set([
  'id',
  'goal_id',
  'telegram_id',
  'title',
  'note',
  'status',
  'template_id',
  'created_at',
  'updated_at',
])
const SQL_WORDS = new Set(
  (
    'select from where and or in order by update set returning now is not ' +
    'distinct null content_plan_items'
  ).split(' ')
)

function planPool(items: PlanItem[], afterSelect?: () => void) {
  const queries: string[] = []
  const pool = {
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql)
      const bare = sql.replace(/'[^']*'/g, ' ').replace(/\$\d+/g, ' ')
      for (const w of bare.toLowerCase().match(/[a-z_]+/g) ?? [])
        if (!PLAN_COLUMNS.has(w) && !SQL_WORDS.has(w))
          throw new Error(`column "${w}" does not exist`)
      if (/^\s*SELECT/i.test(sql)) {
        let out = items
        if (/telegram_id = \$1/.test(sql))
          out = out.filter(r => r.telegram_id === params[0])
        if (/template_id = \$2/.test(sql))
          out = out.filter(r => r.template_id === params[1])
        const within = sql.match(/status IN \(([^)]*)\)/)
        if (within) {
          const allowed = (within[1].match(/'[a-z]+'/g) ?? []).map(x =>
            x.slice(1, -1)
          )
          out = out.filter(r => allowed.includes(r.status))
        }
        if (/ORDER BY id/.test(sql)) out = [...out].sort((a, b) => a.id - b.id)
        const rows = out.map(r => ({
          id: r.id,
          title: r.title,
          note: r.note,
          status: r.status,
        }))
        afterSelect?.()
        return { rows }
      }
      if (/^\s*UPDATE content_plan_items/i.test(sql)) {
        let target = items
        if (/WHERE id = \$1/.test(sql))
          target = target.filter(r => r.id === params[0])
        if (/telegram_id = \$2/.test(sql))
          target = target.filter(r => r.telegram_id === params[1])
        if (/status = \$4/.test(sql))
          target = target.filter(r => r.status === params[3])
        if (/note IS NOT DISTINCT FROM \$5/.test(sql))
          target = target.filter(r => r.note === (params[4] ?? null))
        const status = sql.match(/SET status = '([a-z]+)'/)?.[1]
        for (const r of target) {
          if (status) r.status = status
          if (/note = \$3/.test(sql)) r.note = String(params[2])
        }
        return { rows: target.map(r => ({ id: r.id })) }
      }
      throw new Error(`unexpected query: ${sql.slice(0, 60)}`)
    },
  }
  return { pool, queries }
}

const PLAN6_TITLE = 'Вход только с шестёрки — план 6 «Заблуждение (моха)»'
const PLAN6_NOTE =
  'План 6. Крючок: «Следующий ход — не обязательно следующий бросок».'
const item = (
  id: number,
  telegram_id: string,
  title: string,
  note: string | null,
  template_id: string | null = 'LeelaPlanReel'
): PlanItem => ({ id, telegram_id, title, note, status: 'idea', template_id })

function herPlan(): PlanItem[] {
  return [
    // Lower ids first: a dropped condition would pick these before hers.
    item(1, STRANGER, PLAN6_TITLE, PLAN6_NOTE),
    item(2, JUDGED_BUYER, 'Мой план 6, своими словами', null, null),
    item(
      3,
      JUDGED_BUYER,
      '68 на старте — ещё не победа',
      'План 68. Победа — только точное попадание.'
    ),
    item(4, JUDGED_BUYER, PLAN6_TITLE, PLAN6_NOTE),
    item(
      5,
      JUDGED_BUYER,
      '46 → 62: стрела Различения',
      'План 46. Аджна → Сахасрара.'
    ),
  ]
}
const REEL_URL = 'https://bucket.example/renders/leela-plan-6.mp4'
const reelTurn = (props: Record<string, unknown> = { plan: 6, hook: 'h' }) => [
  announce('leela_plan', { plan: 6 }),
  result('leela_plan', { plan: 6, title: 'Заблуждение (моха)' }),
  announce('reel_render', { compositionId: 'LeelaPlanReel', props }),
  result('reel_render', { ['готово']: true, url: REEL_URL }), // cyrillic-ok: tool result key
  text('Собрал пример по плану 6 вашим шаблоном. Что в нём не в стиле?'),
]
const noProfile = async () => ({ has_profile: false })

describe('crm_duet: what was made goes into HER plan (t27#4522)', () => {
  it('a reel for plan 6 moves her plan-6 card from idea to doing with the reel in its note; nothing else moves', async () => {
    const items = herPlan()
    const before = JSON.parse(JSON.stringify(items)) as PlanItem[]
    const { pool } = planPool(items)
    const { d } = deps([reelTurn()], ['Вижу ролик.'])
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(run.state).toBe('done')
    const card = items.find(r => r.id === 4)!
    expect(card.status).toBe('doing')
    expect(card.note).toContain(PLAN6_NOTE)
    expect(card.note).toContain(REEL_URL)
    expect(items.filter(r => r.id !== 4)).toEqual(
      before.filter(r => r.id !== 4)
    )
    expect(run.transcript[0].plan_item).toMatchObject({
      plan: 6,
      result: 'moved',
      item_id: 4,
      url: REEL_URL,
    })
    expect(reportOf(run)).toContain('idea → doing')
  })

  it('without props.plan the ONE plan looked up names the card; two different lookups name none and touch nothing', async () => {
    const items = herPlan()
    const { pool } = planPool(items)
    const { d } = deps([reelTurn({ hook: 'h' })], ['Вижу.'])
    d.clientProfile = noProfile
    await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(items.find(r => r.id === 4)!.status).toBe('doing')

    const two = planPool(herPlan())
    const second = deps(
      [
        [
          announce('leela_plan', { plan: 12 }),
          result('leela_plan', { plan: 12, title: 'Зависть' }),
          ...reelTurn({ hook: 'h' }),
        ],
      ],
      ['Вижу.']
    )
    second.d.clientProfile = noProfile
    const run = await runDuet(
      judgedRun({ turns: 1 }),
      judgedCtx(two.pool),
      second.d
    )
    expect(two.queries).toEqual([])
    expect(run.transcript[0].plan_item?.result).toBe('plan_unknown')
    expect(reportOf(run)).toContain('в план не записан')
  })

  it('no matching card: nothing is written and the report says so', async () => {
    const items = herPlan().filter(r => r.id !== 4)
    const before = JSON.parse(JSON.stringify(items))
    const { pool, queries } = planPool(items)
    const { d } = deps([reelTurn()], ['Вижу.'])
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(items).toEqual(before)
    expect(queries.filter(q => /UPDATE/.test(q))).toEqual([])
    expect(run.transcript[0].plan_item?.result).toBe('no_row')
    expect(reportOf(run)).toContain('ничего не записано')
  })

  it('a card already in work stays doing -- never done -- and gains the reel in its note', async () => {
    const items = herPlan()
    const card = items.find(r => r.id === 4)!
    card.status = 'doing'
    card.note = `${PLAN6_NOTE}\nhttps://bucket.example/renders/earlier.mp4`
    const { pool } = planPool(items)
    const { d } = deps([reelTurn()], ['Вижу.'])
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(card.status).toBe('doing')
    expect(card.note).toContain('earlier.mp4')
    expect(card.note).toContain(REEL_URL)
    expect(run.transcript[0].plan_item?.result).toBe('noted')
  })

  it('a published card is never pulled back into work', async () => {
    const items = herPlan()
    const card = items.find(r => r.id === 4)!
    card.status = 'done'
    const { pool } = planPool(items)
    const { d } = deps([reelTurn()], ['Вижу.'])
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(card).toMatchObject({ status: 'done', note: PLAN6_NOTE })
    expect(run.transcript[0].plan_item?.result).toBe('no_row')
  })

  it('her edit between the read and the write wins: the card is not touched', async () => {
    const items = herPlan()
    const card = items.find(r => r.id === 4)!
    const { pool } = planPool(items, () => {
      card.note = 'Моя правка.'
    })
    const { d } = deps([reelTurn()], ['Вижу.'])
    d.clientProfile = noProfile
    const run = await runDuet(judgedRun({ turns: 1 }), judgedCtx(pool), d)
    expect(card).toMatchObject({ status: 'idea', note: 'Моя правка.' })
    expect(run.transcript[0].plan_item?.result).toBe('changed')
  })

  it('a dry run leaves her plan alone', async () => {
    const { pool, queries } = planPool(herPlan())
    const { d } = deps([reelTurn()], ['Вижу.'])
    d.clientProfile = noProfile
    const run = await runDuet(
      judgedRun({ turns: 1, dry_run: true }),
      judgedCtx(pool),
      d
    )
    expect(queries).toEqual([])
    expect(run.transcript[0].plan_item?.result).toBe('dry_run')
  })

  it('linkReelToPlan reads only her LeelaPlanReel cards and answers without a database', async () => {
    const { pool } = planPool(herPlan())
    const r = await linkReelToPlan(pool, {
      buyer: JUDGED_BUYER,
      plan: 68,
      url: REEL_URL,
      runId: 'duet-x',
    })
    expect(r).toMatchObject({ result: 'moved', item_id: 3 })
    expect(
      await linkReelToPlan(undefined, {
        buyer: JUDGED_BUYER,
        plan: 6,
        url: REEL_URL,
        runId: 'duet-x',
      })
    ).toMatchObject({ result: 'failed' })
  })

  it('namesPlan: "plan N" in title or note, or a leading N -- never a bare N elsewhere', () => {
    const [, , p68, p6, p46] = herPlan()
    expect(namesPlan(p6, 6)).toBe(true)
    expect(namesPlan(p68, 6)).toBe(false)
    expect(namesPlan(p68, 68)).toBe(true)
    expect(namesPlan(p46, 46)).toBe(true)
    expect(namesPlan(p46, 62)).toBe(false)
    expect(namesPlan({ title: '12 → 8: змея Зависти', note: null }, 8)).toBe(
      false
    )
    expect(namesPlan({ title: 'x', note: 'План 17. Стрела.' }, 17)).toBe(true)
    expect(namesPlan({ title: 'x', note: 'План 17. Стрела.' }, 1)).toBe(false)
  })

  it('reelPlanOf: props first, else one lookup; another composition is not her plan', () => {
    const reel = (args?: Record<string, unknown>) => ({
      name: 'reel_render',
      value: {},
      ms: 1,
      ...(args ? { args } : {}),
    })
    const leela = (props: Record<string, unknown>) =>
      reel({ compositionId: 'LeelaPlanReel', props })
    expect(reelPlanOf(leela({ plan: 17 }), [6])).toEqual({
      plan: 17,
      leela: true,
    })
    expect(reelPlanOf(reel(), [6, 6])).toEqual({ plan: 6, leela: true })
    expect(reelPlanOf(reel(), [6, 12])).toEqual({ plan: null, leela: true })
    expect(
      reelPlanOf(reel({ compositionId: 'TrinityBlogReel', props: {} }), [6])
    ).toEqual({ plan: null, leela: false })
  })
})

/*
 * THE TEXTS SAY WHAT HAPPENED (review of #2709).
 *
 * The owner asked for the reel to reach her plan AND her approval queue; only
 * the plan is written. The refusal the model read said "the reel is already
 * in her chat and her content plan", whether or not a reel or a card existed,
 * and the card note promised "waits for your approval" with no approve
 * control behind it. Now the seller hears the real PlanLink result, on the
 * turn after the link, and nothing promises an approval step.
 */
describe('crm_duet: what the seller and the card are told about her plan', () => {
  const nextSellerLine = (h: ChatMessage[][]) =>
    String(h[1].at(-1)?.content ?? '')

  it('a reel that landed in her plan: the seller hears it before her reply, and the card promises no approval', async () => {
    const items = herPlan()
    const { pool } = planPool(items)
    const { d, histories } = deps(
      [reelTurn(), [text('Что в нём поправить?')]],
      ['Вижу ролик.', 'Хорошо.']
    )
    d.clientProfile = noProfile
    await runDuet(judgedRun({ turns: 2 }), judgedCtx(pool), d)
    const line = nextSellerLine(histories)
    expect(line).toContain(
      '[дуэт] Ролик прошлого хода записан в её контент-план'
    )
    expect(line.indexOf('[дуэт]')).toBeLessThan(
      line.indexOf('Покупатель (@playom): Вижу ролик.')
    )
    const card = items.find(r => r.id === 4)!
    expect(card.note).toContain(REEL_URL)
    expect(String(card.note).toLowerCase()).not.toContain('одобрени')
  })

  it('a reel with no card: the seller is told it is NOT in her plan', async () => {
    const { pool } = planPool(herPlan().filter(r => r.id !== 4))
    const { d, histories } = deps(
      [reelTurn(), [text('Что в нём поправить?')]],
      ['Вижу ролик.', 'Хорошо.']
    )
    d.clientProfile = noProfile
    await runDuet(judgedRun({ turns: 2 }), judgedCtx(pool), d)
    const line = nextSellerLine(histories)
    expect(line).toContain('в её контент-план НЕ записан')
    expect(line).not.toContain('записан в её контент-план:')
  })

  it('the note is said once: the turn after it carries none', async () => {
    const { pool } = planPool(herPlan())
    const { d, histories } = deps(
      [reelTurn(), [text('Что поправить?')], [text('Понял.')]],
      ['Вижу ролик.', 'Хорошо.', 'Да.']
    )
    d.clientProfile = noProfile
    await runDuet(judgedRun({ turns: 3 }), judgedCtx(pool), d)
    expect(String(histories[2].at(-1)?.content)).not.toContain('[дуэт]')
  })

  it('every PlanLink result has a note, and only moved/noted/already say "in her plan"', () => {
    const results = [
      'moved',
      'noted',
      'already',
      'no_row',
      'plan_unknown',
      'not_leela',
      'dry_run',
      'changed',
      'failed',
    ] as const
    for (const result of results) {
      const note = planNoteForSeller({ plan: 6, url: REEL_URL, result })
      const inPlan = ['moved', 'noted', 'already'].includes(result)
      expect(note.includes('записан в её контент-план:'), result).toBe(inPlan)
      expect(note.includes('НЕ записан'), result).toBe(!inPlan)
    }
  })

  it('the publish refusal claims nothing about her chat or plan', () => {
    const reason = DUET_DENY_REASONS.get('feed_publish') ?? ''
    expect(reason).toContain('не одобрение клиента')
    expect(reason).not.toContain('контент-план')
    expect(reason).not.toContain('в чате')
  })
})

describe('crm_duet media honesty (duet-mtzrz4jo, 2026-09-13)', () => {
  const MP4 = 'https://bucket.example/renders/leela-plan-6.mp4'

  it('mediaKind reads the extension, ignoring query and hash', () => {
    expect(mediaKind(MP4)).toBe('видео')
    expect(mediaKind('https://x/y.PNG?sig=1#a')).toBe('картинка')
    expect(mediaKind('https://x/voice.ogg')).toBe('аудио')
    expect(mediaKind('https://x/download')).toBe('файл')
  })

  it('the buyer is told a video arrived and is visible, not handed a bare URL', async () => {
    const { d, histories } = deps(
      [
        [
          result('reel_render', { готово: true, url: MP4 }), // cyrillic-ok
          text('Собрал пробный ролик в стиле игры.'),
        ],
      ],
      ['Смотрю.']
    )
    // The buyer model receives its history; capture what it saw.
    const seen: ChatMessage[][] = []
    const buyerModel = d.buyerModel
    d.buyerModel = async m => {
      seen.push(m.map(x => ({ ...x })))
      return buyerModel(m)
    }
    await runDuet(freshRun({ turns: 1 }), ctx, d)
    const toBuyer = seen[0].at(-1)?.content ?? ''
    expect(toBuyer).toContain(mediaNote([MP4]))
    expect(toBuyer).toContain('в чат пришло видео файлом')
    expect(toBuyer).not.toContain(MP4)
    expect(seen[0][0].content).toContain('Не говори, что файл не пришёл')
    expect(histories.length).toBe(1)
  })

  it('promisesFile fires only on a sending verb and a file noun in one sentence', () => {
    expect(
      promisesFile(
        'Гея, договорились. Отправляю видео файлом прямо в этот чат — оно должно прийти следующим сообщением.'
      )
    ).toBe(true)
    expect(promisesFile('Пришлю ролик, как только он соберётся.')).toBe(true)
    expect(promisesFile('Собрал пробный ролик в стиле игры: вот он.')).toBe(
      false
    )
    expect(
      promisesFile('Видео уже пришло в чат следующим сообщением после ссылки.')
    ).toBe(false)
    expect(
      promisesFile('Отправляю вам вопрос: где живёт ваша аудитория?')
    ).toBe(false)
    expect(promisesFile('Файл большой. Отправлю позже описание.')).toBe(false)
  })

  it('a promise without a tool call resends the last file, counts the send, and is reported; no new paid call', async () => {
    const { d, sent } = deps(
      [
        [
          result('reel_render', { готово: true, url: MP4 }),
          text('Ролик собран.'),
        ], // cyrillic-ok
        [
          text(
            'Отправляю видео файлом прямо в этот чат, ссылку открывать не нужно.'
          ),
        ],
      ],
      ['Не могу открыть видео по ссылке — пришлите файлом.', 'Теперь вижу.']
    )
    const run = await runDuet(freshRun({ turns: 2 }), ctx, d)
    expect(run.state).toBe('done')
    expect(run.paid_calls).toBe(1)
    expect(run.media_sent).toBe(2)
    expect(run.transcript[2].media).toEqual([])
    expect(run.transcript[2].resent).toEqual([MP4])
    expect(sent.filter(x => x.url).map(x => x.url)).toEqual([MP4, MP4])
    expect(run.violations).toEqual([
      `turn 2: обещание отправить файл без вызова инструмента — повторно отправлен ${MP4}`,
    ])
    expect(reportOf(run)).toContain('обещание отправить файл')
    // Coverage stays consistent: every call is either ok or fail.
    for (const c of Object.values(run.coverage))
      expect(c.ok + c.fail).toBe(c.calls)
  })

  it('a promise with nothing to resend is reported and nothing is sent as media', async () => {
    const { d, sent } = deps(
      [[text('Пришлю ролик завтра утром.')]],
      ['Хорошо.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.media_sent).toBe(0)
    expect(sent.filter(x => x.url)).toEqual([])
    expect(run.violations).toEqual([
      'turn 0: обещание отправить файл, файла нет',
    ])
    expect(run.transcript[0].resent).toBeUndefined()
  })

  it('the seller brief forbids the promise and names the honest phrasing', () => {
    const brief = sellerBrief(BUYER)
    expect(brief).toContain('Никогда не пиши «отправляю/пришлю файл»')
    expect(brief).toContain('видео уже пришло в чат следующим сообщением')
  })
})

describe('crm_duet tools', () => {
  it('refuses a non-owner, the owner as buyer, and an unconnected buyer; status without a run says so', async () => {
    vi.resetModules()
    let sellerChecks = 0
    vi.doMock('./src/agent/telegram-tools', () => ({
      requireOwner: (c?: ToolContext) => {
        if (String(c?.telegramId) !== OWNER) throw new Error('only the owner')
      },
      isSeller: async (c?: ToolContext) => {
        sellerChecks++
        return String(c?.telegramId) === BUYER
      },
      withClient: async () => {
        throw new Error('no live client in tests')
      },
    }))
    vi.doMock('./src/agent/tg-proposals', () => ({
      sendWithAddressBook: async () => undefined,
      sendFileWithAddressBook: async () => undefined,
    }))
    const mod = await import('./src/agent/crm-duet-tool')
    const start = mod.CRM_DUET_TOOLS.find(t => t.name === 'crm_duet')!
    const status = mod.CRM_DUET_TOOLS.find(t => t.name === 'crm_duet_status')!
    await expect(
      start.handler({}, { telegramId: BUYER } as unknown as ToolContext)
    ).rejects.toThrow('only the owner')
    /*
     * NO BUYER, NO RUN. The tool used to fall back to one real person's id,
     * and a run sends from that person's own session. Refused before anybody
     * is looked up.
     */
    await expect(start.handler({}, ctx)).rejects.toThrow(mod.NO_BUYER_REASON)
    await expect(start.handler({ buyer: '  ' }, ctx)).rejects.toThrow(
      mod.NO_BUYER_REASON
    )
    expect(sellerChecks).toBe(0)
    expect((start.parameters as any).required).toEqual(['buyer'])
    expect(JSON.stringify(start.parameters)).not.toMatch(/по умолчанию \d{5,}/) // cyrillic-ok
    await expect(start.handler({ buyer: OWNER }, ctx)).rejects.toThrow(
      'сам владелец'
    )
    await expect(start.handler({ buyer: '999999999' }, ctx)).rejects.toThrow(
      'не подключён'
    )
    await expect(start.handler({ buyer: 'abc' }, ctx)).rejects.toThrow(
      'числовым'
    )
    expect(await status.handler({}, ctx)).toMatchObject({ found: false })
  })

  /*
   * The live wiring, not a double: crm_duet builds its own dependencies, and
   * the ban with its reason must reach the real runAgent call, or the model
   * reads the discovery reason ("learn what she wants") for a publish ban.
   */
  it('the live run hands runAgent the publish ban and its reason', async () => {
    const LIVE_OWNER = '900000070'
    const LIVE_BUYER = '900000071'
    const seen: Array<Record<string, any>> = []
    vi.resetModules()
    vi.doMock('./src/agent/telegram-tools', () => ({
      requireOwner: (c?: ToolContext) => {
        if (String(c?.telegramId) !== LIVE_OWNER)
          throw new Error('only the owner')
      },
      isSeller: async (c?: ToolContext) => String(c?.telegramId) === LIVE_BUYER,
      withClient: async () => {
        throw new Error('no live client in tests')
      },
    }))
    vi.doMock('./src/agent/tg-proposals', () => ({
      sendWithAddressBook: async () => undefined,
      sendFileWithAddressBook: async () => undefined,
    }))
    vi.doMock('./src/agent/chat', () => ({
      runAgent: async function* (_h: unknown, _c: unknown, o: any) {
        seen.push(o)
        yield { ['тип']: 'текст', ['текст']: 'Здравствуйте.' } // cyrillic-ok: event envelope
      },
    }))
    vi.doMock('./src/agent/provider', () => ({
      allProviders: () => [],
      diagnose: () => 'none',
    }))
    const mod = await import('./src/agent/crm-duet-tool')
    const start = mod.CRM_DUET_TOOLS.find(t => t.name === 'crm_duet')!
    const liveCtx = {
      telegramId: LIVE_OWNER,
      pool: {},
    } as unknown as ToolContext
    const r: any = await start.handler(
      { buyer: LIVE_BUYER, turns: 1, dry_run: true },
      liveCtx
    )
    expect(r.started).toBe(true)
    await vi.waitFor(() => expect(seen).toHaveLength(1))
    expect(seen[0].denyTools.has('feed_publish')).toBe(true)
    expect(seen[0].denyReasons.get('feed_publish')).toContain(
      'не одобрение клиента'
    )
    vi.doUnmock('./src/agent/chat')
    vi.doUnmock('./src/agent/provider')
  })

  /*
   * Live run duet-mtzmbvu1 (2026-09-13) failed with "buyer model HTTP 404"
   * because the buyer asked only the first provider. The buyer must walk the
   * whole chain like the seller does: 404 on the first, answer from the next.
   */
  it('buyer model falls back to the next provider on a failed status', async () => {
    const calls: string[] = []
    const doFetch = (async (url: string) => {
      calls.push(url)
      if (url.startsWith('https://bad')) {
        return new Response('404 page not found', { status: 404 })
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: ' Покажи пример. ' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }) as unknown as typeof fetch
    const providers = [
      { id: 'bad', base: 'https://bad/v1', model: 'm1', key: 'k1' },
      { id: 'good', base: 'https://good/v1', model: 'm2', key: 'k2' },
    ]
    const text = await askBuyerModel(
      [{ role: 'user', content: 'привет' }],
      providers,
      doFetch
    )
    expect(text).toBe('Покажи пример.')
    expect(calls).toEqual([
      'https://bad/v1/chat/completions',
      'https://good/v1/chat/completions',
    ])
  })

  it('buyer model asks GLM not to think and treats a reasoning-only 200 as a miss', async () => {
    const bodies: Array<Record<string, any>> = []
    const doFetch = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body)
      bodies.push(body)
      if (body.model === 'glm-5.3')
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: '', reasoning_content: 'hmm...' },
                finish_reason: 'length',
              },
            ],
          }),
          { status: 200 }
        )
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'беру пост' } }] }),
        { status: 200 }
      )
    }) as unknown as typeof fetch
    const text = await askBuyerModel(
      [{ role: 'user', content: 'x' }],
      [
        {
          id: 'zai',
          base: 'https://a',
          model: 'glm-5.3',
          key: 'k',
          thinking: true,
        },
        {
          id: 'nemotron',
          base: 'https://b',
          model: 'n',
          key: 'k',
          thinking: false,
        },
      ],
      doFetch
    )
    expect(text).toBe('беру пост')
    expect(bodies[0].thinking).toEqual({ type: 'disabled' })
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(600)
    expect(bodies[1].thinking).toBeUndefined()
    expect(
      buyerRequestBody({ id: 'zai-lite', model: 'glm-4.5' }, []).thinking
    ).toEqual({ type: 'disabled' })
  })

  it('buyer model names every provider when all fail', async () => {
    const doFetch = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof fetch
    await expect(
      askBuyerModel(
        [{ role: 'user', content: 'x' }],
        [
          { id: 'a', base: 'https://a', model: 'm', key: 'k' },
          { id: 'b', base: 'https://b', model: 'm', key: 'k' },
        ],
        doFetch
      )
    ).rejects.toThrow('buyer model: a: HTTP 500; b: HTTP 500')
    await expect(
      askBuyerModel([{ role: 'user', content: 'x' }], [], doFetch)
    ).rejects.toThrow('no provider configured')
  })
})

describe('crm_duet claim honesty and aborted state (duet-mtzyg2t6, 2026-09-13)', () => {
  const PROVIDER_ERR =
    'Error: Ни один провайдер модели не ответил.\n  • zai: превышен лимит запросов' // cyrillic-ok

  it('claimsDoneWork fires on finished-work claims, not on offers or futures', () => {
    // The live line from turn 0.
    expect(
      claimsDoneWork(
        'Привет, Gaia! Я уже собрал пробный ролик в том же стиле, как вы просили, и сейчас готовлю его к публикации.'
      )
    ).toBe(true)
    expect(claimsDoneWork('Вот ваш ролик по плану 6.')).toBe(true)
    expect(claimsDoneWork('Картинка готова, смотрите.')).toBe(true)
    expect(
      claimsDoneWork('Могу собрать один ролик её шаблоном — какой план взять?')
    ).toBe(false)
    expect(
      claimsDoneWork('Готов собрать пример поста после вашего ответа.')
    ).toBe(false)
    expect(claimsDoneWork('Вот пример поста про 72 плана.')).toBe(false)
    expect(claimsDoneWork('Расскажите, какой план вам ближе?')).toBe(false)
  })

  it('producedWork is true only for an ok producing tool', () => {
    expect(
      producedWork([
        {
          name: 'reel_render',
          value: { готово: true, url: 'https://x/a.mp4' },
          ms: 1,
        },
      ])
    ).toBe(true) // cyrillic-ok
    expect(
      producedWork([
        { name: 'reel_render', value: { error: 'no credits' }, ms: 1 },
      ])
    ).toBe(false)
    expect(
      producedWork([
        { name: 'crm_client_profile', value: { has_profile: true }, ms: 1 },
      ])
    ).toBe(false)
  })

  it('a claim with no tool gets one rewrite; the rewrite is what goes out and the miss is reported', async () => {
    const { d, sent, histories } = deps(
      [
        [
          result('crm_client_profile', { has_profile: true }),
          text(
            'Я уже собрал пробный ролик в вашем стиле и готовлю его к публикации. Что поправить?'
          ),
        ],
        [
          text(
            'Могу собрать один пример ролика вашим шаблоном после ответа. Какой план вам ближе?'
          ),
        ],
      ],
      ['План 6.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(histories).toHaveLength(2)
    expect(histories[1].at(-1)?.content).toContain('Проверка честности')
    expect(sent[0].text).toContain('Могу собрать')
    expect(run.transcript[0].text).toContain('Могу собрать')
    expect(run.violations).toEqual([
      'turn 0: заявлена сделанная работа без инструмента — переписано',
    ])
    expect(run.state).toBe('done')
  })

  it('a second miss is sent as is and reported after the rewrite', async () => {
    const { d, sent } = deps(
      [
        [text('Ролик уже сделал, вот ваш ролик.')],
        [text('Картинка готова и ролик собрал, публикуем?')],
      ],
      ['?']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(sent[0].text).toContain('Картинка готова')
    expect(run.violations).toEqual([
      'turn 0 (после правки): заявлена сделанная работа без инструмента',
    ])
  })

  it('a claim backed by a producing tool in the same turn is honest and untouched', async () => {
    const { d, histories } = deps(
      [
        [
          result('reel_render', { готово: true, url: 'https://x/plan-6.mp4' }), // cyrillic-ok
          text('Собрал пробный ролик в стиле игры: вот он.'),
        ],
      ],
      ['Вижу.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(histories).toHaveLength(1)
    expect(run.violations).toEqual([])
  })

  it('a provider failure on a later seller turn ends the run as failed with the turn error, 3 of 8 lines', async () => {
    // A limit is retried once (below); here both attempts hit it.
    const { d, slept } = deps(
      [
        [text('Здравствуйте! Какой план вам ближе?')],
        [{ тип: 'ошибка', текст: PROVIDER_ERR }], // cyrillic-ok
        [{ тип: 'ошибка', текст: PROVIDER_ERR }], // cyrillic-ok
      ],
      ['План 6.']
    )
    const run = await runDuet(freshRun({ turns: 4 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.transcript).toHaveLength(3)
    expect(run.transcript[2].error).toBe(PROVIDER_ERR)
    expect(run.transcript[2].retried).toBe(PROVIDER_ERR)
    expect(slept).toEqual([SELLER_RETRY_PAUSE_MS])
    expect(run.error).toBe(`turn 2: ${PROVIDER_ERR}`)
    expect(run.finished_at).toBeDefined()
    expect(reportOf(run)).toContain('failed')
    expect(summaryOf(run, 1000).error).toBe(run.error)
    expect(summaryOf(run, 1000).lines).toBe(3)
  })

  it('a silent buyer ends the run as failed too', async () => {
    const { d } = deps([[text('Привет!')]], [''])
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.error).toBe('turn 1: buyer produced no text')
  })
})

describe('crm_duet one retry on a provider limit (duet-mu00klri, 2026-09-13)', () => {
  // The three live lines of the day, and one that must not be retried.
  const ZAI_429 = 'zai: превышен лимит запросов' // cyrillic-ok
  const NVIDIA_16 =
    'nemotron: Error: nemotron прислал ошибку в потоке: {"message":"ResourceExhausted: Worker local total request limit reached (16/16)"}' // cyrillic-ok
  const BAD_KEY =
    'zai: ключ недействителен — перевыпустите и обновите переменную' // cyrillic-ok

  it('isLimitError knows a limit from a dead key', () => {
    expect(isLimitError(ZAI_429)).toBe(true)
    expect(isLimitError(NVIDIA_16)).toBe(true)
    expect(isLimitError('openai: rate limit exceeded')).toBe(true)
    expect(isLimitError('HTTP 429 Too Many Requests')).toBe(true)
    expect(isLimitError(BAD_KEY)).toBe(false)
    expect(isLimitError(undefined)).toBe(false)
  })

  it('retryAllowed: once, only on a limit, never after a paid call', () => {
    const free = [{ name: 'crm_client_profile', value: {}, ms: 1 }]
    const paid = [{ name: 'image_generate', value: { done: true }, ms: 1 }]
    expect(retryAllowed(0, ZAI_429, free)).toBe(true)
    expect(retryAllowed(1, ZAI_429, free)).toBe(false)
    expect(retryAllowed(0, BAD_KEY, free)).toBe(false)
    expect(retryAllowed(0, ZAI_429, paid)).toBe(false)
    expect(SELLER_RETRY_PAUSE_MS).toBe(30_000)
  })

  it('a limited first attempt waits once and the second attempt is the line that goes out', async () => {
    const { d, sent, slept, histories } = deps(
      [
        [
          result('crm_client_profile', { has_profile: false }),
          { тип: 'ошибка', текст: ZAI_429 }, // cyrillic-ok
        ],
        [text('Гея, здравствуйте! Какой план сейчас ближе всего?')],
      ],
      ['План 6.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(slept).toEqual([SELLER_RETRY_PAUSE_MS])
    expect(run.state).toBe('done')
    expect(run.transcript[0].text).toContain('Какой план')
    expect(run.transcript[0].retried).toBe(ZAI_429)
    expect(run.transcript[0].error).toBeUndefined()
    // Same history on the replay: the brief, nothing else.
    expect(histories[1]).toEqual(histories[0])
    // The free call of the failed attempt is still counted.
    expect(run.coverage.crm_client_profile.calls).toBe(1)
    expect(sent.filter(x => x.text)).toHaveLength(2)
  })

  it('a dead key is not retried: no pause, failed at once', async () => {
    const { d, slept } = deps([[{ тип: 'ошибка', текст: BAD_KEY }]], []) // cyrillic-ok
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(slept).toEqual([])
    expect(run.state).toBe('failed')
    expect(run.error).toBe(`turn 0: ${BAD_KEY}`)
    expect(run.transcript[0].retried).toBeUndefined()
  })

  it('a limited attempt that already paid for a generation is not replayed', async () => {
    const { d, slept } = deps(
      [
        [
          result('image_generate', { done: true, url: 'https://x/y.png' }),
          { тип: 'ошибка', текст: ZAI_429 }, // cyrillic-ok
        ],
      ],
      []
    )
    const run = await runDuet(freshRun({ turns: 1, dry_run: true }), ctx, d)
    expect(slept).toEqual([])
    // The file went out with no text; the run did not replay and did not pay twice.
    expect(run.paid_calls).toBe(1)
    expect(run.transcript[0].retried).toBeUndefined()
  })
})

describe('crm_duet discovery gate and seller voice (duet-mu027xqr, 2026-09-14)', () => {
  // Live line 0 of that run: a paid reel_render before the buyer spoke, and
  // "the same style you liked" to a person who had liked nothing yet.
  const LIVE_LINE_0 =
    'Гея, ролик готов — тот же стиль, что вам понравился: план 6, крючок «Первая клетка игры называется Заблуждение. Не случайно.». Публикуем?'
  const LIVE_LINE_4 =
    'Ролик отправлен, но я задавала его сама и сам кадр я не видела.'
  const LIVE_LINE_2 =
    'Вы правы, и я забираю эти слова назад: я не видел ни кадра.'

  it('paid tools are denied on the first two seller turns and offered from the third; feed_publish never', () => {
    expect(DISCOVERY_SELLER_TURNS).toBe(2)
    const paidDenied = (turn: number) =>
      [...PAID_TOOLS].filter(t => deniedToolsFor(turn).has(t)).length
    expect([0, 1, 2, 7].map(paidDenied)).toEqual([5, 5, 0, 0])
    for (const turn of [0, 1, 2, 7])
      expect(deniedToolsFor(turn).has('feed_publish')).toBe(true)
  })

  it('the agent receives the paid tools denied on seller turns 0 and 2, not on turn 4, and feed_publish denied on all three', async () => {
    const { d, denies } = deps(
      [
        [
          text(
            'Здравствуйте, Гея. Кому вы играете чаще: новичкам или тем, кто уже ходил по полю?'
          ),
        ],
        [text('Понял. А какой план вам самой ближе сейчас?')],
        [text('Могу собрать один пример вашим шаблоном. Публикуем план 6?')],
      ],
      ['Новичкам.', 'План 6.', 'Да.']
    )
    const run = await runDuet(freshRun({ turns: 3 }), ctx, d)
    expect(run.state).toBe('done')
    const paid = (s?: ReadonlySet<string>) =>
      [...PAID_TOOLS].filter(t => s?.has(t)).length
    expect(denies.map(paid)).toEqual([5, 5, 0])
    expect(denies.map(s => s?.has('feed_publish'))).toEqual([true, true, true])
    expect(run.violations).toEqual([])
    expect(run.voice_flags).toEqual([])
  })

  it('refusedOf knows a dispatcher refusal from a failed tool; a refused paid call is a violation, not a paid call', async () => {
    const refusal = { ошибка: 'недоступен на этом ходу', отказано: true } // cyrillic-ok
    expect(refusedOf(refusal)).toBe(true)
    expect(refusedOf({ ошибка: 'timeout' })).toBe(false) // cyrillic-ok
    expect(refusedOf({ готово: true })).toBe(false) // cyrillic-ok
    const { d } = deps(
      [
        [
          result('reel_render', refusal),
          text('Здравствуйте, Гея. Кому вы играете чаще?'),
        ],
      ],
      ['Новичкам.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.paid_calls).toBe(0)
    expect(run.coverage.reel_render).toEqual({ calls: 1, ok: 0, fail: 1 })
    expect(run.violations).toEqual([
      'turn 0: reel_render до discovery — отклонён',
    ])
  })

  it('claimsFamiliarity fires on the live line and stays quiet on discovery', () => {
    expect(claimsFamiliarity(LIVE_LINE_0)).toBe(true)
    expect(claimsFamiliarity('Как договаривались, план 6.')).toBe(true)
    expect(claimsFamiliarity('Сделал, как вы просили.')).toBe(true)
    expect(claimsFamiliarity('Здравствуйте, Гея. Кому вы играете чаще?')).toBe(
      false
    )
    expect(claimsFamiliarity('Могу собрать пример вашим шаблоном.')).toBe(false)
  })

  it('a familiarity claim on a discovery turn gets one rewrite; the rewrite goes out and the miss is reported', async () => {
    const { d, sent, histories } = deps(
      [
        // Live line 0 minus the finished-work claim, which the claim check
        // takes first (its own test above); here only the familiarity part.
        [text('Гея, тот же стиль, что вам понравился: план 6. Публикуем?')],
        [
          text(
            'Здравствуйте, Гея. Я Дмитрий, делаю ролики для игры. Кому вы играете чаще?'
          ),
        ],
      ],
      ['Новичкам.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(histories).toHaveLength(2)
    expect(histories[1].at(-1)?.content).toContain('ни о чём не договаривалась')
    expect(sent[0].text).toContain('Кому вы играете')
    expect(run.violations).toEqual([
      'turn 0: ссылка на несуществующую договорённость — переписано',
    ])
  })

  it('a second familiarity miss is sent as is and reported; a later turn is not gated', async () => {
    const { d, sent } = deps(
      [
        [text('Как договаривались, начнём с плана 6. Кому вы играете?')],
        [text('Как вы просили, план 6. Кому вы играете?')],
        [text('Ясно. Какой план ближе?')],
        [text('Как договаривались, собираю план 6.')],
      ],
      ['Новичкам.', 'Шестой.', 'Да.']
    )
    const run = await runDuet(freshRun({ turns: 3 }), ctx, d)
    expect(sent[0].text).toContain('Как вы просили')
    expect(run.violations).toEqual([
      'turn 0 (после правки): ссылка на несуществующую договорённость',
    ])
  })

  it('a feminine first-person past form is a voice flag, not a rewrite', async () => {
    expect(sellerGenderSlip(LIVE_LINE_4)).toBe(true)
    expect(sellerGenderSlip(LIVE_LINE_2)).toBe(false)
    expect(
      sellerGenderSlip('Я собрал ролик и не видел кадра. Сама игра старше.')
    ).toBe(false)
    const { d, histories } = deps([[text(LIVE_LINE_4)]], ['Ок.'])
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(histories).toHaveLength(1)
    expect(run.voice_flags).toEqual(['turn 0: женский род продавца'])
  })

  it('the brief fixes the seller gender, forbids familiarity before her answer and the prophecy hook', () => {
    const brief = sellerBrief(BUYER, null)
    expect(brief).toContain('мужском роде')
    expect(brief).toContain('как договорились')
    expect(brief).toContain('Не случайно')
  })
})
