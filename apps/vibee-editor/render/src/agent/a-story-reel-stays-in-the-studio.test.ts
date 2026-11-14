/**
 * THE STORY REEL STAYS IN THE STUDIO (owner, 2026-10-03, crm-story-reel v19).
 *
 * "A talking-head reel opens on a wide shot of the talking head, not on a
 * picture"; "it opens on the hook, not on 'good morning in the rain'"; "we do
 * everything without leaving the studio, working with shots". His reel had
 * put him on a street in the rain and opened with a greeting.
 *
 * What must hold:
 *   1. scene 1 is the source photo itself, lip-synced as it is;
 *   2. a scene with no setting is a shot cut from the source, never drawn;
 *   3. a first line that greets is refused before anything is spent;
 *   4. a drawn still with no face is drawn once more, then the run stops
 *      before any voice is paid for;
 *   5. a line heard longer than LINE_MAX_MS gets no lip-sync;
 *   6. the finished reel reaches its buyer through the first bot that delivers.
 */
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { makeStoryReelTool } from './story-reel-tool'
import { cutShot, shotFilter } from './studio-shots'
import { stillShowsAFace } from './still-face'
import { deliverToBuyer } from '../buyer-delivery'
import * as SPEC from '../spec/crm-story-reel.gen'

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
        ((_a, i) => ({ done: true, url: `https://ours/still-${i}.png` }))
    ),
    audio_generate: make(
      'audio_generate',
      o.audio_generate ??
        ((_a, i) => ({
          сделано: true, // cyrillic-ok: audio_generate's own answer key
          url: `https://ours/voice-${i}.mp3`,
          seconds: 2.4,
        }))
    ),
    lipsync_generate: make('lipsync_generate', (_a, i) => ({
      done: true,
      url: `https://ours/clip-${i}.mp4`,
      seconds: 3,
    })),
    reel_render: make('reel_render', () => ({
      готово: true, // cyrillic-ok: reel_render's own answer key
      url: 'https://ours/reel.mp4',
    })),
  }
  return { lookup: (n: string) => tools[n], calls }
}

const ctx = {
  telegramId: '900000001',
  pool: { query: async () => ({ rows: [] }) },
} as never
const SOURCE = 'https://ours/studio-lab.jpg'
const HOOK = 'Девяносто процентов рилсов теряют зрителя за секунду.' // cyrillic-ok: a spoken hook
const count = (calls: Call[], n: string) =>
  calls.filter(c => c.name === n).length

describe('story_reel stays in the studio', () => {
  it('opens on the photo itself and cuts the other scenes from it, drawing nothing', async () => {
    const { lookup, calls } = fakeTools()
    const cuts: [string, number][] = []
    const cut = async (url: string, shot: number) => {
      cuts.push([url, shot])
      return `https://ours/shot-${shot}.jpg`
    }
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      cut
    ).handler(
      {
        image_url: SOURCE,
        scenes: [{ line: HOOK }, { line: 'Два.' }, { line: 'Три.' }], // cyrillic-ok: lines
      },
      ctx
    )
    expect(r.done).toBe(true)
    expect(count(calls, 'image_edit'), 'nothing is drawn').toBe(0)
    expect(cuts).toEqual([
      [SOURCE, SPEC.SHOT_CLOSE],
      [SOURCE, SPEC.SHOT_MEDIUM],
    ])
    const faces = calls
      .filter(c => c.name === 'lipsync_generate')
      .map(c => c.args.image_url)
      .sort()
    expect(faces).toEqual(
      [
        SOURCE,
        `https://ours/shot-${SPEC.SHOT_CLOSE}.jpg`,
        `https://ours/shot-${SPEC.SHOT_MEDIUM}.jpg`,
      ].sort()
    )
  })

  it('each clip is heard by itself and its yellow captions show the line as written (v20)', async () => {
    const { lookup, calls } = fakeTools()
    const heardAs: [string, string | undefined][] = []
    const hear = async (url: string, language?: string) => {
      heardAs.push([url, language])
      return {
        words: [
          { word: 'devyanosto', start: 0.1, end: 0.5 },
          { word: 'x', start: 0.5, end: 0.7 },
          { word: 'y', start: 0.7, end: 0.9 },
          { word: 'z', start: 0.9, end: 1.1 },
          { word: 'w', start: 1.1, end: 1.3 },
          { word: 'v', start: 1.3, end: 1.5 },
          { word: 'u', start: 1.5, end: 1.7 },
        ],
      }
    }
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async (_u, shot) => `https://ours/shot-${shot}.jpg`,
      hear
    ).handler(
      { image_url: SOURCE, scenes: [{ line: HOOK }, { line: 'Два.' }] },
      ctx
    ) // cyrillic-ok: a line
    expect(r.done).toBe(true)
    expect(r.captions).toBeTruthy()
    expect(heardAs.map(h => h[1])).toEqual(['ru', 'ru'])
    expect(heardAs.map(h => h[0]).sort()).toEqual([
      'https://ours/clip-0.mp4',
      'https://ours/clip-1.mp4',
    ])
    const render = calls.find(c => c.name === 'reel_render')!
    const scenes = render.args.props.scenes
    // Seven words heard, seven written: the line's spelling, whisper's times.
    expect(scenes[0].captions.map((c: any) => c.text)).toEqual(HOOK.split(' '))
    expect(scenes[0].captions[0].startMs).toBe(100)
    // One word written, seven heard: whisper's own words, not a misalignment.
    expect(scenes[1].captions).toHaveLength(7)
  })

  it('a deaf run still renders the reel, without captions, and says so (v20)', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async (_u, shot) => `https://ours/shot-${shot}.jpg`,
      async () => 'ролика нет на полке' // cyrillic-ok: the sense's own reason
    ).handler({ image_url: SOURCE, scenes: [{ line: HOOK }] }, ctx)
    expect(r.done).toBe(true)
    expect(r.captions_missing).toContain('ролика нет на полке') // cyrillic-ok: the reason passed on
    const render = calls.find(c => c.name === 'reel_render')!
    expect(render.args.props.scenes[0].captions).toEqual([])
  })

  it('a setting the person named is still drawn, but never for the opening scene', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async () => 'https://ours/shot.jpg'
    ).handler(
      {
        image_url: SOURCE,
        scenes: [
          { setting: 'a pier', line: HOOK },
          { setting: 'his flower shop', line: 'Два.' }, // cyrillic-ok: a line
        ],
      },
      ctx
    )
    expect(r.done).toBe(true)
    expect(count(calls, 'image_edit')).toBe(1)
    expect(calls.find(c => c.name === 'image_edit')!.args.prompt).toContain(
      'his flower shop'
    )
  })

  it('a first line that greets is refused before anything is spent', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(
      {
        image_url: SOURCE,
        scenes: [
          { line: 'Доброе утро! В дождливую погоду…' }, // cyrillic-ok: the owner's reel of 2026-10-03
          { line: 'Два.' }, // cyrillic-ok: a line
        ],
      },
      ctx
    )
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/^scenes\.0: /)
    expect(calls).toEqual([])
  })

  it('a shot that cannot be cut stops the run before any voice', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup, undefined, undefined, () =>
      Promise.reject(new Error('ffmpeg 1'))
    ).handler(
      { image_url: SOURCE, scenes: [{ line: HOOK }, { line: 'Два.' }] },
      ctx
    ) // cyrillic-ok: a line
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/ffmpeg 1/)
    expect(count(calls, 'audio_generate')).toBe(0)
  })

  it('a drawn still without a face is drawn once more, then the run stops before any voice', async () => {
    const { lookup, calls } = fakeTools()
    const looked: string[] = []
    const eyes = {
      hasFace: async (url: string) => {
        looked.push(url)
        return false
      },
    }
    const r: any = await makeStoryReelTool(lookup, undefined, eyes).handler(
      {
        image_url: SOURCE,
        scenes: [{ line: HOOK }, { setting: 'a pier', line: 'Два.' }], // cyrillic-ok: a line
      },
      ctx
    )
    expect(r.done).toBe(false)
    expect(count(calls, 'image_edit'), 'one redraw').toBe(
      1 + SPEC.STILL_FACE_REDRAWS
    )
    expect(looked).not.toContain(SOURCE)
    expect(count(calls, 'audio_generate')).toBe(0)
    expect(r.stills[0]).toBe(SOURCE)
  })

  it('an unanswered face check keeps the still', async () => {
    const { lookup } = fakeTools()
    const r: any = await makeStoryReelTool(lookup, undefined, {
      hasFace: async () => null,
    }).handler(
      {
        image_url: SOURCE,
        scenes: [{ line: HOOK }, { setting: 'a pier', line: 'Два.' }], // cyrillic-ok: a line
      },
      ctx
    )
    expect(r.done).toBe(true)
  })

  it('a line heard longer than the limit gets no lip-sync, and is named', async () => {
    const { lookup, calls } = fakeTools({
      audio_generate: (_a, i) => ({
        сделано: true, // cyrillic-ok: audio_generate's own answer key
        url: `https://ours/voice-${i}.mp3`,
        seconds: i === 0 ? 4.9 : 2,
      }),
    })
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async () => 'https://ours/shot.jpg'
    ).handler(
      { image_url: SOURCE, scenes: [{ line: HOOK }, { line: 'Два.' }] },
      ctx
    ) // cyrillic-ok: a line
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/4,9 с/) // cyrillic-ok: the answer under test
    expect(count(calls, 'lipsync_generate')).toBe(1)
    expect(count(calls, 'reel_render')).toBe(0)
  })
})

describe('a shot is cut from the source', () => {
  it('the wide shot is the source itself, fetched by no one', async () => {
    const never = () => {
      throw new Error('touched')
    }
    expect(
      await cutShot(SOURCE, SPEC.SHOT_WIDE, {
        fetchBytes: never,
        exec: never,
        put: never,
      })
    ).toBe(SOURCE)
  })

  it('a close shot runs ffmpeg with its filter and lands on the shelf', async () => {
    const ran: string[][] = []
    const url = await cutShot(SOURCE, SPEC.SHOT_CLOSE, {
      fetchBytes: async () => Buffer.from('jpeg'),
      exec: async (bin, args) => {
        ran.push([bin, ...args])
        await fs.writeFile(args[args.length - 1], 'cut')
      },
      put: async (body, name) => `https://ours/${name}:${body}`,
    })
    expect(url).toBe('https://ours/shot-close.jpg:cut')
    expect(ran[0][0]).toBe('ffmpeg')
    expect(ran[0]).toContain(shotFilter(SPEC.SHOT_CLOSE))
  })
})

describe('our eyes and the buyer', () => {
  it('vision that is off or down never refuses a still', async () => {
    expect(await stillShowsAFace(SOURCE, null)).toBeNull()
    expect(
      await stillShowsAFace(SOURCE, () => Promise.reject(new Error('down')))
    ).toBeNull()
    expect(await stillShowsAFace(SOURCE, async () => 'YES')).toBe(true)
  })

  it('the reel goes out through the first bot that delivers, each tried once', async () => {
    const tried: string[] = []
    const ok = await deliverToBuyer(
      '1',
      async token => {
        tried.push(token)
        return token === 'tok:main'
      },
      {
        isHouse: () => true,
        tokenForBot: async n => (n === 'gone_bot' ? null : `tok:${n}`),
        botNameOf: async () => SPEC.HOUSE_DELIVERY_BOT,
        mainToken: 'tok:main',
      }
    )
    expect(ok).toBe(true)
    expect(tried).toEqual([`tok:${SPEC.HOUSE_DELIVERY_BOT}`, 'tok:main'])
  })
})

describe('a photo per scene (crm-story-reel v31)', () => {
  const A = 'https://ours/avatar-a.jpg'
  const B = 'https://ours/avatar-b.jpg'
  const C = 'https://ours/avatar-c.jpg'

  it('opens on scene 1 own photo and cuts every other scene from ITS photo', async () => {
    const { lookup, calls } = fakeTools()
    const cuts: [string, number][] = []
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async (url: string, shot: number) => {
        cuts.push([url, shot])
        return `${url}#shot-${shot}`
      }
    ).handler(
      {
        image_url: SOURCE,
        image_urls: [A, B, C],
        scenes: [{ line: HOOK }, { line: 'Два.' }, { line: 'Три.' }], // cyrillic-ok: lines
      },
      ctx
    )
    expect(r.done).toBe(true)
    expect(cuts).toEqual([
      [B, SPEC.SHOT_CLOSE],
      [C, SPEC.SHOT_MEDIUM],
    ])
    const faces = calls
      .filter(c => c.name === 'lipsync_generate')
      .map(c => c.args.image_url)
      .sort()
    expect(faces).toEqual(
      [
        A,
        `${B}#shot-${SPEC.SHOT_CLOSE}`,
        `${C}#shot-${SPEC.SHOT_MEDIUM}`,
      ].sort()
    )
    expect(faces.some(f => f.startsWith(SOURCE))).toBe(false)
  })

  it('a scene with a setting is drawn from its own photo; a missing one falls back to the source', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(
      lookup,
      undefined,
      undefined,
      async (url: string, shot: number) => `${url}#shot-${shot}`
    ).handler(
      {
        image_url: SOURCE,
        image_urls: [A, B, ''],
        scenes: [
          { line: HOOK },
          { line: 'Два.', setting: 'в кафе' }, // cyrillic-ok: a line and a setting
          { line: 'Три.', setting: 'у моря' }, // cyrillic-ok: a line and a setting
        ],
      },
      ctx
    )
    expect(r.done).toBe(true)
    const drawn = calls
      .filter(c => c.name === 'image_edit')
      .map(c => c.args.image_url)
      .sort()
    expect(drawn).toEqual([B, SOURCE].sort())
  })
})
