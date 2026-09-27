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
  STORY_JOB_ATTEMPTS,
  failedMoneyLine,
  STORY_DEFAULT_CTA,
  STORY_DEFAULT_STYLE,
  type StoryDeps,
} from './story-template'
import { makeCrmStoryTool, makeMyStoryTool } from './crm-story-tool'
import {
  storyPriceEstimate,
  storyPriceEstimateNotes,
  slotsNeeded,
  dayCovers,
  CAP_WAIT_MARK,
} from './story-template'
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
  style?: string | null
  cta?: string | null
  deliver_to?: string | null
  caption?: string | null
  card_at?: number | null
  still_tasks?: string
  payer?: string | null
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
    // Groups the CRM has read, and the one bound to each client.
    groups: [] as Array<{ owner_id: string; chat_id: string; title: string }>,
    bound: [] as Array<{ owner_id: string; lead_id: string; chat_id: string }>,
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
        stills: '[]',
        clips: '[]',
        status: 'running',
        url: null,
        error: null,
        attempts: 0,
        updated: clock,
        scenes: p[8] ?? null,
        style: p[9] ?? null,
        cta: p[10] ?? null,
        deliver_to: p[11] ?? null,
        caption: p[12] ?? null,
        card_at: null,
      })
      return { rows: [{ id }] }
    }
    if (q.startsWith('UPDATE story_jobs SET card_at = now()')) {
      const j = row(p[0])
      if (!j || j.card_at) return { rows: [] }
      j.card_at = clock
      return { rows: [{ id: j.id }] }
    }
    if (q.startsWith('UPDATE story_jobs SET card_at = NULL')) {
      const j = row(p[0])
      if (j) j.card_at = null
      return { rows: [] }
    }
    if (
      q.startsWith(
        "SELECT * FROM story_jobs WHERE status = 'done' AND deliver_to"
      )
    )
      return {
        rows: db.jobs.filter(
          j => j.status === 'done' && j.deliver_to && !j.card_at && j.url
        ),
      }
    // ── the client's group ──
    if (q.startsWith('SELECT 1 FROM crm_groups'))
      return {
        rows: db.groups.filter(g => g.owner_id === p[0] && g.chat_id === p[1]),
      }
    if (q.startsWith('INSERT INTO crm_client_groups')) {
      db.bound = db.bound.filter(
        b => !(b.owner_id === p[0] && b.lead_id === p[1])
      )
      db.bound.push({ owner_id: p[0], lead_id: p[1], chat_id: p[2] })
      return { rows: [] }
    }
    if (q.startsWith('SELECT b.chat_id, g.title')) {
      const b = db.bound.find(x => x.owner_id === p[0] && x.lead_id === p[1])
      if (!b) return { rows: [] }
      const g = db.groups.find(
        x => x.owner_id === b.owner_id && x.chat_id === b.chat_id
      )
      return {
        rows: [
          {
            chat_id: b.chat_id,
            title: g?.title ?? null,
            username: null,
            members_count: null,
          },
        ],
      }
    }
    if (q.startsWith('SELECT * FROM story_jobs WHERE id = $1')) {
      const j = row(p[0])
      return { rows: j ? [{ ...j }] : [] }
    }
    if (
      q.startsWith(
        'UPDATE story_jobs SET attempts = $2, runner = NULL, error = $3'
      )
    ) {
      Object.assign(row(p[0])!, {
        attempts: p[1],
        runner: null,
        error: p[2],
        updated: clock,
      })
      return { rows: [] }
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
        'UPDATE story_jobs SET stills = $2, clips = $3, still_tasks = $4, payer = $5, runner = NULL'
      )
    ) {
      const j = row(p[0])!
      Object.assign(j, {
        stills: p[1],
        clips: p[2],
        still_tasks: p[3],
        payer: p[4],
        runner: null,
        error: p[5],
        updated: clock,
      })
      return { rows: [] }
    }
    if (q.startsWith('UPDATE story_jobs SET stills')) {
      const j = row(p[0])!
      Object.assign(j, {
        stills: p[1],
        clips: p[2],
        still_tasks: p[3],
        payer: p[4],
        updated: clock,
      })
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
    if (
      q.startsWith(
        "UPDATE story_jobs SET status = 'failed', error = 'exhausted'"
      )
    ) {
      const out = db.jobs.filter(
        j =>
          j.status === 'running' &&
          j.attempts >= Number(p[1]) &&
          clock - j.updated > Number(p[0])
      )
      out.forEach(j => ((j.status = 'failed'), (j.error = 'exhausted')))
      return { rows: out.map(j => ({ ...j })) }
    }
    if (q.startsWith('UPDATE story_jobs SET runner = $1')) {
      const dead = db.jobs
        .filter(
          j =>
            j.status === 'running' &&
            // Only when the statement itself says so: the fake must not
            // supply a rule the SQL forgot.
            (!q.includes('attempts < $4') || j.attempts < Number(p[3])) &&
            clock - j.updated > Number(p[1])
        )
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

  it('refuses a client without a face before anything is spent', async () => {
    // Without a clone the seller's reel speaks her own voice notes (spec v4,
    // below); without a face there is no reel at all.
    const bare = fakeBase()
    qualify(bare, { face: false })
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
    expect(out.why).toMatch('лицом')
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

  it('names the voice and its price before anything is spent: clone, or her notes while the clone is refused', async () => {
    const base = fakeBase()
    qualify(base)
    let down = false
    const tool = makeCrmStoryTool({
      deps: () => ({
        ...depsOn(base, async () => ({})).deps,
        voiceDown: () => down,
      }),
      lookup: lookupNone,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const up: any = await tool.handler({ lead: LENA }, ctx)
    expect(up).toMatchObject({
      voice_mode: 'clone',
      price_tokens: storyPriceEstimate(), // secret-guard-ok: a price in tokens, not a secret
    })
    down = true
    const refused: any = await tool.handler({ lead: LENA }, ctx)
    expect(refused).toMatchObject({
      voice_mode: 'notes',
      price_tokens: storyPriceEstimateNotes(), // secret-guard-ok: a price in tokens, not a secret
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
      price_tokens: storyPriceEstimate(), // secret-guard-ok: a price in tokens, not a secret
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

/*
 * INTO THE PIPELINE (owner, 2026-09-27: "build it into the pipeline, not
 * scripts by hand"). The seller brings the script, the client has a group:
 * the job makes exactly that script and ends in ONE send card for the group
 * in the seller's bot -- never a send without the press, never a second card
 * over one the seller has not answered yet.
 */
describe('the seller brings the script, and the reel goes to her group', () => {
  const GROUP = '-900000061'
  const SCRIPT = [
    { setting: 'a dark quiet room', line: 'Я веду игру.' },
    { setting: 'a dim library', line: 'Здесь нет правильного ответа.' },
    { setting: 'a tall window at dusk', line: 'Приходите со своим вопросом.' },
  ]
  let base: ReturnType<typeof fakeBase>
  beforeEach(() => {
    base = fakeBase()
    qualify(base)
    base.db.groups.push({ owner_id: SELLER, chat_id: GROUP, title: 'VIP' })
  })

  const done = async () => ({
    done: true,
    url: 'https://bucket.example/reel.mp4',
    stills: [],
    clips: [],
  })

  function withCards(outcome: 'shown' | 'busy' | 'failed' = 'shown') {
    const offers: any[] = []
    let written = 0
    const seen: any[] = []
    const { deps, said } = depsOn(base, async (args, ctx) => {
      seen.push({ args, ctx })
      return done()
    })
    deps.write = async () => ((written += 1), JSON.stringify(SCENES))
    deps.offerCard = async o => (offers.push(o), outcome)
    deps.groupTitle = async () => 'VIP'
    deps.pageOf = bot => (bot ? `https://t.me/${bot}?start=app_story` : '')
    return { deps, said, offers, seen, written: () => written }
  }

  it('makes the script as given: no writer, her look and call', async () => {
    const w = withCards()
    const out = await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      scenes: SCRIPT,
      style: 'Low-key light, gold accents.',
      cta: 'Приходите на доску.',
    })
    expect(out).toMatchObject({ started: true, topic: 'Я веду игру' })
    await drain()
    expect(w.written()).toBe(0)
    expect(w.seen[0].args.scenes).toEqual(SCRIPT)
    expect(w.seen[0].args).toMatchObject({
      style: 'Low-key light, gold accents.',
      cta: 'Приходите на доску.',
    })
  })

  it('a broken script is refused before anything is spent', async () => {
    const w = withCards()
    const out = await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      scenes: [{ setting: 'x', line: '' }] as never,
    })
    expect(out.started).toBe(false)
    expect(w.seen).toHaveLength(0)
    expect(base.db.jobs).toHaveLength(0)
  })

  it('ends in ONE send card for her group, in the seller bot, with the caption and her page', async () => {
    const w = withCards('shown')
    await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
      deliverTo: GROUP,
    })
    await drain()
    expect(w.offers).toHaveLength(1)
    expect(w.offers[0]).toMatchObject({
      owner: SELLER,
      chat: GROUP,
      groupTitle: 'VIP',
      url: 'https://bucket.example/reel.mp4',
      topic: 'Ваза',
      // The render already delivered the video to the seller who paid.
      withVideo: false,
    })
    expect(w.offers[0].caption).toContain('Лена')
    expect(w.offers[0].caption).toContain(
      'https://t.me/example_bot?start=app_story'
    )
    // The card is the message: no second "forward it yourself" note.
    expect(w.said).toHaveLength(0)
    expect(base.db.jobs[0].card_at).not.toBeNull()
  })

  it("the seller's own caption is the one the group reads", async () => {
    const w = withCards('shown')
    await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
      deliverTo: GROUP,
      caption: 'Лена, ваш рилс!',
    })
    await drain()
    expect(w.offers[0].caption).toBe('Лена, ваш рилс!')
  })

  it('while another card waits, says so, and the sweep offers it when the queue is free', async () => {
    const w = withCards('busy')
    await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
      deliverTo: GROUP,
    })
    await drain()
    expect(w.said).toHaveLength(1)
    expect(w.said[0].text).toMatch('придёт сюда')
    expect(base.db.jobs[0].card_at).toBeNull()

    w.deps.offerCard = async o => (w.offers.push(o), 'shown')
    await sweepStoryJobs(w.deps)
    await drain()
    expect(w.offers).toHaveLength(2)
    expect(w.offers[1]).toMatchObject({ chat: GROUP, withVideo: false })
    expect(base.db.jobs[0].card_at).not.toBeNull()

    // Offered once: the next sweep leaves it alone.
    await sweepStoryJobs(w.deps)
    await drain()
    expect(w.offers).toHaveLength(2)
  })

  it('a card that cannot be made falls back to the video and the caption, to forward by hand', async () => {
    const w = withCards('failed')
    await startStory(w.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
      deliverTo: GROUP,
      caption: 'Лена, ваш рилс!',
    })
    await drain()
    expect(w.said).toHaveLength(1)
    expect(w.said[0].text).toMatch('перешли клиенту сам')
    expect(w.said[0].text).toContain('Лена, ваш рилс!')
  })

  it('a client pressing for herself never sends into a group', async () => {
    const w = withCards('shown')
    const out = await startStory(w.deps, {
      lead: LENA,
      requester: LENA,
      topic: 'Ваза',
      deliverTo: GROUP,
    } as never)
    expect(out.started).toBe(true)
    await drain()
    expect(w.offers).toHaveLength(0)
    expect(base.db.jobs[0].deliver_to).toBeNull()
  })

  it('crm_story_reel binds the group, names it, and sends the job there', async () => {
    const w = withCards('shown')
    const tool = makeCrmStoryTool({
      deps: () => w.deps,
      lookup: () => undefined,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const look: any = await tool.handler({ lead: LENA, to: GROUP }, ctx)
    expect(look.group).toEqual({ chat: GROUP, title: 'VIP' })
    const out: any = await tool.handler(
      { lead: LENA, start: true, scenes: SCRIPT },
      ctx
    )
    expect(out).toMatchObject({ started: true, to_group: GROUP })
    expect(out.note).toMatch('в группу VIP')
    await drain()
    expect(w.offers.map(o => o.chat)).toEqual([GROUP])
  })

  it('a group the CRM has not read is refused, and nothing starts', async () => {
    const w = withCards('shown')
    const tool = makeCrmStoryTool({
      deps: () => w.deps,
      lookup: () => undefined,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const out: any = await tool.handler(
      { lead: LENA, start: true, to: '-900000069', topic: 'Ваза' },
      ctx
    )
    expect(out.started).toBe(false)
    expect(out.why).toMatch('crm_groups')
    expect(base.db.jobs).toHaveLength(0)
  })

  it('to: "none" keeps a bound client out of her group this time', async () => {
    base.db.bound.push({ owner_id: SELLER, lead_id: LENA, chat_id: GROUP })
    const w = withCards('shown')
    const tool = makeCrmStoryTool({
      deps: () => w.deps,
      lookup: () => undefined,
    })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const out: any = await tool.handler(
      { lead: LENA, start: true, to: 'none', topic: 'Ваза' },
      ctx
    )
    expect(out.started).toBe(true)
    expect(out.to_group).toBeUndefined()
    await drain()
    expect(w.offers).toHaveLength(0)
  })
})

describe('the gift to her DM goes through the same pipeline', () => {
  it('to: "dm" ends in a gift card for HER chat, not a group', async () => {
    const base = fakeBase()
    qualify(base)
    const offers: any[] = []
    const { deps } = depsOn(base, async () => ({
      done: true,
      url: 'https://bucket.example/reel.mp4',
      stills: [],
      clips: [],
    }))
    deps.offerCard = async o => (offers.push(o), 'shown')
    deps.groupTitle = async () => 'must not be asked'
    const tool = makeCrmStoryTool({ deps: () => deps, lookup: () => undefined })
    const ctx = {
      telegramId: SELLER,
      pool: base.pool,
    } as unknown as ToolContext
    const out: any = await tool.handler(
      { lead: LENA, start: true, to: 'dm', topic: 'Ваза' },
      ctx
    )
    expect(out).toMatchObject({ started: true, to_group: LENA })
    expect(out.note).toMatch('в личку')
    await drain()
    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      chat: LENA,
      dm: true,
      groupTitle: null,
    })
  })
})

/*
 * A JOB THAT KEEPS DYING IS GIVEN UP, AND SAID SO; A FAILURE TELLS THE TRUTH
 * ABOUT MONEY. Before: the sweep claimed a job that killed its process
 * forever (each claim refreshed its clock), an abandoned job kept its plan
 * card and told nobody, and every failure said "nothing was charged" even
 * after stills and clips had been paid for.
 */
describe('a job that keeps dying, and the money line of a failure', () => {
  it('after its last attempt the sweep gives it up, returns the plan card and tells the seller', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.plan.push({
      id: 81,
      goal_id: 1,
      telegram_id: LENA,
      title: 'Ваза',
      note: '',
      status: 'idea',
    })
    // The runner "dies" mid-reel every time: it never answers.
    const story: StoryDeps['story'] = () => new Promise(() => undefined)
    const { deps, said } = depsOn(base, story, 'runner-a')
    await startStory(deps, { lead: LENA, requester: SELLER, seller: SELLER })
    await drain()
    const job = base.db.jobs[0]
    job.stills = JSON.stringify(['https://s/1', 'https://s/2', ''])
    expect(job.attempts).toBe(1)
    // Two more deaths: each sweep claims it again, one attempt more each time.
    for (let i = 0; i < STORY_JOB_ATTEMPTS - 1; i++) {
      base.tick(STORY_DEAD_MS + 1)
      expect(await sweepStoryJobs(deps)).toBe(1)
      await drain()
    }
    expect(job.attempts).toBe(STORY_JOB_ATTEMPTS)
    // Dead again after the last attempt: not claimed, given up.
    base.tick(STORY_DEAD_MS + 1)
    expect(await sweepStoryJobs(deps)).toBe(0)
    await drain()
    expect(job).toMatchObject({ status: 'failed', error: 'exhausted' })
    expect(base.db.plan[0].status).toBe('idea')
    const told = said.find(x => x.text.includes('прерывалась'))
    expect(told?.chat).toBe(SELLER)
    expect(told?.text).toMatch('кадров: 2')
    expect(told?.text).toMatch('уже оплачены')
  })

  it('a failure with nothing made says nothing was charged; with parts made, names them', () => {
    expect(failedMoneyLine({ stills: 0, clips: 0 })).toBe(
      'За несделанное токены не списаны.'
    )
    const some = failedMoneyLine({ stills: 3, clips: 1 })
    expect(some).toMatch('кадров: 3')
    expect(some).toMatch('клипов: 1')
    expect(some).toMatch('уже оплачены')
  })

  it('the final failure of a reel counts the parts it made', async () => {
    const base = fakeBase()
    qualify(base)
    // The first runner never answers; its row is then handed to a second one.
    const hang = depsOn(base, () => new Promise(() => undefined), 'runner-a')
    await startStory(hang.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    const job = base.db.jobs[0]
    // The row as the sweep leaves it before the LAST attempt.
    Object.assign(job, { attempts: STORY_JOB_ATTEMPTS - 1, runner: 'runner-b' })
    const last = depsOn(
      base,
      async () => ({
        done: false,
        reason: 'сборка: ошибка',
        stills: ['https://s/1', 'https://s/2', 'https://s/3'],
        clips: ['https://c/1', '', ''],
      }),
      'runner-b'
    )
    await runStoryJob(last.deps, job.id)
    expect(job.status).toBe('failed')
    const told = last.said[last.said.length - 1]
    expect(told.text).toMatch('кадров: 3')
    expect(told.text).toMatch('клипов: 1')
  })
})

/*
 * A STILL THAT IS STILL DRAWING IS PAID ONCE (spec v3), at the job's level:
 * the task reaches the row, the job waits for it instead of failing, the
 * next run is handed it, and a job that fails for good gives its charge back.
 */
describe('a job waiting for a still that is still drawing', () => {
  const TASK = { task: 'task-b', at: 1_000, charged: 8, op: 'image_edit' }

  it('is released for the sweep, not failed, and the next run is handed the task', async () => {
    const base = fakeBase()
    qualify(base)
    const calls: { args: any; ctx: ToolContext }[] = []
    let round = 0
    const story: StoryDeps['story'] = async (args, ctx) => {
      calls.push({ args, ctx })
      round += 1
      if (round === 1) {
        // Every still is drawing: nothing made, one paid for.
        await ctx.storyProgress?.({
          stills: ['', '', ''],
          clips: ['', '', ''],
          stillTasks: [null, TASK, null],
        })
        return {
          done: false,
          reason: 'кадры не все',
          stills: ['', '', ''],
          clips: ['', '', ''],
          still_tasks: [null, TASK, null],
        }
      }
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    }
    const a = depsOn(base, story, 'runner-a')
    await startStory(a.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    const job = base.db.jobs[0]
    expect(job).toMatchObject({ status: 'running', runner: null })
    expect(JSON.parse(job.still_tasks!)[1]).toMatchObject({ task: 'task-b' })
    expect(job.payer).toBe(SELLER)
    base.tick(STORY_DEAD_MS + 1)
    expect(await sweepStoryJobs(a.deps)).toBe(1)
    await drain()
    expect(calls).toHaveLength(2)
    expect(calls[1].ctx.storyStillTasks?.[1]).toMatchObject({
      task: 'task-b',
      charged: 8,
    })
    expect(job.status).toBe('done')
  })

  it('a job given up with a still still drawing gives its charge back, once, and says so', async () => {
    const base = fakeBase()
    qualify(base)
    const hang = depsOn(base, () => new Promise(() => undefined), 'runner-a')
    await startStory(hang.deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    const job = base.db.jobs[0]
    Object.assign(job, {
      attempts: STORY_JOB_ATTEMPTS,
      still_tasks: JSON.stringify([null, TASK, null]),
      payer: SELLER,
    })
    const refunded: { payer: string; task: string }[] = []
    const { deps, said } = depsOn(base, hang.deps.story, 'runner-a')
    deps.refundStill = async (payer, t) => {
      refunded.push({ payer, task: t.task })
    }
    base.tick(STORY_DEAD_MS + 1)
    expect(await sweepStoryJobs(deps)).toBe(0)
    await drain()
    expect(job).toMatchObject({ status: 'failed', error: 'exhausted' })
    expect(refunded).toEqual([{ payer: SELLER, task: 'task-b' }])
    const told = said.find(x => x.text.includes('прерывалась'))
    expect(told?.text).toMatch('За недорисованные кадры (1) токены возвращены')
  })

  it('the money line names stills given back apart from parts made', () => {
    expect(failedMoneyLine({ stills: 0, clips: 0, returned: 2 })).toBe(
      'За несделанное токены не списаны. За недорисованные кадры (2) токены возвращены.'
    )
    expect(failedMoneyLine({ stills: 1, clips: 0, returned: 1 })).toMatch(
      /уже оплачены.*За недорисованные кадры \(1\) токены возвращены/
    )
  })
})

/*
 * NO CLONE: HER OWN VOICE NOTES, ON KIE (spec v4, owner 2026-09-27: "our Kie
 * is paid"). A reel the seller asks for, for a client with no clone, speaks
 * her recorded words -- one piece per scene -- instead of refusing; a client
 * pressing for herself still needs her clone.
 */
describe('a client with no clone: her own voice notes', () => {
  const PIECES = ['https://s/v1.mp3', 'https://s/v2.mp3', 'https://s/v3.mp3']

  it("a seller's reel speaks her recorded pieces, fetched before any still is drawn", async () => {
    const base = fakeBase()
    qualify(base, { voice: false })
    const order: string[] = []
    const seen: Array<{ args: any; ctx: ToolContext }> = []
    const { deps } = depsOn(base, async (args, ctx) => {
      order.push('story')
      seen.push({ args, ctx })
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    const asked: unknown[] = []
    deps.voiceNotes = async (seller, lead, parts) => {
      order.push('notes')
      asked.push([seller, lead, parts])
      return { urls: PIECES, seconds: 11 }
    }
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    expect(out.started).toBe(true)
    await drain()
    expect(order).toEqual(['notes', 'story'])
    expect(asked).toEqual([[SELLER, LENA, 3]])
    expect(seen[0].ctx.storyVoices).toEqual(PIECES)
    // Nothing is synthesised in her voice: no clone to ask for.
    expect(seen[0].args.for_lead).toBeUndefined()
    expect(base.db.jobs[0].status).toBe('done')
  })

  it('no voice notes: the job says why, and nothing is drawn', async () => {
    const base = fakeBase()
    qualify(base, { voice: false })
    let drawn = 0
    const { deps, said } = depsOn(base, async () => {
      drawn += 1
      return { done: true, url: 'x' }
    })
    deps.voiceNotes = async () => ({
      why: 'она не присылала голосовых — попроси голосовое на 15–30 с о её деле',
    })
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(drawn).toBe(0)
    expect(base.db.jobs[0].status).toBe('failed')
    expect(said[said.length - 1].text).toMatch('не присылала голосовых')
    expect(said[said.length - 1].text).toMatch('не списаны')
  })

  it('her clone, when she has one, still speaks: the notes are not read', async () => {
    const base = fakeBase()
    qualify(base)
    let read = 0
    const seen: any[] = []
    const { deps } = depsOn(base, async args => {
      seen.push(args)
      return { done: true, url: 'x' }
    })
    deps.voiceNotes = async () => {
      read += 1
      return { urls: PIECES, seconds: 11 }
    }
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(read).toBe(0)
    expect(seen[0].for_lead).toBe(LENA)
  })

  it('a client pressing for herself with no clone is told what is missing', async () => {
    const base = fakeBase()
    qualify(base, { voice: false })
    const { deps } = depsOn(base, async () => ({ done: true, url: 'x' }))
    deps.voiceNotes = async () => ({ urls: PIECES, seconds: 11 })
    const out = await startStory(deps, { lead: LENA, requester: LENA })
    expect(out.started).toBe(false)
    expect(out.why).toBeTruthy()
    expect(base.db.jobs).toHaveLength(0)
  })
})

describe('her clone refused by its provider: her notes, in the same run (spec v5)', () => {
  const PIECES = ['https://s/v1.mp3', 'https://s/v2.mp3', 'https://s/v3.mp3']
  const STILLS = ['https://s/a.png', 'https://s/b.png', 'https://s/c.png']
  const REFUSED =
    'голос 1: озвучка не удалась: HTTP 500 Replicate TTS failed: 402 - Insufficient credit'

  function refusedOnce(answer = REFUSED) {
    const calls: Array<{ args: any; ctx: ToolContext }> = []
    const story: StoryDeps['story'] = async (args, ctx) => {
      calls.push({ args, ctx })
      return calls.length === 1
        ? { done: false, reason: answer, stills: STILLS, clips: [] }
        : { done: true, url: 'https://bucket.example/reel.mp4' }
    }
    return { story, calls }
  }

  it("a seller's reel speaks her notes on the stills already paid for, no second job", async () => {
    const base = fakeBase()
    qualify(base)
    const { story, calls } = refusedOnce()
    const { deps } = depsOn(base, story)
    const order: string[] = []
    deps.voiceNotes = async () => {
      order.push('notes')
      return { urls: PIECES, seconds: 11 }
    }
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(calls).toHaveLength(2)
    expect(order).toEqual(['notes'])
    expect(calls[0].args.for_lead).toBe(LENA)
    // The second pass: her notes, no clone, the stills carried.
    expect(calls[1].args.for_lead).toBeUndefined()
    expect(calls[1].args.stills).toEqual(STILLS)
    expect(calls[1].ctx.storyVoices).toEqual(PIECES)
    expect(base.db.jobs).toHaveLength(1)
    expect(base.db.jobs[0].status).toBe('done')
  })

  it('a failure that does not blame the provider is not a reason to swap her voice', async () => {
    const base = fakeBase()
    qualify(base)
    const { story, calls } = refusedOnce('липсинк 1: timeout after 300 s')
    const { deps } = depsOn(base, story)
    let read = 0
    deps.voiceNotes = async () => {
      read += 1
      return { urls: PIECES, seconds: 11 }
    }
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(read).toBe(0)
    expect(calls).toHaveLength(1)
    expect(base.db.jobs[0].status).not.toBe('done')
  })

  it('a client pressing for herself keeps her clone: her notes are read only for the seller', async () => {
    const base = fakeBase()
    qualify(base)
    base.db.profiles.push({
      owner_id: SELLER,
      telegram_id: LENA,
      updated: 2,
      profile: { vip: true, story_reel: { payer: 'owner' } },
    })
    const { story, calls } = refusedOnce()
    const { deps } = depsOn(base, story)
    let read = 0
    deps.voiceNotes = async () => {
      read += 1
      return { urls: PIECES, seconds: 11 }
    }
    deps.voiceDown = () => true
    await startStory(deps, { lead: LENA, requester: LENA, bot: 'example_bot' })
    await drain()
    expect(read).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0].args.for_lead).toBe(LENA)
  })

  it("known down before the run: the seller's reel starts on her notes, the clone is not asked", async () => {
    const base = fakeBase()
    qualify(base)
    const seen: any[] = []
    const { deps } = depsOn(base, async (args, ctx) => {
      seen.push({ args, ctx })
      return { done: true, url: 'https://bucket.example/reel.mp4' }
    })
    deps.voiceNotes = async () => ({ urls: PIECES, seconds: 11 })
    deps.voiceDown = () => true
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(seen).toHaveLength(1)
    expect(seen[0].args.for_lead).toBeUndefined()
    expect(seen[0].ctx.storyVoices).toEqual(PIECES)
  })

  it('no notes to fall back on: the stills stay kept, nothing is drawn again', async () => {
    const base = fakeBase()
    qualify(base)
    const { story, calls } = refusedOnce()
    const { deps } = depsOn(base, story)
    deps.voiceNotes = async () => ({ why: 'она не присылала голосовых' })
    await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(calls).toHaveLength(1)
    const job = base.db.jobs[0]
    expect(job.status).not.toBe('done')
    expect(JSON.parse(job.stills)).toEqual(STILLS)
  })
})

describe("the day's generations, counted before anything is spent (spec v6)", () => {
  it('a reel the day cannot cover is refused in words before a still is drawn', async () => {
    const base = fakeBase()
    qualify(base)
    let drawn = 0
    const { deps } = depsOn(base, async () => {
      drawn += 1
      return { done: true, url: 'x' }
    })
    const asked: string[] = []
    deps.generationsLeft = async payer => {
      asked.push(payer)
      return slotsNeeded(3, 0, 0, true) - 1
    }
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(out.started).toBe(false)
    expect(out.why).toMatch('суточный лимит генераций')
    expect(out.why).toMatch(`нужно ${slotsNeeded(3, 0, 0, true)}`)
    expect(asked).toEqual([SELLER])
    expect(base.db.jobs).toHaveLength(0)
    expect(drawn).toBe(0)
  })

  it('exactly enough starts; her notes need fewer slots than her clone', async () => {
    const base = fakeBase()
    qualify(base, { voice: false })
    const { deps } = depsOn(base, async () => ({ done: true, url: 'x' }))
    deps.voiceNotes = async () => ({
      urls: ['https://s/1.mp3', 'https://s/2.mp3', 'https://s/3.mp3'],
      seconds: 11,
    })
    deps.generationsLeft = async () => slotsNeeded(3, 0, 0, false)
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(out.started).toBe(true)
    expect(base.db.jobs[0].status).toBe('done')
    expect(slotsNeeded(3, 0, 0, false)).toBeLessThan(slotsNeeded(3, 0, 0, true))
  })

  it('met mid-way: the job waits with its attempt given back, and is told once', async () => {
    const base = fakeBase()
    qualify(base)
    let drawn = 0
    const { deps, said } = depsOn(base, async () => {
      drawn += 1
      return { done: true, url: 'x' }
    })
    // Enough to start; by the time the job runs, the day is spent.
    const left = [20, 2, 2]
    deps.generationsLeft = async () => left.shift() ?? 2
    const out = await startStory(deps, {
      lead: LENA,
      requester: SELLER,
      seller: SELLER,
      topic: 'Ваза',
    })
    await drain()
    expect(out.started).toBe(true)
    const job = base.db.jobs[0]
    expect(drawn).toBe(0)
    expect(job.status).toBe('running')
    expect(job.runner).toBe(null)
    expect(job.attempts).toBe(0)
    expect(String(job.error)).toMatch(CAP_WAIT_MARK)
    const told = said.filter(x => /ждёт/.test(x.text)).length // cyrillic-ok: the seller's word under test
    expect(told).toBe(1)
    // The sweep takes it again while the day is still spent: still waiting,
    // the attempt still kept, nobody told a second time.
    job.runner = 'runner-a'
    await runStoryJob(deps, job.id)
    await drain()
    expect(job.attempts).toBe(0)
    expect(job.status).toBe('running')
    expect(said.filter(x => /ждёт/.test(x.text)).length).toBe(told) // cyrillic-ok: the seller's word under test
    expect(drawn).toBe(0)
  })

  it('what a resumed job still needs is only its missing parts', () => {
    expect(slotsNeeded(3, 3, 0, false)).toBe(4)
    expect(slotsNeeded(3, 3, 2, true)).toBe(3)
    expect(dayCovers(3, 3)).toBe(true)
    expect(dayCovers(2, 3)).toBe(false)
  })
})
