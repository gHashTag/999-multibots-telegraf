/**
 * THE STORY REEL IS ONE CALL (owner, 2026-09-26: "save the template for
 * constant work; add a pause at the end for the CTA").
 *
 * What must hold:
 *   1. one call makes the stills, the voices, the lip-syncs and the StoryReel
 *      render, with the pause and the call to action at the end;
 *   2. a still that is still drawing stops the call BEFORE any voice or
 *      lip-sync is paid for, and the stills made so far come back;
 *   3. a second call with those stills and clips makes nothing twice;
 *   4. a client's reel speaks with the client's clone (for_lead).
 */
import { describe, it, expect } from 'vitest'
import {
  makeStoryReelTool,
  scenesOf,
  stillPrompt,
  KEEP_THE_PERSON,
  STORY_PAUSE_SEC,
} from './story-reel-tool'

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
        ((a, i) => ({
          сделано: true, // cyrillic-ok: audio_generate's own answer key
          url: `https://ours/voice-${i}.mp3`,
          голос: a.for_lead ? 'клон клиента' : 'клон владельца', // cyrillic-ok: audio_generate's own answer
        }))
    ),
    lipsync_generate: make(
      'lipsync_generate',
      o.lipsync_generate ??
        ((a, i) => ({
          done: true,
          url: `https://ours/clip-${i}.mp4`,
          seconds: 3,
        }))
    ),
    reel_render: make(
      'reel_render',
      o.reel_render ?? (() => ({ готово: true, url: 'https://ours/reel.mp4' })) // cyrillic-ok: reel_render's own answer key
    ),
  }
  return { lookup: (n: string) => tools[n], calls }
}

const ctx = {
  telegramId: '900000001',
  pool: { query: async () => ({ rows: [] }) },
} as never
const SCENES = [
  { setting: 'a floral studio', line: 'Я флорист из Перми.' }, // cyrillic-ok: a spoken line
  { setting: 'a workbench with a ceramic vase', line: 'Собираю букеты.' }, // cyrillic-ok: a spoken line
  { setting: 'a living room at dusk', line: 'Пишите мне в директ.' }, // cyrillic-ok: a spoken line
]
const ARGS = {
  image_url: 'https://ours/face.jpg',
  scenes: SCENES,
  cta: 'в директ',
} // cyrillic-ok: a call to action

describe('story_reel', () => {
  it('makes the whole reel in one call, ending on the pause with the call to action', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(ARGS, ctx)
    expect(r.done).toBe(true)
    expect(r.url).toBe('https://ours/reel.mp4')
    const count = (n: string) => calls.filter(c => c.name === n).length
    expect([
      count('image_edit'),
      count('audio_generate'),
      count('lipsync_generate'),
      count('reel_render'),
    ]).toEqual([3, 3, 3, 1])
    const render = calls.find(c => c.name === 'reel_render')!.args
    expect(render.compositionId).toBe('StoryReel')
    expect(render.props.pauseSec).toBe(STORY_PAUSE_SEC)
    expect(render.props.cta).toBe('в директ') // cyrillic-ok: a call to action
    expect(render.props.scenes).toHaveLength(3)
    // Every still is drawn from the one source photo, never from a previous still.
    for (const c of calls.filter(c => c.name === 'image_edit'))
      expect(c.args.image_url).toBe('https://ours/face.jpg')
  })

  it('a still still drawing stops the call before any voice is paid for', async () => {
    const { lookup, calls } = fakeTools({
      image_edit: (_a, i) =>
        i === 1
          ? { done: false, pending: true, taskId: 't1' }
          : { done: true, url: `https://ours/still-${i}.png` },
    })
    const r: any = await makeStoryReelTool(lookup).handler(ARGS, ctx)
    expect(r.done).toBe(false)
    expect(r.reason).toMatch(/ещё рисуется/) // cyrillic-ok: the answer under test
    expect(r.stills.filter(Boolean)).toHaveLength(2)
    expect(calls.some(c => c.name === 'audio_generate')).toBe(false)
    expect(calls.some(c => c.name === 'lipsync_generate')).toBe(false)
  })

  it('a second call with the stills and clips it was given makes nothing twice', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(
      {
        ...ARGS,
        stills: [
          'https://ours/s0.png',
          'https://ours/s1.png',
          'https://ours/s2.png',
        ],
        clips: ['https://ours/c0.mp4', '', ''],
      },
      ctx
    )
    expect(r.done).toBe(true)
    const count = (n: string) => calls.filter(c => c.name === n).length
    expect(count('image_edit')).toBe(0)
    expect(count('audio_generate')).toBe(2)
    expect(count('lipsync_generate')).toBe(2)
    const scenes = calls.find(c => c.name === 'reel_render')!.args.props.scenes
    expect(scenes[0].video).toBe('https://ours/c0.mp4')
  })

  it('a failed lip-sync comes back with what was made, and nothing is rendered', async () => {
    const { lookup, calls } = fakeTools({
      lipsync_generate: (_a, i) =>
        i === 2
          ? { done: false, reason: 'provider refused' }
          : { done: true, url: `https://ours/clip-${i}.mp4` },
    })
    const r: any = await makeStoryReelTool(lookup).handler(ARGS, ctx)
    expect(r.done).toBe(false)
    expect(r.clips.filter(Boolean)).toHaveLength(2)
    expect(r.how_to_continue).toMatch(/stills и clips/) // cyrillic-ok: the answer under test
    expect(calls.some(c => c.name === 'reel_render')).toBe(false)
  })

  it('a client reel speaks with the client clone', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(
      { ...ARGS, for_lead: '900000077' },
      ctx
    )
    expect(r.voice).toBe('клон клиента') // cyrillic-ok: audio_generate's own answer
    for (const c of calls.filter(c => c.name === 'audio_generate'))
      expect(c.args.for_lead).toBe('900000077')
  })

  it('refuses bad scenes before spending anything', async () => {
    expect(scenesOf([])).toMatch(/от 1 до 4/) // cyrillic-ok: the answer under test
    expect(scenesOf([{ setting: 'x' }])).toMatch(/line/)
    expect(scenesOf(SCENES)).toHaveLength(3)
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(
      { image_url: 'nope', scenes: SCENES },
      ctx
    )
    expect(r.done).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('keeps the person and changes only the setting, in one style', () => {
    const p = stillPrompt('a server corridor', 'noir, gold pin POINTING DOWN')
    expect(p).toContain('a server corridor')
    expect(p).toContain(KEEP_THE_PERSON)
    expect(p).toContain('POINTING DOWN')
    expect(KEEP_THE_PERSON).toMatch(/never keep the plain background/)
  })

  it('is in the registry, and out of the small-model kit', async () => {
    const { TOOLS_BY_NAME, toolsForProvider, TOOLS } = await import('./tools')
    expect(TOOLS_BY_NAME.get('story_reel')).toBeTruthy()
    expect(
      toolsForProvider({ compact: true }, TOOLS).some(
        t => t.name === 'story_reel'
      )
    ).toBe(false)
  })
})
