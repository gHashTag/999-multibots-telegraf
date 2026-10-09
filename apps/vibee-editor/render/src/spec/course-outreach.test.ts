import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './course-outreach.gen'
import {
  batchOk,
  channelOf,
  classify,
  draftCounts,
  draftProblem,
  hasHashRoute,
  maySend,
  numberOk,
  pitchState,
  shareLinkOk,
  signsIn,
  verdict,
} from '../agent/course-outreach'
import {
  COURSE_OUTREACH_TOOLS,
  cardText,
  setOutreachDepsForTests,
  type OutreachDeps,
} from '../agent/course-outreach-tool'
import { CARD_MAX, draftOf } from '../agent/social-tools'
import { OWNER_TELEGRAM_ID } from '../agent/telegram-tools'

/**
 * THE COURSE OUTREACH IS WRITTEN IN t27 FIRST (skill t27-spec-first).
 *
 * specs/automation/course-outreach.t27 is the spec of record; the vendored
 * copy and its generated module are held equal by
 * scripts/check-t27-specs.mjs. Each `test` of the spec runs below against the
 * HOST: the pure rules of src/agent/course-outreach.ts and the tool
 * course_outreach over a fake database that answers only the statements the
 * tool speaks (anything else throws). Nothing reaches Telegram: the permission
 * card and the send are recorders.
 *
 * The ids are invented (9000000dd), never a real person's.
 */

const OWNER = OWNER_TELEGRAM_ID
const ANNA = '900000011'
const BORIS = '900000012'
const VERA = '900000013'
const GLEB = '900000014'
const DINA = '900000015'

const pitchOk = {
  programmer: true,
  hasChannel: true,
  optedOut: false,
  dropped: false,
  refused: false,
  pitched: false,
  replied: false,
}

describe('specs/automation/course-outreach.t27 against the host', () => {
  it('two different groups of signs make a programmer', () => {
    expect(verdict(2, false)).toBe('programmer')
    expect(verdict(5, false)).toBe('programmer')
    expect(verdict(1, false)).toBe('unknown')
    expect(SPEC.PROGRAMMER_BAR).toBe(2)
    // The host's groups are the spec's count.
    const [one] = classify([
      { lead: ANNA, text: 'I write Python and keep it all on github.com/anna' },
    ])
    expect(one.verdict).toBe('programmer')
    expect(one.signs).toEqual(['code_host', 'language'])
  })

  it('unknown is unknown, not not-a-programmer', () => {
    expect(verdict(0, false)).toBe('unknown')
    expect(verdict(1, false)).not.toBe('not')
    const [one] = classify([
      { lead: BORIS, text: 'Python is my favourite snake' },
    ])
    expect(one.verdict).toBe('unknown')
    expect(one.signs).toEqual(['language'])
  })

  it('his own word that he is not a programmer outranks the signs', () => {
    expect(verdict(0, true)).toBe('not')
    expect(verdict(3, true)).toBe('not')
    const [one] = classify([
      // cyrillic-ok-next-line
      { lead: VERA, text: 'Я не программист, хотя python и github видела' },
    ])
    expect(one.verdict).toBe('not')
  })

  it('a draft goes only where the two already talk', () => {
    expect(channelOf(1)).toBe('telegram')
    expect(channelOf(0)).toBe('none')
  })

  it('a stopped, removed or refusing person gets no draft', () => {
    expect(pitchState({ ...pitchOk, optedOut: true })).toBe('opted-out')
    expect(pitchState({ ...pitchOk, dropped: true })).toBe('dropped')
    expect(pitchState({ ...pitchOk, refused: true })).toBe('refused')
    expect(
      pitchState({ ...pitchOk, optedOut: true, dropped: true, refused: true })
    ).toBe('opted-out')
    expect(SPEC.OPT_OUT_UNKNOWN_BLOCKS).toBe(true)
    expect(SPEC.REFUSAL_BLOCKS_FOREVER).toBe(true)
  })

  it('no evidence or no channel, no draft', () => {
    expect(pitchState({ ...pitchOk, programmer: false })).toBe('not-programmer')
    expect(pitchState({ ...pitchOk, hasChannel: false })).toBe('no-channel')
    expect(pitchState(pitchOk)).toBe('ok')
  })

  it('no second message without a reply', () => {
    expect(pitchState({ ...pitchOk, pitched: true })).toBe('pitched-no-reply')
    expect(pitchState({ ...pitchOk, pitched: true, replied: true })).toBe('ok')
    expect(
      pitchState({ ...pitchOk, optedOut: true, pitched: true, replied: true })
    ).toBe('opted-out')
  })

  it("only the course's own numbers", () => {
    for (const n of [27, 1, 3]) expect(numberOk(n)).toBe(true)
    for (const n of [28, 100, 0]) expect(numberOk(n)).toBe(false)
    expect(SPEC.COURSE_LESSONS).toBe(27)
    expect(SPEC.WIDGETS_PER_LESSON).toBe(1)
    expect(SPEC.LAB_LESSONS).toBe(3)
    // Counted from text: links and letter-attached digits are not claims.
    expect(
      draftCounts(
        `t27 and t27c, stm32: ${SPEC.COURSE_URL} 27 lessons, 3 labs`,
        []
      ).strayNumbers
    ).toBe(0)
    expect(draftCounts('2026 and 1.5', []).strayNumbers).toBe(2)
  })

  it('a draft names why, carries the static link and no hype', () => {
    const base = {
      chars: 200,
      courseLinks: 1,
      hashLinks: 0,
      strayNumbers: 0,
      hype: 0,
      namesWhy: true,
    }
    expect(draftProblem(base)).toBe('')
    expect(draftProblem({ ...base, chars: 99 })).toBe('too-short')
    expect(draftProblem({ ...base, chars: 100 })).toBe('')
    expect(draftProblem({ ...base, chars: 500 })).toBe('')
    expect(draftProblem({ ...base, chars: 501 })).toBe('too-long')
    expect(draftProblem({ ...base, hashLinks: 1 })).toBe('hash-link')
    expect(draftProblem({ ...base, courseLinks: 0 })).toBe('no-link')
    expect(draftProblem({ ...base, strayNumbers: 1 })).toBe('number')
    expect(draftProblem({ ...base, hype: 1 })).toBe('hype')
    expect(draftProblem({ ...base, namesWhy: false })).toBe('not-personal')
    // And the counts come from the text the model wrote.
    const c = draftCounts(
      // cyrillic-ok-next-line
      'Лучший курс https://t27.ai/#/course для тебя',
      ['verilog']
    )
    expect(c.hashLinks).toBe(1)
    expect(c.courseLinks).toBe(0)
    expect(c.hype).toBe(1)
    expect(c.namesWhy).toBe(false)
  })

  it('one card holds one to five drafts', () => {
    expect(batchOk(0)).toBe(false)
    expect(batchOk(1)).toBe(true)
    expect(batchOk(5)).toBe(true)
    expect(batchOk(6)).toBe(false)
    expect(SPEC.BATCH_MAX).toBe(5)
  })

  it("nothing is sent without the owner's press", () => {
    expect(maySend('allowed')).toBe(true)
    for (const a of ['denied', 'expired', 'pending', '', undefined])
      expect(maySend(a)).toBe(false)
    expect(SPEC.SENDS_WITHOUT_PRESS).toBe(false)
    expect(SPEC.SEND_WAIT_MS).toBeLessThan(SPEC.PENDING_TTL_MS)
    // The tool-level proof is in 'the gate' below: denied, expired and a
    // card answered by someone else reach no send at all.
  })

  it('the shared link is the static course page', () => {
    expect(shareLinkOk(false)).toBe(true)
    expect(shareLinkOk(true)).toBe(false)
    expect(hasHashRoute('https://t27.ai/#/course')).toBe(true)
    expect(hasHashRoute(SPEC.COURSE_URL)).toBe(false)
    expect(SPEC.COURSE_URL).toBe('https://t27.ai/learn/course/')
    expect(SPEC.TAG).toBe('programmer')
    expect(SPEC.CAMPAIGN).toBe('fpga-course')
    // social_post refuses the #/ route and takes the static page.
    const post = { title: 'From zero to a chip', summary: 'x' }
    expect(() => draftOf({ ...post, link: 'https://t27.ai/#/course' })).toThrow(
      /#\/ route/
    )
    expect(draftOf({ ...post, link: SPEC.COURSE_URL }).post.link).toBe(
      SPEC.COURSE_URL
    )
  })

  it('nobody has been written to through it yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(maySend('pending')).toBe(false)
    expect(SPEC.VERSION).toBe(1)
    expect(SPEC.HISTORY_ROWS).toBe(5000)
    expect(SPEC.EVIDENCE_QUOTES).toBe(3)
    expect(SPEC.EVIDENCE_CHARS).toBe(80)
  })
})

describe('the sign words', () => {
  it('a Latin word is whole: "trust" is not Rust, "basic" is not ASIC', () => {
    expect(signsIn('I trust a basic plan')).toEqual([])
    // The end of the word too: "rusty" is not Rust, "zigzag" is not Zig.
    expect(signsIn('a rusty zigzag on a swiftly javanese boat')).toEqual([])
    expect(signsIn('rust and asic').map(s => s.group)).toEqual([
      'language',
      'hardware',
    ])
  })

  it('a Cyrillic stem counts in every case form', () => {
    // cyrillic-ok-next-line
    const s = signsIn('Работаю программистом, вчера три коммита залил')
    expect(s.map(x => x.group)).toEqual(['role', 'practice'])
  })

  it('one group said three times is still one group', () => {
    const [one] = classify([
      { lead: ANNA, text: 'python' },
      { lead: ANNA, text: 'Python again' },
      { lead: ANNA, text: 'PYTHON!' },
    ])
    expect(one.signs).toEqual(['language'])
    expect(one.verdict).toBe('unknown')
  })
})

// ---- the tool over a fake database ------------------------------------------------

interface Msg {
  owner: string
  lead: string
  at: number
  out: boolean
  text: string
}

/** ILIKE as Postgres reads it: % any run, _ one char, backslash escapes. */
function ilike(text: string, pattern: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') re += pattern[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    else if (c === '%') re += '[\\s\\S]*'
    else if (c === '_') re += '[\\s\\S]'
    else re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'iu').test(text)
}

function fakeDb() {
  const db = {
    people: [] as Array<{
      owner: string
      lead: string
      first: string
      user: string | null
    }>,
    dms: [] as Msg[],
    groups: [] as Msg[],
    tags: [] as Array<{
      owner: string
      lead: string
      tag: string
      source: string
      evidence: string
    }>,
    outreach: [] as Array<{
      owner: string
      lead: string
      campaign: string
      sent: number
    }>,
    optOuts: [] as Array<{ owner: string; client: string }>,
    dropped: [] as Array<{ owner: string; lead: string }>,
    refused: [] as Array<{ owner: string; lead: string }>,
    clock: 1_800_000_000,
    sql: [] as string[],
  }
  const pool = {
    async query(sql: string, p: any[] = []) {
      db.sql.push(sql)
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^CREATE (TABLE|INDEX|UNIQUE INDEX)/.test(s)) return { rows: [] }
      if (
        s.startsWith(
          'SELECT lead_id, first_name, last_name, username FROM crm_people'
        )
      )
        return {
          rows: db.people
            .filter(r => r.owner === p[0])
            .map(r => ({
              lead_id: r.lead,
              first_name: r.first,
              last_name: null,
              username: r.user,
            })),
        }
      if (s.startsWith('SELECT lead_id, count(*)::int AS n')) {
        const by = new Map<string, { n: number; last: number | null }>()
        for (const m of db.dms.filter(m => m.owner === p[0])) {
          const r = by.get(m.lead) ?? { n: 0, last: null }
          r.n += 1
          // FILTER (WHERE NOT "out"): the newest of THEIR messages only.
          if (!/FILTER \(WHERE NOT "out"\)/.test(s) || !m.out)
            r.last = Math.max(r.last ?? 0, m.at)
          by.set(m.lead, r)
        }
        return {
          rows: [...by].map(([lead, r]) => ({
            lead_id: lead,
            n: r.n,
            last_in: r.last,
          })),
        }
      }
      // Only the side the statement names: NOT "out" is read, not assumed.
      const theirs = /NOT "out"/.test(s)
      const candidates = (list: Msg[]) =>
        list
          .filter(m => m.owner === p[0] && (!theirs || !m.out))
          .filter(m => (p[1] as string[]).some(pt => ilike(m.text, pt)))
          .sort((a, b) => b.at - a.at)
          .slice(0, p[2])
          .map(m => ({ lead_id: m.lead, text: m.text }))
      if (
        s.startsWith(
          'SELECT lead_id, text FROM crm_messages WHERE owner_id = $1 AND NOT "out" AND text ILIKE ANY'
        )
      )
        return { rows: candidates(db.dms) }
      if (
        s.startsWith(
          'SELECT sender_id AS lead_id, text FROM crm_group_messages'
        )
      )
        return { rows: candidates(db.groups) }
      if (
        s.startsWith(
          'SELECT lead_id, EXTRACT(EPOCH FROM sent_at) AS sent FROM crm_outreach'
        )
      )
        return {
          rows: db.outreach
            .filter(r => r.owner === p[0] && r.campaign === p[1])
            .map(r => ({ lead_id: r.lead, sent: r.sent })),
        }
      if (s.startsWith('SELECT lead_id, evidence FROM crm_tags'))
        return {
          rows: db.tags
            .filter(r => r.owner === p[0] && r.tag === p[1])
            .map(r => ({ lead_id: r.lead, evidence: r.evidence })),
        }
      if (s.startsWith('INSERT INTO crm_tags')) {
        const old = db.tags.find(
          r => r.owner === p[0] && r.lead === p[1] && r.tag === p[2]
        )
        if (old) Object.assign(old, { source: p[3], evidence: p[4] })
        else
          db.tags.push({
            owner: p[0],
            lead: p[1],
            tag: p[2],
            source: p[3],
            evidence: p[4],
          })
        return { rows: [] }
      }
      if (s.startsWith('INSERT INTO crm_outreach')) {
        const old = db.outreach.find(
          r => r.owner === p[0] && r.lead === p[1] && r.campaign === p[2]
        )
        if (old) old.sent = db.clock
        else
          db.outreach.push({
            owner: p[0],
            lead: p[1],
            campaign: p[2],
            sent: db.clock,
          })
        return { rows: [] }
      }
      if (s.startsWith('SELECT client_id, since FROM assistant_opt_outs'))
        return {
          rows: db.optOuts
            .filter(r => r.owner === p[0])
            .map(r => ({ client_id: r.client, since: null })),
        }
      if (s.startsWith('SELECT lead_id, since FROM crm_dropped'))
        return {
          rows: db.dropped
            .filter(r => r.owner === p[0])
            .map(r => ({ lead_id: r.lead, since: null })),
        }
      if (
        s.startsWith(
          "SELECT DISTINCT lead_id FROM crm_touches WHERE owner_id = $1 AND kind = 'refused'"
        )
      )
        return {
          rows: db.refused
            .filter(r => r.owner === p[0])
            .map(r => ({ lead_id: r.lead })),
        }
      throw new Error(`fake db: unknown statement: ${s.slice(0, 80)}`)
    },
  }
  return { db, pool }
}

const tool = COURSE_OUTREACH_TOOLS.find(t => t.name === 'course_outreach')!

function seen(states: string[], answeredBy = OWNER) {
  const rec = {
    asked: [] as string[],
    sent: [] as Array<{ lead: string; text: string }>,
  }
  const d: Partial<OutreachDeps> = {
    ask: async (_c, what) => {
      rec.asked.push(what)
      return `card-${rec.asked.length}`
    },
    answer: async () => {
      const state = states.length > 1 ? states.shift()! : states[0]
      return { state, telegramId: answeredBy }
    },
    sleep: async () => {},
    send: async (_c, lead, text) => {
      rec.sent.push({ lead, text })
      return { done: true }
    },
  }
  setOutreachDepsForTests(d)
  return rec
}

/** A people book: Anna and Gleb program and talk to the owner in DMs. */
function world() {
  const w = fakeDb()
  const { db } = w
  const dm = (lead: string, text: string, out = false, at = 1_700_000_000) =>
    db.dms.push({ owner: OWNER, lead, at, out, text })
  db.people.push(
    { owner: OWNER, lead: ANNA, first: 'Anna', user: 'anna_dev' },
    { owner: OWNER, lead: BORIS, first: 'Boris', user: null },
    { owner: OWNER, lead: VERA, first: 'Vera', user: null },
    { owner: OWNER, lead: GLEB, first: 'Gleb', user: null },
    { owner: OWNER, lead: DINA, first: 'Dina', user: null }
  )
  dm(ANNA, 'Pushed the Verilog core to github.com/anna/core yesterday')
  dm(GLEB, 'my python compiler finally passes its tests')
  dm(BORIS, 'how are you')
  // The owner's own words are not evidence about Boris.
  dm(BORIS, 'you are a developer, you know python, right?', true)
  // cyrillic-ok-next-line
  dm(VERA, 'Я не программист, просто нашла github')
  // Dina writes code only in a group: no DM channel.
  db.groups.push({
    owner: OWNER,
    lead: DINA,
    at: 1_700_000_000,
    out: false,
    text: 'rust backend is deployed',
  })
  return w
}

const ctxOf = (pool: unknown, id = OWNER) => ({ telegramId: id, pool }) as any

const draftFor = (lead: string, why: string) =>
  // cyrillic-ok-next-line
  `Привет! Видел, что ты пишешь на ${why}. Я собрал курс: 27 уроков, в каждом 1 работающий виджет, потом лаборатория из 3. ${SPEC.COURSE_URL}`

afterEach(() => setOutreachDepsForTests(null))

describe('find: classified by their words, tagged once', () => {
  it('programmer, not and unknown, with the evidence', async () => {
    const { pool } = world()
    seen(['allowed'])
    const r: any = await tool.handler({ step: 'find' }, ctxOf(pool))
    const ids = r.programmers.map((p: any) => p.id).sort()
    expect(ids).toEqual([ANNA, GLEB, DINA].sort())
    expect(r.not.map((p: any) => p.id)).toEqual([VERA])
    // Boris: only the owner's words carry signs -> unknown, never "not".
    expect(r.counts).toEqual({ people: 5, programmer: 3, not: 1, unknown: 1 })
    const anna = r.programmers.find((p: any) => p.id === ANNA)
    expect(anna.signs).toEqual(['code_host', 'hardware'])
    expect(anna.quotes.length).toBe(2)
    expect(anna.channel).toBe('telegram')
    expect(anna.may_draft).toBe('ok')
    const dina = r.programmers.find((p: any) => p.id === DINA)
    expect(dina.channel).toBe('none')
    expect(dina.may_draft).toBe('no-channel')
    expect(r.course.link).toBe(SPEC.COURSE_URL)
  })

  it('a second find adds nobody twice', async () => {
    const { db, pool } = world()
    const first: any = await tool.handler({ step: 'find' }, ctxOf(pool))
    expect(first.tagged_new).toBe(3)
    expect(db.tags.length).toBe(3)
    const again: any = await tool.handler({ step: 'find' }, ctxOf(pool))
    expect(again.tagged_new).toBe(0)
    expect(db.tags.length).toBe(3)
    expect(again.programmers.every((p: any) => p.tagged === 'already')).toBe(
      true
    )
    expect(JSON.parse(db.tags[0].evidence).words.length).toBeGreaterThan(0)
  })

  it('a person the owner removed is not put back by a tag', async () => {
    const { db, pool } = world()
    db.dropped.push({ owner: OWNER, lead: ANNA })
    await tool.handler({ step: 'find' }, ctxOf(pool))
    expect(db.tags.map(t => t.lead).sort()).toEqual([GLEB, DINA].sort())
  })

  it('nobody but the owner may call it', async () => {
    const { pool } = world()
    await expect(
      tool.handler({ step: 'find' }, ctxOf(pool, '900000099'))
    ).rejects.toThrow()
  })
})

describe('draft: one personal message each, checked, one card', () => {
  let w: ReturnType<typeof world>
  beforeEach(async () => {
    w = world()
    await tool.handler({ step: 'find' }, ctxOf(w.pool))
  })

  it('every accepted message is on the card in full, nothing is sent', async () => {
    const rec = seen(['allowed'])
    const r: any = await tool.handler(
      {
        step: 'draft',
        drafts: [
          { telegram_id: ANNA, text: draftFor(ANNA, 'Verilog') },
          { telegram_id: GLEB, text: draftFor(GLEB, 'Python') },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r.approval).toBe('card-1')
    expect(r.on_card).toEqual([ANNA, GLEB])
    expect(rec.asked).toHaveLength(1)
    expect(rec.asked[0]).toContain(draftFor(ANNA, 'Verilog'))
    expect(rec.asked[0]).toContain(draftFor(GLEB, 'Python'))
    expect(rec.sent).toEqual([])
  })

  it('refuses the stopped, the unknown, the channel-less and bad drafts', async () => {
    const rec = seen(['allowed'])
    w.db.optOuts.push({ owner: OWNER, client: GLEB })
    const r: any = await tool.handler(
      {
        step: 'draft',
        drafts: [
          { telegram_id: GLEB, text: draftFor(GLEB, 'Python') },
          { telegram_id: BORIS, text: draftFor(BORIS, 'Python') },
          { telegram_id: DINA, text: draftFor(DINA, 'Rust') },
          { telegram_id: ANNA, text: draftFor(ANNA, 'Python') },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r.refused).toEqual({
      [GLEB]: 'opted-out',
      [BORIS]: 'not-programmer',
      [DINA]: 'no-channel',
      // Anna wrote Verilog and GitHub, not Python: the draft is not about her.
      [ANNA]: 'not-personal',
    })
    expect(rec.asked).toEqual([])
  })

  it('a hash link, a stray number, hype and a duplicate are refused', async () => {
    seen(['allowed'])
    const hash = draftFor(ANNA, 'Verilog').replace(
      SPEC.COURSE_URL,
      'https://t27.ai/#/course'
    )
    const r1: any = await tool.handler(
      { step: 'draft', drafts: [{ telegram_id: ANNA, text: hash }] },
      ctxOf(w.pool)
    )
    expect(r1.refused[ANNA]).toBe('hash-link')
    const r2: any = await tool.handler(
      {
        step: 'draft',
        drafts: [
          {
            telegram_id: ANNA,
            text: draftFor(ANNA, 'Verilog').replace('27', '40'),
          },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r2.refused[ANNA]).toBe('number')
    const r3: any = await tool.handler(
      {
        step: 'draft',
        drafts: [
          {
            telegram_id: ANNA,
            text: 'The best course! ' + draftFor(ANNA, 'Verilog'),
          },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r3.refused[ANNA]).toBe('hype')
    const r4: any = await tool.handler(
      {
        step: 'draft',
        drafts: [
          { telegram_id: ANNA, text: draftFor(ANNA, 'Verilog') },
          { telegram_id: ANNA, text: draftFor(ANNA, 'GitHub') },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r4.on_card).toEqual([ANNA])
    expect(r4.refused[ANNA]).toMatch(/duplicate/)
  })

  it('six drafts are not one card', async () => {
    const rec = seen(['allowed'])
    const drafts = Array.from({ length: 6 }, () => ({
      telegram_id: ANNA,
      text: draftFor(ANNA, 'Verilog'),
    }))
    const r: any = await tool.handler({ step: 'draft', drafts }, ctxOf(w.pool))
    expect(r.refused).toMatch(/1 to 5/)
    expect(rec.asked).toEqual([])
  })

  it('a full card of the longest drafts fits one Telegram card', () => {
    const long = 'x'.repeat(SPEC.DRAFT_MAX_CHARS)
    const card = cardText(
      Array.from({ length: SPEC.BATCH_MAX }, (_, i) => ({
        lead: String(900000020 + i),
        label: 'A Long Name Of Somebody @a_long_username_here_x',
        text: long,
      }))
    )
    expect(card.length).toBeLessThanOrEqual(CARD_MAX)
  })
})

describe("the gate: a batch leaves only on the owner's Allow", () => {
  let w: ReturnType<typeof world>
  beforeEach(async () => {
    w = world()
    await tool.handler({ step: 'find' }, ctxOf(w.pool))
  })
  const prepare = async () =>
    (await tool.handler(
      {
        step: 'draft',
        drafts: [
          { telegram_id: ANNA, text: draftFor(ANNA, 'Verilog') },
          { telegram_id: GLEB, text: draftFor(GLEB, 'Python') },
        ],
      },
      ctxOf(w.pool)
    )) as any

  for (const answer of ['denied', 'expired']) {
    it(`${answer}: nothing is sent and the card is spent`, async () => {
      const rec = seen([answer])
      const { approval } = await prepare()
      const r: any = await tool.handler(
        { step: 'send', approval },
        ctxOf(w.pool)
      )
      expect(r.sent).toBe(false)
      expect(r.refused).toMatch(/did not allow/)
      expect(rec.sent).toEqual([])
      expect(w.db.outreach).toEqual([])
      const again: any = await tool.handler(
        { step: 'send', approval },
        ctxOf(w.pool)
      )
      expect(again.refused).toMatch(/no prepared batch/)
      expect(rec.sent).toEqual([])
    })
  }

  it('no tap yet: it waits, sends nothing, and the card stays usable', async () => {
    const rec = seen(['pending'])
    const { approval } = await prepare()
    const realNow = Date.now
    let t = realNow()
    Date.now = () => (t += SPEC.SEND_WAIT_MS)
    try {
      const r: any = await tool.handler(
        { step: 'send', approval },
        ctxOf(w.pool)
      )
      expect(r.waiting).toBe(true)
    } finally {
      Date.now = realNow
    }
    expect(rec.sent).toEqual([])
  })

  it('a card answered by somebody else sends nothing', async () => {
    const rec = seen(['allowed'], '900000098')
    const { approval } = await prepare()
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.refused).toMatch(/someone else/)
    expect(rec.sent).toEqual([])
  })

  it('Allow sends each message once and remembers it', async () => {
    const rec = seen(['allowed'])
    const { approval } = await prepare()
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.results).toEqual({ [ANNA]: 'sent', [GLEB]: 'sent' })
    expect(rec.sent.map(s => s.lead)).toEqual([ANNA, GLEB])
    expect(rec.sent[0].text).toBe(draftFor(ANNA, 'Verilog'))
    expect(w.db.outreach.map(o => o.lead)).toEqual([ANNA, GLEB])
    // The card is used once.
    const again: any = await tool.handler(
      { step: 'send', approval },
      ctxOf(w.pool)
    )
    expect(again.sent).toBe(false)
    expect(rec.sent).toHaveLength(2)
  })

  it('a stop after the card still wins at the press', async () => {
    const rec = seen(['allowed'])
    const { approval } = await prepare()
    w.db.optOuts.push({ owner: OWNER, client: GLEB })
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.results[GLEB]).toBe('not sent: opted-out')
    expect(rec.sent.map(s => s.lead)).toEqual([ANNA])
  })

  it('no second message without a reply, and one after it', async () => {
    seen(['allowed'])
    const { approval } = await prepare()
    await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    // The owner writes to her again by hand: still no reply of hers.
    w.db.dms.push({
      owner: OWNER,
      lead: ANNA,
      at: w.db.clock + 30,
      out: true,
      text: 'ping',
    })
    const rec = seen(['allowed'])
    const r: any = await tool.handler(
      {
        step: 'draft',
        drafts: [{ telegram_id: ANNA, text: draftFor(ANNA, 'Verilog') }],
      },
      ctxOf(w.pool)
    )
    expect(r.refused[ANNA]).toBe('pitched-no-reply')
    expect(rec.asked).toEqual([])
    // Anna answers after the message: a second one may be drafted.
    w.db.dms.push({
      owner: OWNER,
      lead: ANNA,
      at: w.db.clock + 60,
      out: false,
      text: 'nice, tell me more',
    })
    const r2: any = await tool.handler(
      {
        step: 'draft',
        drafts: [{ telegram_id: ANNA, text: draftFor(ANNA, 'Verilog') }],
      },
      ctxOf(w.pool)
    )
    expect(r2.on_card).toEqual([ANNA])
  })

  it('an unreadable stop list offers nobody', async () => {
    const rec = seen(['allowed'])
    const inner = w.pool.query
    w.pool.query = async (sql: string, p?: any[]) => {
      if (/assistant_opt_outs/.test(sql) && /^SELECT/.test(sql.trim()))
        throw new Error('db down')
      return inner(sql, p)
    }
    const r: any = await prepare()
    expect(r.refused).toEqual({ [ANNA]: 'opted-out', [GLEB]: 'opted-out' })
    expect(rec.asked).toEqual([])
  })
})

describe('the agent has it, and only the big agent', () => {
  it('course_outreach is in the shared registry once, outward, owner-side', async () => {
    const { TOOLS, toolsForProvider } = await import('../agent/tools')
    const { isOutwardTool } = await import('../agent/web-tools')
    const { systemPrompt } = await import('../agent/chat')
    expect(TOOLS.filter(t => t.name === 'course_outreach')).toHaveLength(1)
    // A turn that read the web cannot tag or send.
    expect(isOutwardTool('course_outreach')).toBe(true)
    // Not in the 16k kit: its schema budget is pinned in provider.test.ts.
    expect(
      toolsForProvider({ compact: true }, TOOLS).some(
        t => t.name === 'course_outreach'
      )
    ).toBe(false)
    const prompt = systemPrompt()
    expect(prompt).toContain('course_outreach')
    expect(prompt).toContain(SPEC.COURSE_URL)
    expect(prompt).not.toContain('t27.ai/#/course')
  })
})
