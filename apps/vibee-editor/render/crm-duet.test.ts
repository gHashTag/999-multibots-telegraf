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
  summaryOf,
  askBuyerModel,
  buyerRequestBody,
  PAID_TOOLS,
  TURNS_MAX,
  type DuetRun,
  type DuetDeps,
} from './src/agent/crm-duet-tool'
import type { ChatMessage } from './src/agent/chat'
import type { ToolContext } from './src/agent/tools'

const OWNER = '144022504'
const BUYER = '435572800'
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
): { d: DuetDeps; sent: Sent[]; histories: ChatMessage[][] } {
  const sent: Sent[] = []
  const histories: ChatMessage[][] = []
  let s = 0
  let b = 0
  const d: DuetDeps = {
    agent: history => {
      histories.push(history.map(m => ({ ...m })))
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
  }
  return { d, sent, histories }
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
    expect(mediaOf({ готово: true, renderId: 'r1', url: 'https://x/reel.mp4' })).toBe( // cyrillic-ok
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
      business: { product: 'Лила — игра самопознания', surfaces: ['@leela_chakra_ai_bot'] },
      audience_hypotheses: ['новичок после первого броска'],
      discovery_questions: ['Где живёт ваша аудитория?'],
      content_series: [{ rubric: 'устройство партии', ideas: ['вход с шестёрки'] }],
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
      profile: { name: 'Гея', handle: '@playom', reel_template: { composition: 'LeelaPlanReel' } },
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
    expect(promisesFile('Собрал пробный ролик в стиле игры: вот он.')).toBe(false)
    expect(promisesFile('Видео уже пришло в чат следующим сообщением после ссылки.')).toBe(false)
    expect(promisesFile('Отправляю вам вопрос: где живёт ваша аудитория?')).toBe(false)
    expect(promisesFile('Файл большой. Отправлю позже описание.')).toBe(false)
  })

  it('a promise without a tool call resends the last file, counts the send, and is reported; no new paid call', async () => {
    const { d, sent } = deps(
      [
        [result('reel_render', { готово: true, url: MP4 }), text('Ролик собран.')], // cyrillic-ok
        [text('Отправляю видео файлом прямо в этот чат, ссылку открывать не нужно.')],
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
    for (const c of Object.values(run.coverage)) expect(c.ok + c.fail).toBe(c.calls)
  })

  it('a promise with nothing to resend is reported and nothing is sent as media', async () => {
    const { d, sent } = deps(
      [[text('Пришлю ролик завтра утром.')]],
      ['Хорошо.']
    )
    const run = await runDuet(freshRun({ turns: 1 }), ctx, d)
    expect(run.media_sent).toBe(0)
    expect(sent.filter(x => x.url)).toEqual([])
    expect(run.violations).toEqual(['turn 0: обещание отправить файл, файла нет'])
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
    vi.doMock('./src/agent/telegram-tools', () => ({
      requireOwner: (c?: ToolContext) => {
        if (String(c?.telegramId) !== OWNER) throw new Error('only the owner')
      },
      isSeller: async (c?: ToolContext) => String(c?.telegramId) === BUYER,
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
        { id: 'zai', base: 'https://a', model: 'glm-5.3', key: 'k', thinking: true },
        { id: 'nemotron', base: 'https://b', model: 'n', key: 'k', thinking: false },
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
    expect(claimsDoneWork('Могу собрать один ролик её шаблоном — какой план взять?')).toBe(false)
    expect(claimsDoneWork('Готов собрать пример поста после вашего ответа.')).toBe(false)
    expect(claimsDoneWork('Вот пример поста про 72 плана.')).toBe(false)
    expect(claimsDoneWork('Расскажите, какой план вам ближе?')).toBe(false)
  })

  it('producedWork is true only for an ok producing tool', () => {
    expect(producedWork([{ name: 'reel_render', value: { готово: true, url: 'https://x/a.mp4' }, ms: 1 }])).toBe(true) // cyrillic-ok
    expect(producedWork([{ name: 'reel_render', value: { error: 'no credits' }, ms: 1 }])).toBe(false)
    expect(producedWork([{ name: 'crm_client_profile', value: { has_profile: true }, ms: 1 }])).toBe(false)
  })

  it('a claim with no tool gets one rewrite; the rewrite is what goes out and the miss is reported', async () => {
    const { d, sent, histories } = deps(
      [
        [
          result('crm_client_profile', { has_profile: true }),
          text('Я уже собрал пробный ролик в вашем стиле и готовлю его к публикации. Что поправить?'),
        ],
        [text('Могу собрать один пример ролика вашим шаблоном после ответа. Какой план вам ближе?')],
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
    const { d } = deps(
      [
        [text('Здравствуйте! Какой план вам ближе?')],
        [{ тип: 'ошибка', текст: PROVIDER_ERR }], // cyrillic-ok
      ],
      ['План 6.']
    )
    const run = await runDuet(freshRun({ turns: 4 }), ctx, d)
    expect(run.state).toBe('failed')
    expect(run.transcript).toHaveLength(3)
    expect(run.transcript[2].error).toBe(PROVIDER_ERR)
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
