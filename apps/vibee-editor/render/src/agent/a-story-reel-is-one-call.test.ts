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
import { StoryReelSchema } from '../compositions/StoryReel'
import {
  endCardFromProfile,
  endCardOf,
  makeStoryReelTool,
  scenesOf,
  stillPrompt,
  KEEP_THE_PERSON,
  STORY_PAUSE_SEC,
  type StillTask,
  type StoryLate,
} from './story-reel-tool'
import type { LateOutcome } from './late-picture'
import * as SPEC from '../spec/crm-story-reel.gen'

type Call = { name: string; args: Record<string, any> }

function fakeTools(
  o: Partial<Record<string, (a: any, i: number, c: any) => any>> = {}
) {
  const calls: Call[] = []
  const counters: Record<string, number> = {}
  const make = (name: string, answer: (a: any, i: number, c: any) => any) => ({
    name,
    description: '',
    parameters: {},
    handler: async (args: Record<string, any>, c: any) => {
      calls.push({ name, args })
      counters[name] = (counters[name] ?? 0) + 1
      return answer(args, counters[name] - 1, c)
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

/*
 * THE CLIENT'S OWN VISUAL AT THE END (owner, 2026-09-27: "with her face, and
 * after that her visual at the end"). A client whose profile carries a
 * visual gets an end card in her palette instead of the held last frame.
 */
describe("story_reel ends on the client's own visual", () => {
  const PROFILE = {
    visual: {
      bg: '#0b0d0f',
      text: '#ffffff',
      gold_title: '#ffd700',
      win: '#e0b544',
      accent_cta: '#00ff88',
      font: 'Outfit 300/400/500',
    },
    approved_cta: {
      text: 'Приходите на доску со своим вопросом.', // cyrillic-ok: a call to action
      button: '🎲 Играть',
      bot: '@example_bot',
    },
  }

  it('builds the card from the profile: her colours, her button line', () => {
    expect(endCardFromProfile(PROFILE)).toEqual({
      bg: '#0b0d0f',
      title: '#ffd700',
      text: '#ffffff',
      accent: '#00ff88',
      button: '🎲 Играть · @example_bot',
    })
  })

  it('a profile without a visual has no card, and the reel ends as before', () => {
    expect(
      endCardFromProfile({ approved_cta: PROFILE.approved_cta })
    ).toBeNull()
    expect(endCardFromProfile(null)).toBeNull()
  })

  it('keeps only real colours: anything not #hex is dropped', () => {
    expect(
      endCardOf({ bg: 'url(javascript:x)', title: '#FFD700', accent: 'red' })
    ).toEqual({ title: '#FFD700' })
    expect(endCardOf({ bg: 'nope' })).toBeNull()
  })

  it('hands the card to the StoryReel render', async () => {
    const { lookup, calls } = fakeTools()
    const r: any = await makeStoryReelTool(lookup).handler(
      { ...ARGS, end_card: endCardFromProfile(PROFILE) },
      ctx
    )
    expect(r.done).toBe(true)
    const render = calls.find(c => c.name === 'reel_render')!.args
    expect(render.props.endCard).toMatchObject({
      bg: '#0b0d0f',
      title: '#ffd700',
    })
  })

  it('without a card the render carries none', async () => {
    const { lookup, calls } = fakeTools()
    await makeStoryReelTool(lookup).handler(ARGS, ctx)
    const render = calls.find(c => c.name === 'reel_render')!.args
    expect(render.props.endCard).toBeUndefined()
  })

  it('the StoryReel template accepts the card and fills its defaults', () => {
    const parsed = StoryReelSchema.parse({
      scenes: [{ video: 'https://ours/clip-0.mp4' }],
      endCard: { title: '#ffd700' },
    })
    // Black, white and green by default; only the title was given.
    expect(parsed.endCard).toMatchObject({
      title: '#ffd700',
      text: '#FFFFFF',
      accent: '#00FF88',
      button: '',
    })
    expect(parsed.endCard?.bg).toMatch(/^#0+$/)
  })
})

/*
 * A STILL THAT IS STILL DRAWING IS PAID ONCE (spec v3). The still has no URL
 * yet, so `stills` cannot carry it: before, the next call ordered it again and
 * paid again. The job keeps the provider's task, and a resume asks about it.
 */
describe('a still that is still drawing is paid once', () => {
  const T0 = 1_000_000_000_000
  function lateWith(
    verdict: (taskId: string) => LateOutcome['state'],
    clock = { t: T0 }
  ) {
    const looked: string[] = []
    const refunded: { t: StillTask; why: string }[] = []
    const late: StoryLate = {
      look: async taskId => {
        looked.push(taskId)
        const st = verdict(taskId)
        return st === 'ready'
          ? { state: 'ready', taskId, url: `https://ours/late-${taskId}.png` }
          : st === 'failed'
            ? { state: 'failed', taskId, reason: 'refused' }
            : ({ state: st, taskId, reason: '' } as LateOutcome)
      },
      refund: async (t, _c, why) => {
        refunded.push({ t, why })
      },
      now: () => clock.t,
      // Waiting moves the clock; the test never sleeps.
      sleep: async ms => {
        clock.t += ms
      },
    }
    return { late, looked, refunded, clock }
  }
  const jobCtx = (tasks: (StillTask | null)[], progress: any[] = []): any => ({
    telegramId: '900000001',
    pool: { query: async () => ({ rows: [] }) },
    storyStillTasks: tasks,
    storyProgress: async (p: any) => {
      progress.push(JSON.parse(JSON.stringify(p)))
    },
  })
  const count = (calls: Call[], n: string) =>
    calls.filter(c => c.name === n).length

  it('keeps the task the moment the provider accepts it, with what its charge took', async () => {
    const progress: any[] = []
    let onRowDuringWait: any = null
    const { lookup } = fakeTools({
      image_edit: async (_a, i, c) => {
        if (i !== 1) return { done: true, url: `https://ours/still-${i}.png` }
        // Accepted, charged 8 ...
        await c.onImageTask('task-b', { charged: 8, op: 'image_edit' })
        // ... and a redeploy here would end the call: the row already has it.
        onRowDuringWait = progress.find(
          p => p.stillTasks?.[1]?.task === 'task-b'
        )
        return { done: false, pending: true, taskId: 'task-b', charged: 8 }
      },
    })
    const { late } = lateWith(() => 'running')
    const r: any = await makeStoryReelTool(lookup, late).handler(
      ARGS,
      jobCtx([], progress)
    )
    expect(r.done).toBe(false)
    // Written to the row BEFORE the wait ended: a redeploy mid-wait keeps it.
    expect(onRowDuringWait, 'the task reached the row at accept').toBeTruthy()
    expect(onRowDuringWait.stillTasks[1]).toMatchObject({
      task: 'task-b',
      charged: 8,
      op: 'image_edit',
    })
    expect(r.still_tasks[1]).toMatchObject({ task: 'task-b', charged: 8 })
    expect(r.stills[1]).toBe('')
  })

  it('a resume takes the finished picture and orders nothing', async () => {
    const { lookup, calls } = fakeTools()
    const { late, refunded } = lateWith(() => 'ready')
    const task: StillTask = { task: 'task-b', at: T0, charged: 8 }
    const r: any = await makeStoryReelTool(lookup, late).handler(
      { ...ARGS, stills: ['https://ours/a.png', '', 'https://ours/c.png'] },
      jobCtx([null, task, null])
    )
    expect(r.done).toBe(true)
    expect(count(calls, 'image_edit'), 'the still was not ordered again').toBe(
      0
    )
    expect(r.stills[1]).toBe('https://ours/late-task-b.png')
    expect(refunded).toEqual([])
  })

  it('a resume waits for a still that is still drawing and never orders it again', async () => {
    const { lookup, calls } = fakeTools()
    const { late, refunded, looked } = lateWith(() => 'running')
    const task: StillTask = { task: 'task-b', at: T0, charged: 8 }
    const r: any = await makeStoryReelTool(lookup, late).handler(
      { ...ARGS, stills: ['https://ours/a.png', '', 'https://ours/c.png'] },
      jobCtx([null, task, null])
    )
    expect(r.done).toBe(false)
    expect(count(calls, 'image_edit')).toBe(0)
    expect(count(calls, 'audio_generate'), 'no voice before every still').toBe(
      0
    )
    // Asked through the whole wait, at the spec's pace.
    expect(looked.length).toBe(
      Math.floor(SPEC.STILL_WAIT_MS / SPEC.STILL_POLL_MS) + 1
    )
    expect(r.still_tasks[1]).toMatchObject({ task: 'task-b', at: T0 })
    expect(refunded).toEqual([])
  })

  it('a still the provider refused is given back once and drawn anew', async () => {
    const { lookup, calls } = fakeTools()
    const { late, refunded } = lateWith(() => 'failed')
    const task: StillTask = { task: 'task-b', at: T0, charged: 8 }
    const r: any = await makeStoryReelTool(lookup, late).handler(
      { ...ARGS, stills: ['https://ours/a.png', '', 'https://ours/c.png'] },
      jobCtx([null, task, null])
    )
    expect(r.done).toBe(true)
    expect(refunded).toHaveLength(1)
    expect(refunded[0].t).toMatchObject({ task: 'task-b', charged: 8 })
    expect(count(calls, 'image_edit')).toBe(1)
  })

  it('a still silent past the give-up is given back once and drawn anew', async () => {
    const { lookup, calls } = fakeTools()
    const clock = { t: T0 + SPEC.STILL_GIVE_UP_MS }
    const { late, refunded, looked } = lateWith(() => 'unknown', clock)
    const task: StillTask = { task: 'task-b', at: T0, charged: 8 }
    const r: any = await makeStoryReelTool(lookup, late).handler(
      { ...ARGS, stills: ['https://ours/a.png', '', 'https://ours/c.png'] },
      jobCtx([null, task, null])
    )
    expect(r.done).toBe(true)
    expect(looked).toEqual(['task-b'])
    expect(refunded).toHaveLength(1)
    expect(count(calls, 'image_edit')).toBe(1)
  })

  it("a task named in a model's arguments is never asked about or given back", async () => {
    const { lookup, calls } = fakeTools()
    const { late, looked, refunded } = lateWith(() => 'failed')
    const r: any = await makeStoryReelTool(lookup, late).handler(
      {
        ...ARGS,
        still_tasks: [{ task: 'someone-elses', at: 1, charged: 999 }],
      },
      ctx
    )
    expect(r.done).toBe(true)
    expect(looked).toEqual([])
    expect(refunded).toEqual([])
    expect(count(calls, 'image_edit')).toBe(3)
  })

  it('without a way to ask, a known task is still never ordered again', async () => {
    const { lookup, calls } = fakeTools()
    const task: StillTask = { task: 'task-b', at: T0, charged: 8 }
    const r: any = await makeStoryReelTool(lookup).handler(
      { ...ARGS, stills: ['https://ours/a.png', '', 'https://ours/c.png'] },
      jobCtx([null, task, null])
    )
    expect(r.done).toBe(false)
    expect(count(calls, 'image_edit')).toBe(0)
  })
})
