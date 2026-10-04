/**
 * THE SPLIT REEL IS ONE SERVER CALL (owner, 2026-10-03: reels only through
 * the render server's own tools; split-reel.t27).
 *
 * What must hold:
 *   1. one call makes the voice, the b-roll stills (spec's BROLL_MODEL, no
 *      text), the lip-sync (spec's LIPSYNC_MODEL), captions from the FINAL
 *      voice, and the SplitTalkingHead render with the spec's props;
 *   2. a voice longer than SPEECH_MAX_SECONDS is refused before any still or
 *      lip-sync is paid for;
 *   3. every failure names the parts already paid for, and a second call
 *      with them makes nothing twice;
 *   4. a client's reel speaks with the client's clone (for_lead);
 *   5. no timed words means no reel, and the clip comes back;
 *   6. only the house's own reel ends on the house bot or carries a house
 *      name the agent put in (split-reel v7): a client's reel and an
 *      ordinary seller's own reel end on her call, and her own words stand.
 */
import { describe, it, expect, vi } from 'vitest'
import { SplitTalkingHeadSchema } from '../compositions/SplitTalkingHead'
import * as SPEC from '../spec/split-reel.gen'
import {
  brollPrompt,
  languageOf,
  makeSplitReelTool,
  speechEnd,
  splitShotsFor,
  type HeardVoice,
  type SplitReelSenses,
} from './split-reel-tool'
import { readTimedWords } from './media-library'
import { STORY_DEFAULT_CTA } from './story-template'

/*
 * Most of this suite is the owner's own reel, so its caller is a house id
 * (HOUSE_TELEGRAM_IDS is read once at load, hence vi.hoisted). Callers who
 * are not the house -- a seller, a client turn -- are their own cases below.
 */
const HOUSE_ID = vi.hoisted(() => {
  process.env.HOUSE_TELEGRAM_IDS = '900000001'
  return '900000001'
})
const SELLER_ID = '900000077'
const CLIENT_ID = '900000005'

type Call = { name: string; args: Record<string, any> }

function fakeTools(
  o: Partial<Record<string, (a: any, i: number) => any>> = {}
) {
  const calls: Call[] = []
  const counters: Record<string, number> = {}
  const make = (name: string, answer: (a: any, i: number) => any) => ({
    name,
    description: '',
    parameters: {},
    handler: async (args: Record<string, any>) => {
      calls.push({ name, args })
      counters[name] = (counters[name] ?? 0) + 1
      return answer(args, counters[name] - 1)
    },
  })
  const tools: Record<string, any> = {
    image_edit: make(
      'image_edit',
      o.image_edit ??
        ((_a, i) => ({ done: true, url: `https://ours/broll-${i}.png` }))
    ),
    audio_generate: make(
      'audio_generate',
      o.audio_generate ??
        (a => ({
          сделано: true, // cyrillic-ok: audio_generate's own answer key
          url: 'https://ours/voice.mp3',
          голос: a.for_lead ? 'клон клиента' : 'клон владельца', // cyrillic-ok: audio_generate's own answer
        }))
    ),
    lipsync_generate: make(
      'lipsync_generate',
      o.lipsync_generate ??
        (() => ({ done: true, url: 'https://ours/clip.mp4', seconds: 9 }))
    ),
    reel_render: make(
      'reel_render',
      o.reel_render ?? (() => ({ готово: true, url: 'https://ours/reel.mp4' })) // cyrillic-ok: reel_render's own answer key
    ),
  }
  return { lookup: (n: string) => tools[n], calls }
}

const WORDS = [
  { word: 'Hello', start: 0.4, end: 0.8 },
  { word: 'this', start: 1.0, end: 1.2 },
  { word: 'is', start: 1.25, end: 1.4 },
  { word: 'Trinity', start: 1.5, end: 2.1 },
  { word: 'write', start: 7.0, end: 7.4 },
  { word: 'now', start: 8.5, end: 8.9 },
]

function senses(
  o: { seconds?: number; heard?: HeardVoice | string } = {}
): SplitReelSenses & { heardUrls: string[]; measured: string[] } {
  const heardUrls: string[] = []
  const measured: string[] = []
  return {
    heardUrls,
    measured,
    length: async url => {
      measured.push(url)
      return o.seconds ?? 9
    },
    hear: async url => {
      heardUrls.push(url)
      return o.heard ?? { words: WORDS }
    },
  }
}

const ctx = {
  telegramId: HOUSE_ID,
  pool: { query: async () => ({ rows: [] }) },
} as never

/** A pool whose crm_client_profiles row holds the client's approved call. */
function poolWithCall(call: string) {
  const asked: string[] = []
  return {
    asked,
    query: async (sql: string) => {
      asked.push(sql)
      return /crm_client_profiles/.test(sql)
        ? { rows: [{ profile: { approved_cta: call } }] }
        : { rows: [] }
    },
  }
}

/** The client's reel: the agent wrote these words, no house name in them. */
const CLIENT_TEXT = 'Hello, this is Anna ... write now'

const ARGS = {
  image_url: 'https://ours/studio.png',
  text: 'Hello, this is Trinity ... write now',
  brolls: ['a sunlit workshop', 'a night city street', 'a quiet library'],
}

describe('split_reel -- the split reel as one server call', () => {
  it('makes voice, stills, lip-sync, captions and the template in one call', async () => {
    const { lookup, calls } = fakeTools()
    const s = senses()
    const out: any = await makeSplitReelTool(lookup, s).handler(ARGS, ctx)
    expect(out.done).toBe(true)
    expect(out.url).toBe('https://ours/reel.mp4')
    expect(out.give_to_person).toBe('https://ours/reel.mp4')

    const names = calls.map(c => c.name)
    expect(names[0]).toBe('audio_generate')
    expect(names.at(-1)).toBe('reel_render')
    expect(names.indexOf('lipsync_generate')).toBeGreaterThan(
      names.lastIndexOf('image_edit')
    )

    // b-roll: the spec's model, from the face frame, no text in them, and
    // only as many as the voice has split shots.
    const edits = calls.filter(c => c.name === 'image_edit')
    expect(edits).toHaveLength(Math.min(3, splitShotsFor(9)))
    for (const e of edits) {
      expect(e.args.model).toBe(SPEC.BROLL_MODEL)
      expect(e.args.image_url).toBe(ARGS.image_url)
      expect(e.args.prompt).toMatch(/No text/)
    }

    const lip = calls.find(c => c.name === 'lipsync_generate')!
    expect(lip.args).toEqual({
      image_url: ARGS.image_url,
      voice_url: 'https://ours/voice.mp3',
      model: SPEC.LIPSYNC_MODEL,
    })

    // Captions come from the clip -- the final voice -- not the voice file.
    expect(s.heardUrls).toEqual(['https://ours/clip.mp4'])

    const render = calls.find(c => c.name === 'reel_render')!
    expect(render.args.compositionId).toBe(SPEC.COMPOSITION)
    const props = render.args.props
    expect(SplitTalkingHeadSchema.safeParse(props).success).toBe(true)
    expect(props.lipSyncVideo).toBe('https://ours/clip.mp4')
    expect(props.captionColor).toBe(SPEC.CAPTION_COLOR)
    expect(props.ctaText).toBe(SPEC.OWNER_CTA)
    expect(props.pauseSec).toBe(SPEC.CTA_PAUSE_SEC)
    expect(props.speechSec).toBe(8.9)
    expect(props.captions.map((c: any) => c.text)).toEqual(
      WORDS.map(w => w.word)
    )
    expect(props.captions[0].startMs).toBe(400)
    const splits = props.segments.filter((g: any) => g.type === 'split')
    expect(splits.length).toBeGreaterThan(0)
    expect(splits[0].bRollUrl).toBe('https://ours/broll-0.png')
    expect(props.segments[0].type).toBe('fullscreen')
    expect(out.seconds).toBe(8.9 + SPEC.CTA_PAUSE_SEC)
    expect(out.captions).toBe(WORDS.length)
  })

  it('refuses a voice too long for the format before stills or lip-sync', async () => {
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(
      lookup,
      senses({ seconds: SPEC.SPEECH_MAX_SECONDS + 1 })
    ).handler(ARGS, ctx)
    expect(out.done).toBe(false)
    expect(out.reason).toMatch(String(SPEC.SPEECH_MAX_SECONDS))
    expect(calls.map(c => c.name)).toEqual(['audio_generate'])
    // The long voice is not offered back as a part to reuse.
    expect(out.voice_url).toBeUndefined()
  })

  it('uses the seconds audio_generate already reported instead of measuring', async () => {
    const { lookup } = fakeTools({
      audio_generate: () => ({
        сделано: true, // cyrillic-ok: audio_generate's own answer key
        url: 'https://ours/voice.mp3',
        seconds: 4,
      }),
    })
    const s = senses()
    const out: any = await makeSplitReelTool(lookup, s).handler(ARGS, ctx)
    expect(out.done).toBe(true)
    expect(s.measured).toEqual([])
  })

  it('a lip-sync failure names the paid parts; the retry makes nothing twice', async () => {
    const broken = fakeTools({
      lipsync_generate: () => ({ done: false, reason: 'provider is down' }),
    })
    const first: any = await makeSplitReelTool(broken.lookup, senses()).handler(
      ARGS,
      ctx
    )
    expect(first.done).toBe(false)
    expect(first.reason).toMatch(/provider is down/)
    expect(first.voice_url).toBe('https://ours/voice.mp3')
    expect(first.broll_urls.filter(Boolean).length).toBeGreaterThan(0)
    expect(first.how_to_continue).toMatch(/split_reel/)

    const { lookup, calls } = fakeTools()
    const second: any = await makeSplitReelTool(lookup, senses()).handler(
      { ...ARGS, voice_url: first.voice_url, broll_urls: first.broll_urls },
      ctx
    )
    expect(second.done).toBe(true)
    expect(calls.map(c => c.name)).toEqual(['lipsync_generate', 'reel_render'])
  })

  it('a resumed clip goes straight to captions and the template', async () => {
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      {
        ...ARGS,
        voice_url: 'https://ours/voice.mp3',
        clip: 'https://ours/clip-old.mp4',
        broll_urls: ['https://ours/a.png', 'https://ours/b.png'],
      },
      ctx
    )
    expect(out.done).toBe(true)
    expect(calls.map(c => c.name)).toEqual(['reel_render'])
    expect(out.clip).toBe('https://ours/clip-old.mp4')
  })

  it('a still that is still drawing stops before the lip-sync', async () => {
    const { lookup, calls } = fakeTools({
      image_edit: (_a, i) =>
        i === 0
          ? { pending: true, taskId: 't-1' }
          : { done: true, url: `https://ours/broll-${i}.png` },
    })
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      ARGS,
      ctx
    )
    expect(out.done).toBe(false)
    expect(out.voice_url).toBe('https://ours/voice.mp3')
    expect(calls.some(c => c.name === 'lipsync_generate')).toBe(false)
  })

  it('no timed words: no reel, and the clip comes back', async () => {
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(
      lookup,
      senses({ heard: { words: [] } })
    ).handler(ARGS, ctx)
    expect(out.done).toBe(false)
    expect(out.clip).toBe('https://ours/clip.mp4')
    expect(calls.some(c => c.name === 'reel_render')).toBe(false)
  })

  it("a client's reel speaks with the client's clone", async () => {
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT, for_lead: '123', cta: '@example_bot' },
      ctx
    )
    expect(out.done).toBe(true)
    expect(calls[0].args.for_lead).toBe('123')
    expect(out.voice).toBe('клон клиента') // cyrillic-ok: audio_generate's own answer
    const render = calls.find(c => c.name === 'reel_render')!
    expect(render.args.props.ctaText).toBe('@example_bot')
  })

  it("a client turn: her voice, her profile's call, never the house bot", async () => {
    const pool = poolWithCall('Book a fitting')
    const turn = { telegramId: HOUSE_ID, faceOf: CLIENT_ID, pool } as never
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT },
      turn
    )
    expect(out.done).toBe(true)
    expect(calls[0].args.for_lead).toBe(CLIENT_ID)
    const props = calls.find(c => c.name === 'reel_render')!.args.props
    expect(props.ctaText).toBe('Book a fitting')
    expect(pool.asked.some(q => /crm_client_profiles/.test(q))).toBe(true)

    // No call in her profile: the neutral call, still not the house bot --
    // even when the agent hands the house bot in as the call.
    const bare = fakeTools()
    await makeSplitReelTool(bare.lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT, cta: SPEC.OWNER_CTA },
      {
        telegramId: HOUSE_ID,
        faceOf: CLIENT_ID,
        pool: poolWithCall(''),
      } as never
    )
    const bareProps = bare.calls.find(c => c.name === 'reel_render')!.args.props
    expect(bareProps.ctaText).toBe(STORY_DEFAULT_CTA)
    expect(bareProps.ctaText).not.toBe(SPEC.OWNER_CTA)
  })

  it('a client turn refuses a house name the agent put in, before any call', async () => {
    const turn = {
      telegramId: HOUSE_ID,
      faceOf: CLIENT_ID,
      pool: poolWithCall(''),
    } as never
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      ARGS,
      turn
    )
    expect(out.done).toBe(false)
    expect(out.reason).toMatch(/Тринити/) // cyrillic-ok: the refusal names the brand
    expect(calls).toEqual([])
  })

  it('a client turn makes no reel for another lead', async () => {
    const turn = {
      telegramId: HOUSE_ID,
      faceOf: CLIENT_ID,
      pool: poolWithCall(''),
    } as never
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT, for_lead: '900000006' },
      turn
    )
    expect(out.done).toBe(false)
    expect(calls).toEqual([])
  })

  it("an ordinary seller's own reel works and never ends on the house bot", async () => {
    const seller = {
      telegramId: SELLER_ID,
      pool: { query: async () => ({ rows: [] }) },
    } as never
    const { lookup, calls } = fakeTools()
    const out: any = await makeSplitReelTool(lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT },
      seller
    )
    expect(out.done).toBe(true)
    expect(calls[0].args.for_lead).toBeUndefined()
    const props = calls.find(c => c.name === 'reel_render')!.args.props
    expect(props.ctaText).toBe(STORY_DEFAULT_CTA)
    expect(props.ctaText).not.toBe(SPEC.OWNER_CTA)

    // Her own call stands; the house bot handed in as her call does not.
    const given = fakeTools()
    await makeSplitReelTool(given.lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT, cta: 'Call Anna' },
      seller
    )
    expect(
      given.calls.find(c => c.name === 'reel_render')!.args.props.ctaText
    ).toBe('Call Anna')
    const bot = fakeTools()
    await makeSplitReelTool(bot.lookup, senses()).handler(
      { ...ARGS, text: CLIENT_TEXT, cta: SPEC.OWNER_CTA },
      seller
    )
    expect(
      bot.calls.find(c => c.name === 'reel_render')!.args.props.ctaText
    ).not.toBe(SPEC.OWNER_CTA)
  })

  it('a «Тринити» she wrote herself stands; the same word from the agent does not', async () => {
    // cyrillic-ok: the brand as she typed it
    const pool = { query: async () => ({ rows: [] }) }
    const theAgent = fakeTools()
    const refused: any = await makeSplitReelTool(
      theAgent.lookup,
      senses()
    ).handler(ARGS, { telegramId: SELLER_ID, pool } as never)
    expect(refused.done).toBe(false)
    expect(theAgent.calls).toEqual([])

    const hers = fakeTools()
    const out: any = await makeSplitReelTool(hers.lookup, senses()).handler(
      ARGS,
      {
        telegramId: SELLER_ID,
        ownerSaid: 'make my reel: Hello, this is Trinity ... write now',
        pool,
      } as never
    )
    expect(out.done).toBe(true)
    const props = hers.calls.find(c => c.name === 'reel_render')!.args.props
    expect(props.ctaText).not.toBe(SPEC.OWNER_CTA)
  })

  it('refuses for free what it can refuse for free', async () => {
    const { lookup, calls } = fakeTools()
    const tool = makeSplitReelTool(lookup, senses())
    for (const bad of [
      { ...ARGS, image_url: 'nope' },
      { ...ARGS, text: ' ' },
      { ...ARGS, brolls: [] },
      { ...ARGS, brolls: Array(splitShotsFor(SPEC.MAX_SECONDS) + 1).fill('x') },
    ]) {
      const out: any = await tool.handler(bad, ctx)
      expect(out.done).toBe(false)
    }
    expect(calls).toEqual([])
  })

  it('helpers read the spec, not literals', () => {
    expect(splitShotsFor(SPEC.OPEN_FULL_FRAMES / SPEC.FPS)).toBe(0)
    expect(splitShotsFor(SPEC.MAX_SECONDS)).toBeGreaterThan(0)
    expect(brollPrompt('a garden')).toMatch(/^a garden\./)
    expect(speechEnd(WORDS)).toBe(8.9)
    expect(languageOf('Привет')).toBe('ru') // cyrillic-ok: a Russian line to detect
    expect(languageOf('Hello')).toBeUndefined()
  })

  it('reads word times from every reply shape whisper servers use', () => {
    const flat = JSON.stringify({
      text: 'a b',
      words: [
        { word: 'a', start: 0, end: 0.2 },
        { word: 'b', start: 0.3, end: 0.5 },
      ],
    })
    expect(readTimedWords(flat)).toHaveLength(2)
    const nested = JSON.stringify({
      segments: [{ words: [{ word: ' a', start: 0, end: 0.2 }] }],
    })
    expect(readTimedWords(nested)).toEqual([{ word: 'a', start: 0, end: 0.2 }])
    const sse =
      'data: {"segments":[{"words":[{"word":"b","start":1,"end":1.2}]}]}\n' +
      'data: {"words":[{"word":"a","start":0,"end":0.4}]}\n' +
      'data: [DONE]\n'
    expect(readTimedWords(sse).map(w => w.word)).toEqual(['a', 'b'])
    expect(readTimedWords('{"text":"no times"}')).toEqual([])
    expect(readTimedWords('')).toEqual([])
  })

  it('audio_generate refuses the owner voice to a sweep before the charge', async () => {
    const { TOOLS_BY_NAME } = await import('./tools')
    const fetched = vi.spyOn(globalThis, 'fetch')
    const said = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const out: any = await TOOLS_BY_NAME.get('audio_generate')!.handler(
        { text: 'Hello, this is Anna' },
        {
          telegramId: HOUSE_ID,
          sellerSweep: true,
          pool: { query: async () => ({ rows: [] }) },
        } as never
      )
      expect(out.сделано).toBe(false) // cyrillic-ok: audio_generate's own answer key
      expect(out.причина).toMatch(/for_lead/) // cyrillic-ok: audio_generate's own answer key
      expect(fetched).not.toHaveBeenCalled()
      // Refused before spendTokens (split-reel v7, REFUSED_BEFORE_SPEND):
      // for the house the charge always leaves its own line naming the tool,
      // so no line naming it means no charge ran -- and no refund either.
      const lines = said.mock.calls.map(c => String(c[0]))
      expect(lines.some(l => /«audio_generate»/.test(l))).toBe(false)
    } finally {
      said.mockRestore()
      fetched.mockRestore()
    }
  }, 60_000)

  it('is in the registry, and out of the small-model kit', async () => {
    const { TOOLS_BY_NAME, toolsForProvider, TOOLS } = await import('./tools')
    expect(TOOLS_BY_NAME.get('split_reel')).toBeTruthy()
    expect(
      toolsForProvider({ compact: true }, TOOLS).some(
        t => t.name === 'split_reel'
      )
    ).toBe(false)
  })
})
