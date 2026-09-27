/**
 * THE CRM'S STORY-REEL TEMPLATE, for any client with a face and a voice
 * (owner, 2026-09-26: "create it in the CRM as a template for clients who
 * gave their voice and an avatar photo, for any story"; "make it so she can
 * get a new one with one press").
 *
 * Pinned here, against an in-memory base that answers the engine's own SQL:
 *   - who qualifies: an avatar and a clone, nothing else; a profile only
 *     overrides the defaults;
 *   - the seller's request goes to the SELLER, never to the client;
 *   - the client's own press pays from her tokens (or the seller's, for a
 *     VIP) and comes back to her with the next-reel button;
 *   - a reel cut halfway keeps what is made, and only the sweep takes it up
 *     again -- one runner per job, even with two processes alive;
 *   - a failed reel gives its plan card back.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  missingFor,
  nextLink,
  parseStory,
  runStoryJob,
  startStory,
  storySettingsOf,
  sweepStoryJobs,
  writerMessages,
  STORY_DEAD_MS,
  STORY_DEFAULT_CTA,
  STORY_DEFAULT_STYLE,
  type StoryDeps,
} from './story-template'
import { makeCrmStoryTool, makeMyStoryTool } from './crm-story-tool'
import { storyPriceEstimate } from './story-template'
import type { AgentTool, ToolContext } from './tools'

const SELLER = '900000001'
const OTHER = '900000002'
const LENA = '900000077'
const FACE = 'https://bucket.example/lead-avatar-77.jpg'

interface Job {
  id: number
  lead_id: string
  seller_id: string
  requester: string
  bot: string | null
  item_id: number | null
  topic: string
  about: string | null
  runner: string | null
  scenes: string | null
  stills: string
  clips: string
  status: string
  url: string | null
  error: string | null
  attempts: number
  updated: number
}

/** A base that answers exactly the statements the engine sends. */
function fakeBase() {
  let clock = 1_000_000
  const db = {
    profiles: [] as Array<{
      owner_id: string | null
      telegram_id: string
      profile: any
      updated: number
    }>,
    people: [] as Array<{
      owner_id: string
      lead_id: string
      first_name: string
      avatar_url: string | null
    }>,
    voices: [] as Array<{
      owner_id: string
      lead_id: string
      username: string | null
      voice_id: string
      seconds: number
      created: number
    }>,
    plan: [] as Array<{
      id: number
      goal_id: number
      telegram_id: string
      title: string
      note: string
      status: string
    }>,
    jobs: [] as Job[],
  }
  const row = (id: unknown) => db.jobs.find(j => j.id === Number(id))
  const query = async (
    sql: string,
    p: any[] = []
  ): Promise<{ rows: any[] }> => {
    const q = sql.replace(/\s+/g, ' ').trim()
    if (/^(CREATE|ALTER)\b/i.test(q)) return { rows: [] }
    // The seller gate reads the caller's own Telegram session.
    if (q.startsWith('SELECT session FROM tg_sessions'))
      return { rows: p[0] === SELLER ? [{ session: 'connected' }] : [] }
    // ── settings ──
    if (q.startsWith('SELECT owner_id FROM crm_client_profiles'))
      return {
        rows: db.profiles
          .filter(
            x => x.telegram_id === p[0] && x.owner_id && x.profile.story_reel
          )
          .sort((a, b) => b.updated - a.updated)
          .slice(0, 1),
      }
    if (q.startsWith('SELECT owner_id FROM lead_voices'))
      return {
        rows: db.voices
          .filter(v => v.lead_id === p[0])
          .sort((a, b) => b.created - a.created)
          .slice(0, 1),
      }
    if (q.startsWith('SELECT profile FROM crm_client_profiles'))
      return {
        rows: db.profiles
          .filter(
            x =>
              x.telegram_id === p[0] &&
              (x.owner_id === p[1] || x.owner_id === null)
          )
          .sort(
            (a, b) => Number(b.owner_id === p[1]) - Number(a.owner_id === p[1])
          )
          .slice(0, 1),
      }
    if (q.startsWith('SELECT first_name, avatar_url FROM crm_people'))
      return {
        rows: db.people.filter(x => x.owner_id === p[0] && x.lead_id === p[1]),
      }
    if (q.startsWith('SELECT lead_id, voice_id, seconds FROM lead_voices'))
      return {
        rows: db.voices.filter(
          v =>
            v.owner_id === p[0] &&
            (v.lead_id === p[1] || (v.username ?? '').toLowerCase() === p[1])
        ),
      }
    if (q.startsWith('SELECT lead_id FROM crm_people'))
      return {
        rows: db.people.filter(x => x.owner_id === p[0]).filter(() => false),
      }
    // ── plan ──
    if (
      q.startsWith(
        "UPDATE content_plan_items SET status = 'done', updated_at = now() WHERE telegram_id"
      )
    ) {
      db.plan
        .filter(
          i =>
            i.telegram_id === p[0] &&
            i.status === 'idea' &&
            p[1].includes(i.title)
        )
        .forEach(i => (i.status = 'done'))
      return { rows: [] }
    }
    if (q.startsWith("UPDATE content_plan_items SET status = 'doing'")) {
      const next = db.plan
        .filter(i => i.telegram_id === p[0] && i.status === 'idea')
        .sort((a, b) => a.goal_id - b.goal_id || a.id - b.id)[0]
      if (!next) return { rows: [] }
      next.status = 'doing'
      return { rows: [{ id: next.id, title: next.title, note: next.note }] }
    }
    if (q.startsWith("UPDATE content_plan_items SET status = 'idea'")) {
      db.plan
        .filter(i => i.id === p[0] && i.status === 'doing')
        .forEach(i => (i.status = 'idea'))
      return { rows: [] }
    }
    if (q.startsWith("UPDATE content_plan_items SET status = 'done', note")) {
      db.plan
        .filter(i => i.id === p[0])
        .forEach(
          i => ((i.status = 'done'), (i.note = `${i.note} ${p[1]}`.trim()))
        )
      return { rows: [] }
    }
    // ── jobs ──
    if (
      q.startsWith(
        "SELECT id FROM story_jobs WHERE lead_id = $1 AND status = 'running'"
      )
    )
      return {
        rows: db.jobs.filter(j => j.lead_id === p[0] && j.status === 'running'),
      }
    if (q.startsWith('INSERT INTO story_jobs')) {
      const id = db.jobs.length + 1
      db.jobs.push({
        id,
        lead_id: p[0],
        seller_id: p[1],
        requester: p[2],
        bot: p[3],
        item_id: p[4],
        topic: p[5],
        about: p[6],
        runner: p[7],
        scenes: null,
        stills: '[]',
        clips: '[]',
        status: 'running',
        url: null,
        error: null,
        attempts: 0,
        updated: clock,
      })
      return { rows: [{ id }] }
    }
    if (q.startsWith('SELECT * FROM story_jobs WHERE id = $1')) {
      const j = row(p[0])
      return { rows: j ? [{ ...j }] : [] }
    }
    if (q.startsWith('UPDATE story_jobs SET attempts')) {
      const j = row(p[0])!
      j.attempts = p[1]
      j.updated = clock
      return { rows: [] }
    }
    if (
      q.startsWith(
        "SELECT topic FROM story_jobs WHERE lead_id = $1 AND status = 'done'"
      )
    )
      return {
        rows: db.jobs.filter(
          j => j.lead_id === p[0] && j.status === 'done' && j.topic
        ),
      }
    if (q.startsWith('UPDATE story_jobs SET scenes')) {
      const j = row(p[0])!
      Object.assign(j, { scenes: p[1], topic: p[2], updated: clock })
      return { rows: [] }
    }
    if (
      q.startsWith(
        'UPDATE story_jobs SET stills = $2, clips = $3, runner = NULL'
      )
    ) {
      const j = row(p[0])!
      Object.assign(j, {
        stills: p[1],
        clips: p[2],
        runner: null,
        error: p[3],
        updated: clock,
      })
      return { rows: [] }
    }
    if (q.startsWith('UPDATE story_jobs SET stills')) {
      const j = row(p[0])!
      Object.assign(j, { stills: p[1], clips: p[2], updated: clock })
      return { rows: [] }
    }
    if (q.startsWith("UPDATE story_jobs SET status = 'done'")) {
      Object.assign(row(p[0])!, { status: 'done', url: p[1], updated: clock })
      return { rows: [] }
    }
    if (q.startsWith("UPDATE story_jobs SET status = 'failed', error = $2")) {
      Object.assign(row(p[0])!, {
        status: 'failed',
        error: p[1],
        updated: clock,
      })
      return { rows: [] }
    }
    if (
      q.startsWith("UPDATE story_jobs SET status = 'failed', error = COALESCE")
    ) {
      return { rows: [] } // nothing here is two hours old
    }
    if (q.startsWith('UPDATE story_jobs SET runner = $1')) {
      const dead = db.jobs
        .filter(j => j.status === 'running' && clock - j.updated > Number(p[1]))
        .slice(0, 5)
      dead.forEach(j => ((j.runner = p[0]), (j.updated = clock)))
      return { rows: dead.map(j => ({ id: j.id })) }
    }
    if (q.startsWith('UPDATE story_jobs SET updated_at = now()'))
      return { rows: [] }
    if (q.startsWith('SELECT id, COALESCE(topic')) {
      return {
        rows: db.jobs
          .filter(j => j.seller_id === p[0] && j.lead_id === p[1])
          .map(j => ({ ...j, created_at: String(j.updated) })),
      }
    }
    if (q.startsWith('SELECT title FROM content_plan_items')) {
      const next = db.plan
        .filter(
          i =>
            i.telegram_id === p[0] &&
            i.status === 'idea' &&
            !p[1].includes(i.title)
        )
        .sort((a, b) => a.goal_id - b.goal_id || a.id - b.id)[0]
      return { rows: next ? [{ title: next.title }] : [] }
    }
    throw new Error(`unexpected SQL: ${q.slice(0, 90)}`)
  }
  return { db, pool: { query }, tick: (ms: number) => (clock += ms) }
}

const SCENES = {
  title: 'Ваза в интерьере',
  scenes: [
    { setting: 'a sunlit living room', line: 'Я выбираю вазу под комнату.' },
    { setting: 'a quiet bedroom', line: 'Здесь — нежные тона.' },
    { setting: 'a bright kitchen', line: 'Напишите мне — подберу вашу.' },
  ],
}

interface Said {
  bot: string | null
  chat: string
  text: string
  extra?: Parameters<StoryDeps['notify']>[3]
}

function depsOn(
  base: ReturnType<typeof fakeBase>,
  story: StoryDeps['story'],
  me = 'runner-a'
) {
  const said: Said[] = []
  const deps: StoryDeps = {
    pool: base.pool,
    write: async () => JSON.stringify(SCENES),
    story,
    notify: async (bot, chat, text, extra) => {
      said.push({ bot, chat, text, extra })
      return true
    },
    botOf: async () => 'example_bot',
    beat: () => () => undefined,
    me,
  }
  return { deps, said }
}

const settle = () => new Promise(r => setTimeout(r, 0))
async function drain() {
  for (let i = 0; i < 10; i++) await settle()
}

function qualify(
  base: ReturnType<typeof fakeBase>,
  o: { face?: boolean; voice?: boolean } = {}
) {
  base.db.people.push({
    owner_id: SELLER,
    lead_id: LENA,
    first_name: 'Лена',
    avatar_url: o.face === false ? null : FACE,
  })
  if (o.voice !== false)
    base.db.voices.push({
      owner_id: SELLER,
      lead_id: LENA,
      username: 'example_client',
      voice_id: 'lena-voice-1',
      seconds: 21,
      created: 1,
    })
}

describe('who qualifies for the story-reel template', () => {
  it('an avatar and a clone are enough; the defaults fill the rest', async () => {
    const base = fakeBase()
    qualify(base)
    const s = await storySettingsOf(base.pool, LENA, SELLER)
    expect(s).toMatchObject({
      owner: SELLER,
      faceUrl: FACE,
      hasVoice: true,
      style: STORY_DEFAULT_STYLE,
      cta: STORY_DEFAULT_CTA,
      pauseSec: 3,
      payer: 'client',
      vip: false,
    })
    expect(missingFor(s)).toBe('')
  })

  it('names what is missing, face or voice, in words one can act on', async () => {
    const base = fakeBase()
    qualify(base, { face: false, voice: false })
    const why = missingFor(await storySettingsOf(base.pool, LENA, SELLER))
    expect(why).toMatch('фото с лицом')
    expect(why).toMatch('голос')
    expect(why).toMatch(/crm_voice_clone/)
  })

  it('a VIP profile overrides the look, the call, the pause and who pays', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: {
        vip: true,
        role: 'флорист',
        story_reel: {
          style: 'cream ceramic, pastel',
          cta: 'Пишите в директ',
          pause_sec: 3,
          payer: 'owner',
          done: ['Кто я'],
        },
      },
    })
    const s = await storySettingsOf(base.pool, LENA)
    expect(s).toMatchObject({
      owner: SELLER,
      vip: true,
      payer: 'owner',
      cta: 'Пишите в директ',
      style: 'cream ceramic, pastel',
      about: 'флорист',
    })
    expect(s?.done).toEqual(['Кто я'])
  })

  it('takes the call from a package approved_cta, which is {text, button}', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: {
        approved_cta: { text: 'Пишите мне в директ', button: 'Директ' },
      },
    })
    expect((await storySettingsOf(base.pool, LENA, SELLER))?.cta).toBe(
      'Пишите мне в директ'
    )
  })

  it('her own press finds her seller by the voice they hold', async () => {
    const base = fakeBase()
    qualify(base)
    expect((await storySettingsOf(base.pool, LENA))?.owner).toBe(SELLER)
  })

  it('another seller sees no voice of hers: a clone is per seller', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.people.push({
      owner_id: OTHER,
      lead_id: LENA,
      first_name: 'Лена',
      avatar_url: FACE,
    })
    const s = await storySettingsOf(base.pool, LENA, OTHER)
    expect(s?.hasVoice).toBe(false)
    expect(missingFor(s)).toMatch('голос')
  })
})

describe('a client with her own visual ends on it', () => {
  it('the template hands her end card to story_reel', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: {
        visual: {
          bg: '#0b0d0f',
          gold_title: '#ffd700',
          text: '#ffffff',
          accent_cta: '#00ff88',
        },
        approved_cta: {
          text: 'Приходите со своим вопросом.',
          button: '🎲 Играть',
          bot: '@example_bot',
        },
      },
    })
    const seen: any[] = []
    const { deps } = depsOn(base, async args => {
      seen.push(args)
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Лила',
    })
    await drain()
    expect(seen[0].end_card).toEqual({
      bg: '#0b0d0f',
      title: '#ffd700',
      text: '#ffffff',
      accent: '#00ff88',
      button: '🎲 Играть · @example_bot',
    })
    expect(seen[0].cta).toBe('Приходите со своим вопросом.')
  })

  it('a client without a visual gets no card', async () => {
    const base = fakeBase()
    qualify(base)
    const seen: any[] = []
    const { deps } = depsOn(base, async args => {
      seen.push(args)
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(seen[0].end_card).toBeUndefined()
  })
})

describe('any story: the writer', () => {
  it('reads a title and scenes, as an object or a bare list', () => {
    expect(parseStory(`Вот: ${JSON.stringify(SCENES)}`)?.title).toBe(
      'Ваза в интерьере'
    )
    expect(parseStory(JSON.stringify(SCENES.scenes))?.scenes).toHaveLength(3)
    expect(parseStory('[{"setting":"x","line":"y"}]')).toBeNull()
    expect(parseStory('no json')).toBeNull()
  })

  it('with no topic, picks one itself and is told which she already has', () => {
    const [, user] = writerMessages(
      { title: '', note: '' },
      { about: 'флорист', cta: 'Напишите мне', name: 'Лена' },
      ['Кто я']
    )
    expect(user.content).toMatch('Тему выбери сам')
    expect(user.content).toMatch('«Кто я»')
    const [, given] = writerMessages(
      { title: 'Ваза', note: '' },
      { about: '', cta: '', name: '' }
    )
    expect(given.content).toMatch('Тема рилса: «Ваза»')
  })
})

describe('the seller asks from the CRM', () => {
  let base: ReturnType<typeof fakeBase>
  beforeEach(() => {
    base = fakeBase()
    qualify(base)
  })

  it('refuses a client without a face or a voice before anything is spent', async () => {
    const bare = fakeBase()
    qualify(bare, { voice: false })
    let calls = 0
    const { deps } = depsOn(
      bare,
      async () => ((calls += 1), { done: true, url: 'x' })
    )
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    expect(out.started).toBe(false)
    expect(out.why).toMatch('голос')
    expect(calls).toBe(0)
    expect(bare.db.jobs).toHaveLength(0)
  })

  it('makes it on the given topic, as the seller, and hands it to the SELLER only', async () => {
    const seen: Array<{ args: any; ctx: ToolContext }> = []
    const { deps, said } = depsOn(base, async (args, ctx) => {
      seen.push({ args, ctx })
      return {
        done: true,
        url: 'https://bucket.example/reel.mp4',
        stills: [],
        clips: [],
      }
    })
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза в спальне',
    })
    expect(out).toMatchObject({ started: true, topic: 'Ваза в спальне' })
    await drain()
    expect(seen).toHaveLength(1)
    expect(seen[0].ctx.telegramId).toBe(SELLER)
    expect(seen[0].args).toMatchObject({
      image_url: FACE,
      for_lead: LENA,
      pause_sec: 3,
      cta: STORY_DEFAULT_CTA,
    })
    expect(seen[0].args.scenes).toHaveLength(3)
    expect(said.map(x => x.chat)).toEqual([SELLER])
    expect(said[0].text).toMatch('перешли клиенту сам')
    expect(said[0].text).toContain(nextLink('example_bot'))
    expect(said[0].extra).toMatchObject({ renderSent: true })
    expect(base.db.jobs[0]).toMatchObject({
      status: 'done',
      topic: 'Ваза в спальне',
    })
  })

  it('with no topic takes the next card of her plan, and closes it with the link', async () => {
    base.db.plan.push(
      {
        id: 80,
        goal_id: 1,
        telegram_id: LENA,
        title: 'Ваза в интерьере',
        note: '',
        status: 'idea',
      },
      {
        id: 81,
        goal_id: 1,
        telegram_id: LENA,
        title: 'Букет недели',
        note: '',
        status: 'idea',
      }
    )
    const { deps } = depsOn(base, async () => ({
      done: true,
      url: 'https://bucket.example/reel.mp4',
    }))
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
    })
    expect(out.topic).toBe('Ваза в интерьере')
    await drain()
    expect(base.db.plan[0]).toMatchObject({
      status: 'done',
      note: 'https://bucket.example/reel.mp4',
    })
    expect(base.db.plan[1].status).toBe('idea')
  })

  it('with no topic and no plan, the writer names a fresh one', async () => {
    const { deps } = depsOn(base, async () => ({
      done: true,
      url: 'https://bucket.example/reel.mp4',
    }))
    await startStory(deps, { lead: LENA, requester: SELLER, seller: SELLER })
    await drain()
    expect(base.db.jobs[0].topic).toBe('Ваза в интерьере')
  })

  it('one reel at a time per client', async () => {
    const { deps } = depsOn(base, () => new Promise(() => undefined))
    expect(
      (
        await startStory(deps, {
          lead: LENA,
          requester: SELLER,
          seller: SELLER,
        })
      ).started
    ).toBe(true)
    const again = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
    })
    expect(again.started).toBe(false)
    expect(again.why).toMatch('уже делается')
  })
})

describe('the client presses ?start=reel herself', () => {
  it('she pays, and the reel comes back to her with the next-reel button', async () => {
    const base = fakeBase()
    qualify(base)
    const seen: ToolContext[] = []
    const { deps, said } = depsOn(base, async (_a, ctx) => {
      seen.push(ctx)
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    const out = await startStory(deps, {
      lead: LENA,
      requester: LENA,
      bot: 'example_bot',
    })
    expect(out.started).toBe(true)
    await drain()
    expect(seen[0].telegramId).toBe(LENA)
    expect(said).toHaveLength(1)
    expect(said[0]).toMatchObject({ bot: 'example_bot', chat: LENA })
    expect(said[0].extra?.button?.url).toBe(
      'https://t.me/example_bot?start=reel'
    )
    expect(said[0].extra).toMatchObject({
      video: 'https://bucket.example/reel.mp4',
      renderSent: true,
    })
  })

  it('a VIP gift is paid by the seller, and the video is carried to her', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: { vip: true, story_reel: { payer: 'owner' } },
    })
    const seen: ToolContext[] = []
    const { deps, said } = depsOn(base, async (_a, ctx) => {
      seen.push(ctx)
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    await startStory(deps, { lead: LENA, requester: LENA, bot: 'example_bot' })
    await drain()
    expect(seen[0].telegramId).toBe(SELLER)
    expect(said[0].chat).toBe(LENA)
    expect(said[0].extra).toMatchObject({ renderSent: false })
  })

  it('a stranger with no clone anywhere is told why, and nothing starts', async () => {
    const base = fakeBase()
    const { deps } = depsOn(base, async () => ({ done: true, url: 'x' }))
    const out = await startStory(deps, {
      lead: LENA,
      requester: LENA,
      bot: 'example_bot',
    })
    expect(out.started).toBe(false)
    expect(out.why).toMatch('не настроены')
  })
})

describe('a reel cut halfway', () => {
  it('keeps what is made, releases the job, and only the sweep takes it up', async () => {
    const base = fakeBase()
    qualify(base)
    const calls: any[] = []
    let round = 0
    const story: StoryDeps['story'] = async args => {
      calls.push(args)
      round += 1
      return round === 1
        ? {
            done: false,
            reason: 'кадры не все',
            stills: ['https://s/1', '', 'https://s/3'],
            clips: ['', '', ''],
          }
        : { done: true, url: 'https://bucket.example/reel.mp4' }
    }
    const a = depsOn(base, story, 'runner-a')
    await startStory(a.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(base.db.jobs[0]).toMatchObject({ status: 'running', runner: null })
    expect(JSON.parse(base.db.jobs[0].stills)).toEqual([
      'https://s/1',
      '',
      'https://s/3',
    ])

    // Not yet quiet long enough: nobody takes it.
    expect(await sweepStoryJobs(a.deps)).toBe(0)
    // A second process can not run a job it does not hold.
    const b = depsOn(base, story, 'runner-b')
    await runStoryJob(b.deps, 1)
    expect(calls).toHaveLength(1)

    base.tick(STORY_DEAD_MS + 1)
    expect(await sweepStoryJobs(b.deps)).toBe(1)
    await drain()
    expect(calls).toHaveLength(2)
    // The second round starts from the stills the first one paid for.
    expect(calls[1].stills).toEqual(['https://s/1', '', 'https://s/3'])
    expect(base.db.jobs[0]).toMatchObject({
      status: 'done',
      runner: 'runner-b',
    })
  })

  it('a failed reel gives its plan card back and says so', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.plan.push({
      id: 80,
      goal_id: 1,
      telegram_id: LENA,
      title: 'Ваза',
      note: '',
      status: 'idea',
    })
    const { deps, said } = depsOn(base, async () => ({
      done: false,
      reason: 'недостаточно токенов',
    }))
    await startStory(deps, { lead: LENA, requester: LENA, bot: 'example_bot' })
    await drain()
    expect(base.db.jobs[0].status).toBe('failed')
    expect(base.db.plan[0].status).toBe('idea')
    expect(said[0].text).toMatch('недостаточно токенов')
    expect(said[0].extra?.button?.text).toMatch('Попробовать')
  })
})

describe('crm_story_reel, the seller tool', () => {
  const lookupNone = () => undefined as AgentTool | undefined

  it('in a client turn works only for that client', async () => {
    const base = fakeBase()
    qualify(base)
    const tool = makeCrmStoryTool({
      deps: () => depsOn(base, async () => ({})).deps,
      lookup: lookupNone,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
      faceOf: '900000099',
    } as unknown as ToolContext
    const out: any = await tool.handler({ lead: LENA }, ctx)
    expect(out.ready).toBe(false)
    expect(out.why).toMatch('только ему самому')
  })

  it('says whether the client is ready, with her one-tap link and her reels', async () => {
    const base = fakeBase()
    qualify(base)
    const tool = makeCrmStoryTool({
      deps: () => depsOn(base, async () => ({})).deps,
      lookup: lookupNone,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const out: any = await tool.handler({ lead: LENA }, ctx)
    expect(out).toMatchObject({
      ready: true,
      face: FACE,
      voice: true,
      one_tap_link: 'https://t.me/example_bot?start=reel',
      jobs: [],
    })
  })

  it('looks at the avatar when the CRM has not yet, then counts it', async () => {
    const base = fakeBase()
    qualify(base, { face: false })
    const face: AgentTool = {
      name: 'crm_client_face',
      description: '',
      parameters: {},
      handler: async () => {
        base.db.people[0].avatar_url = FACE
        return { has: true, url: FACE }
      },
    }
    const tool = makeCrmStoryTool({
      deps: () => depsOn(base, async () => ({})).deps,
      lookup: n => (n === face.name ? face : undefined),
    })
    const out: any = await tool.handler({ lead: LENA }, {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext)
    expect(out.ready).toBe(true)
    expect(out.face).toBe(FACE)
  })

  it('refuses anybody who has not connected their Telegram (not a seller)', async () => {
    const base = fakeBase()
    qualify(base)
    const tool = makeCrmStoryTool({
      deps: () => depsOn(base, async () => ({})).deps,
      lookup: lookupNone,
    })
    await expect(
      tool.handler({ lead: LENA, start: true }, {
        telegramId: OTHER,
        pool: base.pool,
      } as unknown as ToolContext)
    ).rejects.toThrow('не подключён')
  })
})

describe('my_story_reel, the person herself (the /story page and her bot)', () => {
  const tool = (
    base: ReturnType<typeof fakeBase>,
    story: StoryDeps['story'] = async () => ({})
  ) => makeMyStoryTool({ deps: () => depsOn(base, story).deps })
  const as = (
    base: ReturnType<typeof fakeBase>,
    id: string,
    extra: object = {}
  ) => ({ telegramId: id, pool: base.pool, ...extra }) as unknown as ToolContext

  it('shows her face, voice, the next plan topic and the price BEFORE the press, taking nothing', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.plan.push({
      id: 80,
      goal_id: 1,
      telegram_id: LENA,
      title: 'Ваза в интерьере',
      note: '',
      status: 'idea',
    })
    const out: any = await tool(base).handler({}, as(base, LENA))
    expect(out).toMatchObject({
      ready: true,
      face: FACE,
      voice: true,
      next_topic: 'Ваза в интерьере',
      price_tokens: storyPriceEstimate(),
      one_tap_link: 'https://t.me/example_bot?start=reel',
    })
    // Looking is not taking: the card is still an idea.
    expect(base.db.plan[0].status).toBe('idea')
    expect(base.db.jobs).toHaveLength(0)
  })

  it('names the gift instead of a price when her seller pays', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: { story_reel: { payer: 'owner' } },
    })
    const out: any = await tool(base).handler({}, as(base, LENA))
    expect(out.gift).toBe(true)
    expect(out.price_tokens).toBeUndefined()
  })

  it('a press makes HER reel: she asks, she pays, it comes to her bot', async () => {
    const base = fakeBase()
    qualify(base)
    const seen: ToolContext[] = []
    const t = tool(base, async (_a, ctx) => {
      seen.push(ctx)
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    const out: any = await t.handler(
      { start: true, topic: 'Букет недели' },
      as(base, LENA)
    )
    expect(out).toMatchObject({ started: true, topic: 'Букет недели' })
    await drain()
    expect(base.db.jobs[0]).toMatchObject({
      lead_id: LENA,
      requester: LENA,
      bot: 'example_bot',
    })
    expect(seen[0].telegramId).toBe(LENA)
  })

  it('refuses in a turn working for a client: that is crm_story_reel', async () => {
    const base = fakeBase()
    qualify(base)
    const out: any = await tool(base).handler(
      { start: true },
      as(base, SELLER, { faceOf: LENA })
    )
    expect(out.ready).toBe(false)
    expect(out.why).toContain('crm_story_reel')
    expect(base.db.jobs).toHaveLength(0)
  })

  it('a person with no voice is told what is missing, and nothing starts', async () => {
    const base = fakeBase()
    qualify(base, { voice: false })
    // Her seller is known from the profile only when there is no clone.
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: { story_reel: {} },
    })
    const out: any = await tool(base).handler({ start: true }, as(base, LENA))
    expect(out.started).toBe(false)
    expect(out.why).toContain('голос')
  })
})
