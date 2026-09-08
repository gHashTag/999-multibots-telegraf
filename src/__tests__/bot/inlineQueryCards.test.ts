/**
 * Inline mode: `@<bot> <query>` in any chat must answer with service cards.
 *
 * Before this handler existed the bot never subscribed to inline_query and had
 * no handler, so switching inline mode on in BotFather showed users an empty
 * popup. Four things have to hold at once, and each is pinned here:
 *
 * 1. runtime: an inline_query update through a real Telegraf bot yields exactly
 *    one answerInlineQuery whose results carry a deep link to THIS bot
 *    (username read after registration, as launch() fills it) and whose
 *    "open the bot" button is present even when nothing matches;
 * 2. the query filters the catalog (video-only query -> video cards only);
 * 3. every launch site subscribes to inline_query (polling drops what is not
 *    in allowed_updates);
 * 4. the registrar is called from registerCommands, /start routes svc_<key>
 *    into the card's scene, and every card's scene id is a registered scene.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { Telegraf, Telegram } from 'telegraf'
import {
  SERVICE_CARDS,
  START_PARAM_PREFIX,
  matchCards,
  registerInlineQuery,
  serviceFromStartParam,
} from '@/handlers/inlineQuery'
import { ModeEnum } from '@/interfaces/modes'

const BOT = 't27ai_bot'

async function answer(query: string) {
  const sink: Array<{ method: string; payload: any }> = []
  const real = (Telegram.prototype as any).callApi
  ;(Telegram.prototype as any).callApi = async (
    method: string,
    payload: any
  ) => {
    sink.push({ method, payload })
    return true
  }
  try {
    const bot = new Telegraf('111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
    registerInlineQuery(bot as any)
    ;(bot as any).botInfo = {
      id: 111,
      is_bot: true,
      username: BOT,
      first_name: 'B',
    }
    await bot.handleUpdate({
      update_id: 1,
      inline_query: {
        id: 'q1',
        from: { id: 7, is_bot: false, first_name: 'U' },
        query,
        offset: '',
      },
    } as any)
  } finally {
    ;(Telegram.prototype as any).callApi = real
  }
  return sink
}

describe('inline mode: service cards', () => {
  it('answers an empty query with every card, each deep-linking to this bot, plus the open-bot button', async () => {
    const sink = await answer('')
    expect(sink.map(s => s.method)).toEqual(['answerInlineQuery'])
    const { payload } = sink[0]
    expect(payload.inline_query_id).toBe('q1')
    expect(payload.results).toHaveLength(SERVICE_CARDS.length)
    for (const r of payload.results) {
      const card = SERVICE_CARDS.find(c => c.key === r.id)
      expect(card, `unknown result id ${r.id}`).toBeDefined()
      const url = `https://t.me/${BOT}?start=${START_PARAM_PREFIX}${card!.key}`
      expect(r.reply_markup.inline_keyboard[0][0].url).toBe(url)
      expect(r.input_message_content.message_text).toContain(url)
    }
    expect(payload.button).toMatchObject({ start_parameter: 'inline' })
  })

  it('filters by the query and still answers (with the button) when nothing matches', async () => {
    const video = await answer('видео')
    expect(video[0].payload.results.map((r: any) => r.id).sort()).toEqual([
      'image2video',
      'text2video',
    ])
    const none = await answer('qqqzzz')
    expect(none).toHaveLength(1)
    expect(none[0].payload.results).toEqual([])
    expect(none[0].payload.button.start_parameter).toBe('inline')
  })

  it('matchCards is case-insensitive and matches a keyword inside a sentence', () => {
    expect(matchCards('Хочу ОЗВУЧКУ').map(c => c.key)).toEqual(['voice'])
    expect(matchCards('photo').map(c => c.key)).toEqual(['neurophoto'])
  })

  it('serviceFromStartParam accepts only svc_<known key>', () => {
    expect(serviceFromStartParam('svc_neurophoto')?.mode).toBe(
      ModeEnum.NeuroPhoto
    )
    expect(serviceFromStartParam('svc_nope')).toBeUndefined()
    expect(serviceFromStartParam('123')).toBeUndefined()
    expect(serviceFromStartParam(undefined)).toBeUndefined()
  })
})

describe('inline mode: wiring', () => {
  const read = (p: string) =>
    fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('every launch site subscribes to inline_query (4 allowedUpdates blocks)', () => {
    const blocks: string[] = []
    for (const f of ['src/index.ts', 'src/bot.ts']) {
      const src = read(f)
      // bot.ts: `allowedUpdates: [...]`; index.ts: the literal passed to launchWithConflictRetry(bot, name, [...]).
      const re =
        /(?:allowedUpdates\s*[:=]|launchWithConflictRetry\([^[]*)\s*\[([^\]]*)\]/g
      let m: RegExpExecArray | null
      // The function signature `allowedUpdates: string[]` also matches with an
      // empty body; a launch site always lists 'message'.
      while ((m = re.exec(src)))
        if (m[1].includes("'message'")) blocks.push(`${f}: ${m[1]}`)
    }
    expect(blocks).toHaveLength(4)
    for (const b of blocks) {
      expect(b, b).toContain("'business_message'")
      expect(b, b).toContain("'inline_query'")
    }
  })

  it('registerCommands calls the registrar and /start routes svc_ into the scene', () => {
    const src = read('src/navigation/registerCommands.ts')
    expect(src).toMatch(/^\s*registerInlineQuery\(bot\)/m)
    const start = src.indexOf("bot.command('start'")
    const body = src.slice(start, src.indexOf("bot.command('help'", start))
    expect(body).toContain('serviceFromStartParam(startParam)')
    const setMode = body.indexOf('ctx.session.mode = inlineService.mode')
    const enter = body.indexOf('ctx.scene.enter(inlineService.mode)')
    expect(setMode).toBeGreaterThan(-1)
    expect(enter).toBeGreaterThan(setMode)
    // The deep link must not steal a brand-new user from CreateUserScene.
    expect(body.indexOf('ModeEnum.CreateUserScene')).toBeLessThan(setMode)
  })

  it('every card with a scene lands in a scene that registerCommands registers', () => {
    const registry = read('src/navigation/registerCommands.ts')
    const block = registry.slice(
      registry.indexOf('const scenesToRegister'),
      registry.indexOf('new Scenes.Stage')
    )
    const scenesDir = path.join(process.cwd(), 'src/scenes')
    const files = fs
      .readdirSync(scenesDir, { recursive: true })
      .map(String)
      .filter(f => f.endsWith('.ts') && !f.includes('__tests__'))
    const modeKey = (mode: string) =>
      Object.entries(ModeEnum).find(([, v]) => v === mode)?.[0]
    for (const card of SERVICE_CARDS) {
      if (!card.mode) continue
      const key = modeKey(card.mode)
      const declRe = new RegExp(
        `new Scenes\\.(WizardScene|BaseScene)[^(]*\\(\\s*(ModeEnum\\.${key}\\b|'${card.mode}')`
      )
      const registered = files.filter(f => {
        const src = fs.readFileSync(path.join(scenesDir, f), 'utf8')
        if (!declRe.test(src)) return false
        const names = [...src.matchAll(/export const (\w+)/g)].map(m => m[1])
        return names.some(n => new RegExp(`\\b${n}\\b`).test(block))
      })
      expect(
        registered,
        `${card.key} (${card.mode}) has no registered scene`
      ).not.toHaveLength(0)
    }
  })
})
