/**
 * THE MAIN MINI APP IS SWITCHED ON IN @BotFather, FROM THE OWNER'S ACCOUNT,
 * BY A DRIVER THAT STOPS ON SURPRISE.
 *
 * Owner, 2026-09-22: every link to our app must open inside Telegram --
 * "yes, configure it through my account". t.me/<bot>?startapp= needs the
 * bot's Main Mini App, which only @BotFather can switch on, behind inline
 * buttons. src/agent/botfather-main-app.ts walks that path with the render's
 * own client; here BotFather is a script, and nothing reaches Telegram.
 *
 * Every id and token below is invented (9000000xx), and so is every bot.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const OWNER = '900000001'
const STRANGER = '900000042'
process.env.OWNER_TELEGRAM_ID = OWNER
delete process.env.TELEGRAM_SESSION_STRING

const TOKEN_A = '900000101:test-alpha' // secret-guard-ok: invented for this test
const TOKEN_B = '900000102:test-beta' // secret-guard-ok: invented for this test
const BOT = 'neuro_test_bot'
const APP = 'https://app.t27.ai'
/** What is sent: the address exactly as it was validated, normalised. */
const APP_HREF = 'https://app.t27.ai/'

const ENV_PREFIXES = [
  /^BOT_TOKEN_\d+$/,
  /^TELEGRAM_BOT_TOKEN$/,
  /^TOKENS_PAYMENT_BOT_TOKEN$/,
]
const API_VARS = [
  'TELEGRAM_API_ROOT',
  'TELEGRAM_API_FILES_ROOT',
  'BOT_API_LOCAL_BOTS',
]

function clearEnv() {
  for (const k of Object.keys(process.env)) {
    if (ENV_PREFIXES.some(r => r.test(k))) delete process.env[k]
  }
  for (const k of API_VARS) delete process.env[k]
}

/* ───────────────────────────── the Bot API, faked ───────────────────────────── */

interface BotState {
  username: string
  hasMainWebApp: boolean
  menuUrl: string | null
}

function botApi(bots: Record<string, BotState>) {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(String(url))
    const m = /\/bot([^/]+)\/(getMe|getChatMenuButton)$/.exec(String(url))
    const bot = m ? bots[m[1]] : undefined
    if (!m || !bot) throw new Error('network')
    const body =
      m[2] === 'getMe'
        ? {
            ok: true,
            result: {
              username: bot.username,
              has_main_web_app: bot.hasMainWebApp,
            },
          }
        : bot.menuUrl
          ? {
              ok: true,
              result: {
                type: 'web_app',
                text: 'Open app',
                web_app: { url: bot.menuUrl },
              },
            }
          : { ok: true, result: { type: 'commands' } }
    return { json: async () => body }
  })
  return {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    urls,
    spy: fetchImpl,
  }
}

/* ────────────────────────────── BotFather, faked ────────────────────────────── */

interface Msg {
  id: number
  text: string
  editDate?: number
  buttons: Array<{ text: string; data?: Uint8Array }>
}
interface Screen {
  text: string
  buttons: string[]
}

class FakeBotFather {
  noData: string[] = []
  msgs: Msg[] = []
  sent: string[] = []
  pressed: string[] = []
  private nextId = 500
  constructor(
    private onText: (text: string, fb: FakeBotFather) => void,
    private onPress: (label: string, fb: FakeBotFather) => void
  ) {}
  private toMsg(id: number, s: Screen, editDate?: number): Msg {
    return {
      id,
      text: s.text,
      ...(editDate ? { editDate } : {}),
      buttons: s.buttons.map(text =>
        this.noData.includes(text)
          ? { text }
          : { text, data: Buffer.from('cb:' + text) }
      ),
    }
  }
  post(s: Screen) {
    this.msgs.push(this.toMsg(this.nextId++, s))
  }
  edit(s: Screen) {
    const last = this.msgs[this.msgs.length - 1]
    this.msgs[this.msgs.length - 1] = this.toMsg(
      last.id,
      s,
      (last.editDate ?? 1000) + 1
    )
  }
  async send(text: string) {
    this.sent.push(text)
    this.onText(text, this)
  }
  async latest() {
    const m = this.msgs[this.msgs.length - 1]
    return m ? { ...m, buttons: m.buttons.map(b => ({ ...b })) } : null
  }
  async press(id: number, data: Uint8Array) {
    const label = Buffer.from(data).toString().slice(3)
    if (id !== this.msgs[this.msgs.length - 1]?.id)
      throw new Error('pressed a stale message')
    this.pressed.push(label)
    this.onPress(label, this)
  }
}

interface Script {
  pages?: string[][]
  botButtons?: string[]
  settingsButtons?: string[]
  miniAppButtons?: string[]
  configureLabel?: string
  enableLabel?: string
  askText?: string
  /** Ask for the URL only after this many ms, with the menu edited first. */
  askLater?: number
  /** Labels that arrive as url / web-view buttons: no callback data. */
  noData?: string[]
  replyText?: string
  onUrl?: () => void
}

const botScreen = (buttons?: string[]): Screen => ({
  text: `Here it is: Neuro Test @${BOT}.\nWhat do you want to do with the bot?`,
  buttons: buttons ?? [
    'API Token',
    'Edit Bot',
    'Bot Settings',
    'Payments',
    'Transfer Ownership',
    'Delete Bot',
    '« Back to Bots List',
  ],
})

/** BotFather as measured by hand: menus are EDITED in place, questions are new. */
function botFather(s: Script = {}) {
  const pages = s.pages ?? [['@other_test_bot', `@${BOT}`]]
  const configure = s.configureLabel ?? 'Configure Mini App'
  const enable = s.enableLabel ?? 'Enable Mini App'
  let page = 0
  const list = (i: number): Screen => ({
    text: 'Choose a bot from the list below:',
    buttons: [...pages[i], ...(i < pages.length - 1 ? ['»'] : [])],
  })
  const ask: Screen = {
    text: s.askText ?? `OK. Send me the URL of the Main Mini App for @${BOT}.`,
    buttons: [],
  }
  const fb = new FakeBotFather(
    (text, fb) => {
      if (text === '/mybots') {
        page = 0
        fb.post(list(0))
        return
      }
      if (text.startsWith('https://')) {
        fb.post({
          text: s.replyText ?? `Success! Main Mini App enabled for @${BOT}.`,
          buttons: [],
        })
        s.onUrl?.()
        return
      }
      fb.post({ text: 'Unrecognized command. Say what?', buttons: [] })
    },
    (label, fb) => {
      if (label === '»') {
        page += 1
        fb.edit(list(page))
      } else if (label === `@${BOT}` || label.startsWith('@')) {
        fb.edit(botScreen(s.botButtons))
      } else if (label === 'Bot Settings') {
        fb.edit({
          text: `Settings for @${BOT}.`,
          buttons: s.settingsButtons ?? [
            'Inline Mode',
            'Allow Groups?',
            'Group Privacy',
            'Menu Button',
            configure,
            '« Back to Bot',
          ],
        })
      } else if (label === configure) {
        fb.edit({
          text: `Main Mini App is disabled for @${BOT}.`,
          buttons: s.miniAppButtons ?? [enable, '« Back'],
        })
      } else if (label === enable) {
        if (s.askLater) {
          fb.edit({ text: `Main Mini App for @${BOT}.`, buttons: [] })
          setTimeout(() => fb.post(ask), s.askLater)
        } else {
          fb.post(ask)
        }
      }
    }
  )
  fb.noData = s.noData ?? []
  return fb
}

/* ─────────────────────────────────── setup ─────────────────────────────────── */

type Mod = typeof import('./src/agent/botfather-main-app')
let mod: Mod
let state: Record<string, BotState>
let api: ReturnType<typeof botApi>
let lines: string[]

const owner = {
  telegramId: OWNER,
  pool: { query: async () => ({ rows: [] }) },
} as never
const stranger = {
  telegramId: STRANGER,
  pool: { query: async () => ({ rows: [] }) },
} as never

beforeEach(async () => {
  vi.resetModules()
  clearEnv()
  process.env.BOT_TOKEN_1 = TOKEN_A
  process.env.BOT_TOKEN_2 = TOKEN_B
  state = {
    [TOKEN_A]: {
      username: 'Neuro_Test_Bot',
      hasMainWebApp: false,
      menuUrl: APP,
    },
    [TOKEN_B]: {
      username: 'other_test_bot',
      hasMainWebApp: false,
      menuUrl: APP,
    },
  }
  api = botApi(state)
  lines = []
  mod = await import('./src/agent/botfather-main-app')
  ;(await import('./src/agent/bot-farm')).forgetFarmForTests()
})
afterEach(() => {
  clearEnv()
  vi.unstubAllGlobals()
})

function run(
  fb: FakeBotFather | null,
  args: Record<string, unknown> = { bot: `@${BOT}` },
  ctx = owner
) {
  const opened: string[] = []
  return {
    opened,
    result: mod.configureMainMiniApp(args, ctx, {
      fetchImpl: api.fetchImpl,
      openChat: async (_c, fn) => {
        opened.push('chat')
        if (!fb) throw new Error('no chat in this test')
        try {
          return await fn(fb)
        } finally {
          // withClient hangs the client up here; a run that never returns
          // would leave a live MTProto client behind.
          opened.push('closed')
        }
      },
      stepTimeoutMs: 150,
      pollMs: 2,
      log: l => lines.push(l),
    }),
  }
}

const flip = () => {
  state[TOKEN_A].hasMainWebApp = true
}

/* ─────────────────────────────────── tests ─────────────────────────────────── */

describe('the happy path, with BotFather editing its menus in place', () => {
  it('presses exactly the path, sends /mybots and the URL, and proves it with getMe', async () => {
    const fb = botFather({ onUrl: flip })
    const r = await run(fb).result
    expect(r.status).toBe('enabled')
    expect(r.has_main_web_app).toBe(true)
    expect(fb.sent).toEqual(['/mybots', APP_HREF])
    expect(fb.pressed).toEqual([
      `@${BOT}`,
      'Bot Settings',
      'Configure Mini App',
      'Enable Mini App',
    ])
    // Four screens, one message: the list was edited three times.
    expect(fb.msgs.map(m => m.id)).toEqual([500, 501, 502])
    expect(fb.msgs[0].editDate).toBe(1003)
    expect(r.transcript).toHaveLength(6)
    expect(r.transcript![2]).toContain('Settings for')
    expect(r.steps!.map(s => `${s.step}:${s.ok}`)).toEqual([
      'open:true',
      'pick_bot:true',
      'bot_settings:true',
      'configure_mini_app:true',
      'enable_mini_app:true',
      'send_url:true',
      'confirm:true',
      'verify:true',
    ])
    expect(r.url_source).toBe('menu_button')
  })

  it('logs one line per step, naming the bot and never a token', async () => {
    await run(botFather({ onUrl: flip })).result
    expect(lines).toHaveLength(8)
    for (const l of lines) {
      expect(l).toMatch(
        new RegExp(`^\\[botfather-main-app\\] @${BOT} \\w+ (ok|stop)`)
      )
      expect(l).not.toContain('test-alpha')
      expect(l).not.toContain('900000101')
    }
  })

  it('waits for the question when BotFather edits the menu before asking for the URL', async () => {
    const fb = botFather({ askLater: 30, onUrl: flip })
    const r = await run(fb).result
    expect(r.status).toBe('enabled')
    expect(fb.sent).toEqual(['/mybots', APP_HREF])
  })

  it('turns the /mybots page when the bot is on the second one', async () => {
    const fb = botFather({
      pages: [
        ['@first_test_bot', '@second_test_bot'],
        ['@other_test_bot', `@${BOT}`],
      ],
      onUrl: flip,
    })
    const r = await run(fb).result
    expect(r.status).toBe('enabled')
    expect(fb.pressed.slice(0, 2)).toEqual(['»', `@${BOT}`])
  })

  it('a renamed label within the accepted set is still pressed', async () => {
    const fb = botFather({
      configureLabel: '📱 Mini App',
      enableLabel: 'Turn on',
      onUrl: flip,
    })
    const r = await run(fb).result
    expect(r.status).toBe('enabled')
    expect(fb.pressed).toEqual([
      `@${BOT}`,
      'Bot Settings',
      '📱 Mini App',
      'Turn on',
    ])
  })

  it('an explicit url on our host wins over the menu button', async () => {
    const fb = botFather({ onUrl: flip })
    const r = await run(fb, {
      bot: `@${BOT}`,
      url: 'https://vibee-editor-production.up.railway.app',
    }).result
    expect(r.url_source).toBe('argument')
    expect(fb.sent[1]).toBe('https://vibee-editor-production.up.railway.app/')
  })
})

describe('it stops on surprise, and says where', () => {
  it('a missing button: no Mini App entry on Bot Settings -- stops, the URL is never sent', async () => {
    const fb = botFather({
      settingsButtons: ['Inline Mode', 'Menu Button', '« Back to Bot'],
    })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('configure_mini_app')
    expect(fb.sent).toEqual(['/mybots'])
    expect(fb.pressed).toEqual([`@${BOT}`, 'Bot Settings'])
    expect(r.url_sent).toBe(false)
    expect(r.last_buttons).toEqual([
      'Inline Mode',
      'Menu Button',
      '« Back to Bot',
    ])
    expect(r.transcript!.join('\n')).toContain(`Settings for @${BOT}`)
    expect(lines.at(-2)).toContain('configure_mini_app stop')
  })

  it('a label renamed OUTSIDE the accepted set is a missing button, not a guess', async () => {
    const fb = botFather({ configureLabel: 'Web App Setup' })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('configure_mini_app')
    expect(fb.pressed).not.toContain('Web App Setup')
  })

  it('a similar bot name is not the bot: exact match only', async () => {
    const fb = botFather({
      pages: [[`@my_${BOT}`, `@${BOT}`, `@${BOT.replace('_bot', 's_bot')}`]],
      onUrl: flip,
    })
    const r = await run(fb).result
    expect(r.status).toBe('enabled')
    expect(fb.pressed[0]).toBe(`@${BOT}`)
  })

  it('two buttons that both read like the step stop the run', async () => {
    const fb = botFather({
      settingsButtons: [
        'Configure Mini App',
        'Configure Mini App',
        '« Back to Bot',
      ],
    })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('configure_mini_app')
    expect(fb.sent).toEqual(['/mybots'])
  })

  it('a url or web-view button is never pressed: stops, says why', async () => {
    const fb = botFather({ noData: ['Configure Mini App'] })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('configure_mini_app')
    expect(r.reason).toContain('cannot be pressed')
    expect(fb.pressed).toEqual([`@${BOT}`, 'Bot Settings'])
  })

  it('turns at most MAX_PAGES pages of /mybots, then stops', async () => {
    const pages = Array.from({ length: 8 }, (_, i) => [`@page${i}_test_bot`])
    const fb = botFather({ pages })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('pick_bot')
    expect(fb.pressed.filter(p => p === '»')).toHaveLength(mod.MAX_PAGES - 1)
  })

  it('a bot /mybots does not list stops at open', async () => {
    const fb = botFather({ pages: [['@other_test_bot']] })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('open')
    expect(fb.pressed).toEqual([])
  })

  it('BotFather asking something other than the URL: the URL is not sent', async () => {
    const fb = botFather({
      askText: 'Choose the launch mode for the Main Mini App.',
    })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('send_url')
    expect(fb.sent).toEqual(['/mybots'])
  })

  it('a refusal after the URL stops at confirm even if it also says "updated"', async () => {
    const fb = botFather({
      replyText: 'Sorry, this URL is invalid. Main Mini App was not updated.',
    })
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(r.stopped_at).toBe('confirm')
    expect(r.url_sent).toBe(true)
    expect(r.has_main_web_app).toBe(false)
  })

  it('BotFather says success but getMe does not: unverified, not enabled', async () => {
    const r = await run(botFather()).result
    expect(r.status).toBe('unverified')
    expect(r.has_main_web_app).toBe(false)
  })

  it('a token BotFather prints never leaves in the transcript', async () => {
    const leaked = '900000555:' + 'A'.repeat(35) // secret-guard-ok: invented, token-shaped on purpose
    const fb = botFather({ botButtons: ['Menu Button', '« Back to Bots List'] })
    fb.edit = function (s: Screen) {
      FakeBotFather.prototype.edit.call(this, {
        ...s,
        text: s.text + `\nUse this token: ${leaked}`,
      })
    }
    const r = await run(fb).result
    expect(r.status).toBe('stopped')
    expect(JSON.stringify(r)).not.toContain(leaked)
    expect(r.transcript!.join('\n')).toContain('<redacted>')
  })
})

describe('already on', () => {
  it('getMe says so: nothing is opened, nothing is sent', async () => {
    state[TOKEN_A].hasMainWebApp = true
    const fb = botFather()
    const { result, opened } = run(fb)
    const r = await result
    expect(r.status).toBe('already_on')
    expect(opened).toEqual([])
    expect(fb.sent).toEqual([])
  })

  it('BotFather shows the switch already on: returns already_on, the URL is not sent', async () => {
    const fb = botFather({
      miniAppButtons: ['Edit Mini App URL', 'Disable Mini App', '« Back'],
    })
    const r = await run(fb).result
    expect(r.status).toBe('already_on')
    expect(fb.sent).toEqual(['/mybots'])
    expect(fb.pressed).toEqual([
      `@${BOT}`,
      'Bot Settings',
      'Configure Mini App',
    ])
  })
})

describe('who, which bot, which address', () => {
  it('a caller who is not the platform owner is refused before anything is asked', async () => {
    const fb = botFather({ onUrl: flip })
    const { result, opened } = run(fb, { bot: `@${BOT}` }, stranger)
    await expect(result).rejects.toThrow('владельцу')
    expect(opened).toEqual([])
    expect(api.spy).not.toHaveBeenCalled()
    expect(fb.sent).toEqual([])
  })

  it('the registered tool refuses a stranger too, with no network at all', async () => {
    const net = vi.fn()
    vi.stubGlobal('fetch', net)
    const { TOOLS_BY_NAME } = await import('./src/agent/tools')
    const tool = TOOLS_BY_NAME.get('botfather_main_app')!
    await expect(
      tool.handler({ bot: `@${BOT}`, dry_run: true }, stranger)
    ).rejects.toThrow('владельцу')
    expect(net).not.toHaveBeenCalled()
  })

  it('a bot that is not in the farm is refused', async () => {
    const { result, opened } = run(botFather(), { bot: '@stranger_test_bot' })
    await expect(result).rejects.toThrow('не из фермы')
    expect(opened).toEqual([])
  })

  it('a menu button that points elsewhere is refused', async () => {
    state[TOKEN_A].menuUrl = 'https://example.com/app'
    const { result, opened } = run(botFather())
    await expect(result).rejects.toThrow('не наше приложение')
    expect(opened).toEqual([])
  })

  it('an explicit url off our host, or not https, is refused', async () => {
    await expect(
      run(botFather(), {
        bot: `@${BOT}`,
        url: 'https://app.t27.ai.example.com',
      }).result
    ).rejects.toThrow('не наше приложение')
    await expect(
      run(botFather(), { bot: `@${BOT}`, url: 'http://app.t27.ai' }).result
    ).rejects.toThrow(/https/)
  })

  it('whitespace or a control character inside the url is refused, not stripped', async () => {
    // new URL() silently drops \n and \t, so the check saw app.t27.ai
    // while BotFather would have been sent both lines.
    for (const url of [
      'https://app.t27.ai/\nhttps://evil.example',
      'https://app.t27.ai/\thttps://evil.example',
      'https://app.t27.ai/ https://evil.example',
      'https://app.t27.ai/\u0000x',
      'https://app.t27.ai/\u200bx',
    ]) {
      const fb = botFather({ onUrl: flip })
      const { result, opened } = run(fb, { bot: `@${BOT}`, url })
      await expect(result).rejects.toThrow('пробел')
      expect(opened).toEqual([])
      expect(fb.sent).toEqual([])
    }
  })

  it('a menu button url with a newline inside is refused too', async () => {
    state[TOKEN_A].menuUrl = 'https://app.t27.ai/\nhttps://evil.example'
    const { result, opened } = run(botFather())
    await expect(result).rejects.toThrow('пробел')
    expect(opened).toEqual([])
  })

  it('a port on our host is refused', async () => {
    const fb = botFather({ onUrl: flip })
    const { result, opened } = run(fb, {
      bot: `@${BOT}`,
      url: 'https://app.t27.ai:4444/',
    })
    await expect(result).rejects.toThrow('порт')
    expect(opened).toEqual([])
  })

  it('BotFather is sent the normalised address that was checked, not the raw string', async () => {
    const fb = botFather({ onUrl: flip })
    const r = await run(fb, {
      bot: `@${BOT}`,
      url: 'https://APP.t27.ai:443/app?from=bot',
    }).result
    expect(r.status).toBe('enabled')
    expect(fb.sent[1]).toBe('https://app.t27.ai/app?from=bot')
    expect(r.url).toBe('https://app.t27.ai/app?from=bot')
  })

  it('the driver, called directly with a bad url, sends nothing at all', async () => {
    const fb = botFather({ onUrl: flip })
    const d = await mod.driveBotFather(
      fb,
      { username: BOT, url: 'https://app.t27.ai/\nhttps://evil.example' },
      { stepTimeoutMs: 150, pollMs: 2, log: () => {} }
    )
    expect(d.outcome).toBe('stopped')
    expect(d.stoppedAt).toBe('send_url')
    expect(d.urlSent).toBe(false)
    expect(fb.sent).toEqual([])
  })

  it('the driver, called directly, sends the normalised form it checked', async () => {
    const fb = botFather({ onUrl: flip })
    const d = await mod.driveBotFather(
      fb,
      { username: BOT, url: 'https://APP.t27.ai:443/app' },
      { stepTimeoutMs: 150, pollMs: 2, log: () => {} }
    )
    expect(d.outcome).toBe('confirmed')
    expect(fb.sent).toEqual(['/mybots', 'https://app.t27.ai/app'])
  })

  it('no web_app menu button and no url: refused, not guessed', async () => {
    state[TOKEN_A].menuUrl = null
    await expect(run(botFather()).result).rejects.toThrow('передайте url')
  })

  it('dry_run returns the plan and opens nothing', async () => {
    const fb = botFather()
    const { result, opened } = run(fb, { bot: `@${BOT}`, dry_run: true })
    const r = await result
    expect(r.status).toBe('dry_run')
    expect(r.url).toBe(APP_HREF)
    expect(r.plan).toHaveLength(8)
    expect(r.plan!.join('\n')).toContain('Configure Mini App'.toLowerCase())
    expect(opened).toEqual([])
    expect(fb.sent).toEqual([])
  })

  it('a bot on our own Bot API server is asked there, never at api.telegram.org', async () => {
    process.env.TELEGRAM_API_ROOT = 'http://bot-api.test:8081'
    process.env.TELEGRAM_API_FILES_ROOT = 'http://bot-api.test:8082'
    process.env.BOT_API_LOCAL_BOTS = '900000101'
    await run(botFather(), { bot: `@${BOT}`, dry_run: true }).result
    const mine = api.urls.filter(u => u.includes(TOKEN_A))
    expect(mine.length).toBeGreaterThan(0)
    for (const u of mine)
      expect(u.startsWith('http://bot-api.test:8081/bot')).toBe(true)
    expect(mine.some(u => u.endsWith('/getChatMenuButton'))).toBe(true)
  })

  it('one run at a time: a second call during a run is refused', async () => {
    const first = run(botFather({ askLater: 60, onUrl: flip }))
    await new Promise(r => setTimeout(r, 5))
    const second = run(botFather())
    await expect(second.result).rejects.toThrow('уже настраивается')
    expect((await first.result).status).toBe('enabled')
  })
})

describe('a BotFather call that never returns', () => {
  const never = () => new Promise<never>(() => {})

  /** The run stops in bounded time, closes the chat, and frees the lock. */
  async function stopsAndReleases(fb: FakeBotFather) {
    const t0 = Date.now()
    const { result, opened } = run(fb)
    const r = await result
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r.status).toBe('stopped')
    expect(opened).toEqual(['chat', 'closed'])
    const next = await run(botFather({ onUrl: flip })).result
    expect(next.status).toBe('enabled')
    return r
  }

  it('reading BotFather hangs after the bot is pressed: stops at pick_bot', async () => {
    const fb = botFather()
    const read = fb.latest.bind(fb)
    fb.latest = () => (fb.pressed.length ? never() : read())
    const r = await stopsAndReleases(fb)
    expect(r.stopped_at).toBe('pick_bot')
    expect(r.url_sent).toBe(false)
  }, 5000)

  it('the very first read hangs: stops at open, nothing is sent', async () => {
    const fb = botFather()
    fb.latest = never
    const r = await stopsAndReleases(fb)
    expect(r.stopped_at).toBe('open')
    expect(fb.sent).toEqual([])
  }, 5000)

  it('sending /mybots hangs: stops at open', async () => {
    const fb = botFather()
    fb.send = never
    const r = await stopsAndReleases(fb)
    expect(r.stopped_at).toBe('open')
  }, 5000)

  it('a press hangs and the screen never changes: stops at that step', async () => {
    const fb = botFather()
    fb.press = never
    const r = await stopsAndReleases(fb)
    expect(r.stopped_at).toBe('pick_bot')
    expect(r.reason).toContain('in time')
  }, 5000)

  it('sending the URL hangs: stops at send_url and says it may have gone', async () => {
    const fb = botFather()
    const send = fb.send.bind(fb)
    fb.send = (text: string) =>
      text.startsWith('https://') ? never() : send(text)
    const r = await stopsAndReleases(fb)
    expect(r.stopped_at).toBe('send_url')
    expect(r.url_sent).toBe(true)
  }, 5000)

  it('a completed run releases the lock: the next run goes ahead', async () => {
    // Enabled, unverified, stopped: each one frees the lock for the next.
    expect((await run(botFather({ onUrl: flip })).result).status).toBe(
      'enabled'
    )
    state[TOKEN_A].hasMainWebApp = false
    expect((await run(botFather()).result).status).toBe('unverified')
    const stopped = await run(
      botFather({ settingsButtons: ['Menu Button', '« Back to Bot'] })
    ).result
    expect(stopped.status).toBe('stopped')
    expect((await run(botFather()).result).status).toBe('unverified')
  })
})

describe('the registry', () => {
  it('is on /mcp, and never listed to a model turn inside the render', async () => {
    const { toMcpTools, toOpenAITools, DIRECT_CALL_ONLY } = await import(
      './src/agent/tools'
    )
    expect(toMcpTools().map(t => t.name)).toContain('botfather_main_app')
    expect(DIRECT_CALL_ONLY.has('botfather_main_app')).toBe(true)
    expect(toOpenAITools().map(t => t.function.name)).not.toContain(
      'botfather_main_app'
    )
  })
})

describe('the real BotFather adapter', () => {
  it('reads the newest message that is not ours, and presses by callback data', async () => {
    const invoked: any[] = []
    const gram = {
      sendMessage: vi.fn(async () => undefined),
      getMessages: vi.fn(async () => [
        { id: 12, out: true, message: 'https://app.t27.ai' },
        {
          id: 11,
          out: false,
          message: 'Settings for @neuro_test_bot.',
          editDate: 1700000000,
          replyMarkup: {
            className: 'ReplyInlineMarkup',
            rows: [
              {
                buttons: [
                  {
                    className: 'KeyboardButtonCallback',
                    text: 'Configure Mini App',
                    data: Buffer.from('x1'),
                  },
                  {
                    className: 'KeyboardButtonUrl',
                    text: 'Help',
                    url: 'https://core.telegram.org',
                  },
                ],
              },
            ],
          },
        },
      ]),
      invoke: vi.fn(async (r: unknown) => {
        invoked.push(r)
        return {}
      }),
    }
    const chat = mod.gramBotFather(gram)
    const m = await chat.latest()
    expect(m).toMatchObject({
      id: 11,
      editDate: 1700000000,
      text: 'Settings for @neuro_test_bot.',
    })
    expect(m!.buttons.map(b => [b.text, Boolean(b.data)])).toEqual([
      ['Configure Mini App', true],
      ['Help', false],
    ])
    await chat.press(11, m!.buttons[0].data!)
    expect(invoked[0].className).toBe('messages.GetBotCallbackAnswer')
    expect(invoked[0].peer).toBe('BotFather')
    expect(invoked[0].msgId).toBe(11)
    expect(Buffer.from(invoked[0].data).toString()).toBe('x1')
    await chat.send('/mybots')
    expect(gram.sendMessage).toHaveBeenCalledWith('BotFather', {
      message: '/mybots',
    })
  })
})

describe('the matching rules', () => {
  const b = (...labels: string[]) => labels.map(text => ({ text }))

  it('labels match exactly after trimming emoji and case, never as a substring', () => {
    expect(mod.labelKey('⚙️ Bot Settings')).toBe('bot settings')
    expect(mod.labelKey('@Neuro_Test_Bot')).toBe('@neuro_test_bot')
    const pick = mod.pickButton(
      b('Menu Button', 'Mini App Directory', 'Enable Mini App Notifications'),
      [
        ...mod.STEP_LABELS.configure_mini_app,
        ...mod.STEP_LABELS.enable_mini_app,
      ]
    )
    expect(pick).toEqual({ missing: true })
    expect(
      mod.pickButton(
        b('Menu Button', '📱 Mini App'),
        mod.STEP_LABELS.configure_mini_app
      )
    ).toEqual({
      found: { text: '📱 Mini App' },
    })
  })

  it('the next page is », never a back button', () => {
    expect(mod.isNextPage('»')).toBe(true)
    expect(mod.isNextPage('Next »')).toBe(true)
    expect(mod.isNextPage('« Back to Bots List')).toBe(false)
    expect(mod.isNextPage('Bot Settings')).toBe(false)
  })
})
