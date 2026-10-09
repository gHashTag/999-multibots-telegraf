import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as SPEC from './course-outreach.gen'
import {
  batchOk,
  cardMax,
  cardOk,
  channelOf,
  classify,
  draftCounts,
  draftProblem,
  hasHashRoute,
  maySend,
  networkChannel,
  networkVerdict,
  numberOk,
  ownWords,
  pitchState,
  roundGo,
  shareLinkOk,
  signsIn,
  verdict,
} from '../agent/course-outreach'
import {
  COURSE_OUTREACH_TOOLS,
  cardText,
  netCardText,
  setOutreachDepsForTests,
  type OutreachDeps,
} from '../agent/course-outreach-tool'
import {
  bioDue,
  bioNext,
  bioOf,
  floodSeconds,
  readBios,
} from '../agent/crm-bios'
import {
  merged,
  peopleOf,
  signInWall,
  type NetPerson,
  type NetRead,
} from '../agent/course-outreach-networks'
import type { NetworkLogin } from '../browser/logins'
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

  it("a bio counts as the person's own words", () => {
    for (const s of ['bio', 'headline', 'dm', 'group'])
      expect(ownWords(s)).toBe(true)
    for (const s of ['owner', 'name', 'username', '', undefined])
      expect(ownWords(s)).toBe(false)
    expect(SPEC.BIO_SOURCE).toBe('bio')
    expect(SPEC.BIO_KEEPS_ONLY_TEXT).toBe(true)
    // In the host: one sign in a DM and one in his bio make a programmer,
    // and the bio is quoted as a bio.
    const [one] = classify([
      { lead: ANNA, text: 'my python script', source: 'dm' },
      { lead: ANNA, text: 'code on github.com/anna', source: 'bio' },
    ])
    expect(one.verdict).toBe('programmer')
    expect(one.quotes.map(q => q.source)).toEqual(['dm', 'bio'])
    // The same words said by the owner, or as a name, are nothing.
    const none = classify([
      { lead: BORIS, text: 'my python script', source: 'owner' },
      { lead: BORIS, text: 'github python', source: 'name' },
    ])
    expect(none).toEqual([])
    // His own "not" in his bio outranks signs, as in a message.
    const [vera] = classify([
      // cyrillic-ok-next-line
      { lead: VERA, text: 'Я не программист. python, github', source: 'bio' },
    ])
    expect(vera.verdict).toBe('not')
  })

  it('a bio is read politely and the walk resumes next run', () => {
    expect(bioNext(0, 0)).toBe('go')
    expect(bioNext(0, 29)).toBe('go')
    expect(bioNext(0, 30)).toBe('cap')
    expect(bioNext(17, 0)).toBe('wait')
    expect(bioNext(17, 30)).toBe('wait')
    expect(bioDue(0, true)).toBe(true)
    expect(bioDue(29, false)).toBe(false)
    expect(bioDue(30, false)).toBe(true)
    expect(SPEC.BIOS_PER_RUN).toBe(30)
    expect(SPEC.BIO_GAP_MS).toBe(1000)
    expect(SPEC.BIO_MAX_CHARS).toBe(140)
    // The walk itself is in 'the bio ingest' below.
  })

  it('not signed in, the round stops', () => {
    expect(roundGo('signed_in')).toBe(true)
    for (const l of ['signed_out', 'expired', 'refused', 'unknown', '', null])
      expect(roundGo(l)).toBe(false)
    expect(SPEC.TYPES_PASSWORDS).toBe(false)
    // The tool-level proof: 'networks: the round in his browser' below.
  })

  it('a network the round cannot read is unknown, not no programmers', () => {
    expect(networkVerdict(false, 0, 0)).toBe('unknown')
    expect(networkVerdict(false, 40, 3)).toBe('unknown')
    expect(networkVerdict(true, 0, 0)).toBe('unknown')
    expect(networkVerdict(true, 40, 0)).toBe('none')
    expect(networkVerdict(true, 40, 3)).toBe('found')
    expect(networkVerdict(false, 0, 0)).not.toBe('none')
    expect(SPEC.NETWORK_READ_MAX).toBe(200)
    expect(SPEC.NETWORK_SCROLLS).toBe(8)
    // A sign-in page is not the list.
    expect(signInWall('https://www.linkedin.com/authwall?trk=x')).toBe(true)
    expect(signInWall('https://x.com/i/flow/login')).toBe(true)
    expect(signInWall('not a url')).toBe(true)
    expect(
      signInWall(
        'https://www.linkedin.com/mynetwork/invite-connect/connections/'
      )
    ).toBe(false)
  })

  it('a LinkedIn connection or an X follower can be written to', () => {
    expect(networkChannel('linkedin', true, false)).toBe('linkedin')
    expect(networkChannel('linkedin', false, true)).toBe('none')
    expect(networkChannel('x', false, true)).toBe('x')
    expect(networkChannel('x', true, false)).toBe('none')
    expect(networkChannel('telegram', true, true)).toBe('none')
  })

  it('one card per LinkedIn or X message', () => {
    expect(cardMax('linkedin')).toBe(1)
    expect(cardMax('x')).toBe(1)
    expect(cardMax('telegram')).toBe(SPEC.BATCH_MAX)
    expect(cardOk('x', 1)).toBe(true)
    expect(cardOk('x', 2)).toBe(false)
    expect(cardOk('linkedin', 2)).toBe(false)
    expect(cardOk('linkedin', 0)).toBe(false)
    expect(cardOk('telegram', 5)).toBe(true)
    expect(cardOk('telegram', 6)).toBe(false)
    expect(SPEC.NETWORK_CARD_MAX).toBe(1)
    // The tool-level proof: 'networks: one message, one card, one press'.
  })

  it('no reply is read there, so nobody there is written to twice', () => {
    expect(SPEC.NETWORK_REPLIES_READ).toBe(false)
    expect(
      pitchState({
        ...pitchOk,
        pitched: true,
        replied: SPEC.NETWORK_REPLIES_READ,
      })
    ).toBe('pitched-no-reply')
    expect(pitchState({ ...pitchOk, replied: SPEC.NETWORK_REPLIES_READ })).toBe(
      'ok'
    )
    // The tool-level proof: '... and no second message there' below.
  })

  it('nobody has been written to through it yet', () => {
    expect(SPEC.RUN_LIVE).toBe(false)
    expect(maySend('pending')).toBe(false)
    expect(SPEC.VERSION).toBe(2)
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
    /** Their own bios; null: the column was never added (no bio ingest yet). */
    bios: null as Array<{ owner: string; lead: string; about: string }> | null,
    net: [] as Array<{
      owner: string
      lead: string
      network: string
      handle: string
      name: string | null
      about: string
      url: string
      channel: string
    }>,
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
      if (
        s.startsWith(
          "SELECT lead_id, about FROM crm_people WHERE owner_id = $1 AND about IS NOT NULL AND about <> ''"
        )
      ) {
        if (db.bios === null) throw new Error('column "about" does not exist')
        return {
          rows: db.bios
            .filter(r => r.owner === p[0] && r.about)
            .slice(0, p[1])
            .map(r => ({ lead_id: r.lead, about: r.about })),
        }
      }
      if (
        s.startsWith(
          'SELECT lead_id, network, handle, name, profile_url, channel FROM crm_network_people'
        )
      )
        return {
          rows: db.net
            .filter(r => r.owner === p[0])
            .map(r => ({
              lead_id: r.lead,
              network: r.network,
              handle: r.handle,
              name: r.name,
              profile_url: r.url,
              channel: r.channel,
            })),
        }
      if (s.startsWith('INSERT INTO crm_network_people')) {
        const row = {
          owner: p[0],
          lead: p[1],
          network: p[2],
          handle: p[3],
          name: p[4],
          about: p[5],
          url: p[6],
          channel: p[7],
        }
        const old = db.net.find(r => r.owner === p[0] && r.lead === p[1])
        if (old) Object.assign(old, row)
        else db.net.push(row)
        return { rows: [] }
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
    // No browser in these tests unless a test gives one.
    logins: async () => null,
    driving: async () => false,
    readNetwork: async () => {
      throw new Error('no browser in this test')
    },
    sendNetwork: async () => {
      throw new Error('no browser in this test')
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

// ---- spec v2: their own bios ------------------------------------------------------

describe('find: his own bio is his own words', () => {
  it('a DM sign and a bio sign make a programmer, quoted as a bio', async () => {
    const { db, pool } = world()
    // Boris wrote "how are you" in a DM; his bio says the rest.
    db.dms.push({
      owner: OWNER,
      lead: BORIS,
      at: 1_700_000_100,
      out: false,
      text: 'shipped a python tool today',
    })
    db.bios = [
      { owner: OWNER, lead: BORIS, about: 'Code at github.com/boris' },
      // Another owner's contact: never read for this one.
      { owner: '900000097', lead: VERA, about: 'Rust developer' },
    ]
    const r: any = await tool.handler({ step: 'find' }, ctxOf(pool))
    const boris = r.programmers.find((p: any) => p.id === BORIS)
    expect(boris.signs).toEqual(['code_host', 'language'])
    expect(boris.quotes.map((q: any) => q.source).sort()).toEqual(['bio', 'dm'])
    expect(r.looked.bios).toBe(1)
    expect(db.tags.some(t => t.lead === BORIS)).toBe(true)
    // Vera's bio belongs to someone else's book: she stays "not".
    expect(r.not.map((p: any) => p.id)).toEqual([VERA])
  })

  it('without the bio its one sign stays unknown', async () => {
    const { db, pool } = world()
    db.dms.push({
      owner: OWNER,
      lead: BORIS,
      at: 1_700_000_100,
      out: false,
      text: 'shipped a python tool today',
    })
    const r: any = await tool.handler({ step: 'find' }, ctxOf(pool))
    expect(r.programmers.some((p: any) => p.id === BORIS)).toBe(false)
    // Never read is said, not passed off as "nobody has a bio".
    expect(r.looked.bios).toMatch(/not read yet/)
  })
})

describe('the bio ingest: politely, resumed next run', () => {
  function bioPool() {
    const st = {
      people: new Map<string, { about: string | null; at: number | null }>(),
      until: null as number | null,
      sql: [] as string[],
    }
    const pool = {
      async query(sql: string, p: any[] = []) {
        const s = sql.replace(/\s+/g, ' ').trim()
        st.sql.push(s)
        if (
          /^(ALTER TABLE crm_people ADD COLUMN|CREATE TABLE IF NOT EXISTS crm_bio_wait)/.test(
            s
          )
        )
          return { rows: [] }
        if (
          s.startsWith(
            'SELECT EXTRACT(EPOCH FROM until_at) AS until FROM crm_bio_wait'
          )
        )
          return { rows: st.until === null ? [] : [{ until: st.until }] }
        if (
          s.startsWith(
            'SELECT lead_id, EXTRACT(EPOCH FROM about_at) AS at FROM crm_people'
          )
        )
          return {
            rows: (p[1] as string[])
              .filter(id => st.people.has(id))
              .map(id => ({ lead_id: id, at: st.people.get(id)!.at })),
          }
        if (s.startsWith('INSERT INTO crm_bio_wait')) {
          st.until = p[1]
          return { rows: [] }
        }
        if (
          s.startsWith('UPDATE crm_people SET about = $3, about_at = now()')
        ) {
          st.people.set(p[1], { about: p[2], at: NOW_S })
          return { rows: [] }
        }
        if (s.startsWith('UPDATE crm_people SET about_at = now()')) {
          const old = st.people.get(p[1])
          st.people.set(p[1], { about: old?.about ?? null, at: NOW_S })
          return { rows: [] }
        }
        throw new Error(`bio pool: unknown statement: ${s.slice(0, 80)}`)
      },
    }
    return { st, pool }
  }
  const NOW_S = 1_800_000_000
  const ids = (n: number, from = 0) =>
    Array.from({ length: n }, (_, i) => String(900000100 + from + i))
  const io = (
    o: { floodAt?: number; floodS?: number; failAt?: number } = {}
  ) => {
    const rec = { asked: [] as string[], slept: [] as number[] }
    return {
      rec,
      io: {
        full: async (input: unknown) => {
          const id = String(input)
          rec.asked.push(id)
          if (o.floodAt !== undefined && rec.asked.length === o.floodAt) {
            const e = new Error(`A wait of ${o.floodS} seconds is required`)
            ;(e as any).seconds = o.floodS
            throw e
          }
          if (o.failAt !== undefined && rec.asked.length === o.failAt)
            throw new Error('USER_ID_INVALID')
          return {
            fullUser: {
              about: `  bio of\n${id}  `,
              phone: '+10000000000',
              commonChatsCount: 3,
            },
            users: [{ id, phone: '+10000000000' }],
          }
        },
        sleep: async (ms: number) => {
          rec.slept.push(ms)
        },
        now: () => NOW_S * 1000,
      },
    }
  }
  const book = (list: string[]) => list.map(lead => ({ lead, input: lead }))

  it('keeps only the bio text, cut, and nothing of the rest', async () => {
    expect(
      bioOf({ fullUser: { about: 'x'.repeat(400), phone: '+1' } })
    ).toHaveLength(SPEC.BIO_MAX_CHARS)
    expect(bioOf({ fullUser: {} })).toBe('')
    expect(bioOf(null)).toBe('')
    const { st, pool } = bioPool()
    const { io: d } = io()
    const r = await readBios(pool, OWNER, book(ids(2)), d)
    expect(r).toMatchObject({ bios_read: 2, bios_with_text: 2, bios_left: 0 })
    const one = st.people.get(ids(1)[0])!
    expect(one.about).toBe(`bio of ${ids(1)[0]}`)
    // No phone, no chats count, no user object reached any statement.
    expect(st.sql.join(' ')).not.toMatch(/phone|common|\+1000/)
  })

  it('a cap per run, a gap between calls, and the rest next run', async () => {
    const { st, pool } = bioPool()
    const all = ids(SPEC.BIOS_PER_RUN + 5)
    const first = io()
    const r1 = await readBios(pool, OWNER, book(all), first.io)
    expect(r1.bios_read).toBe(SPEC.BIOS_PER_RUN)
    expect(r1.bios_left).toBe(5)
    expect(first.rec.slept).toEqual(
      Array(SPEC.BIOS_PER_RUN - 1).fill(SPEC.BIO_GAP_MS)
    )
    // The next run takes the five never read, not the thirty just read.
    const second = io()
    const r2 = await readBios(pool, OWNER, book(all), second.io)
    expect(second.rec.asked).toEqual(all.slice(SPEC.BIOS_PER_RUN))
    expect(r2).toMatchObject({ bios_read: 5, bios_left: 0 })
    expect(st.people.size).toBe(all.length)
  })

  it('a FLOOD_WAIT ends the run, is written down, and is honoured next run', async () => {
    const { st, pool } = bioPool()
    const all = ids(6)
    const first = io({ floodAt: 3, floodS: 120 })
    const r1 = await readBios(pool, OWNER, book(all), first.io)
    expect(first.rec.asked).toHaveLength(3)
    expect(r1.bios_read).toBe(2)
    expect(r1.bios_left).toBe(4)
    expect(r1.bios_stopped).toMatch(/FLOOD_WAIT/)
    expect(st.until).toBe(NOW_S + 120)
    // Inside the wait, Telegram is not asked at all.
    const second = io()
    const r2 = await readBios(pool, OWNER, book(all), second.io)
    expect(second.rec.asked).toEqual([])
    expect(r2.bios_stopped).toMatch(/FLOOD_WAIT/)
    // After it, the walk resumes with the one that was not read.
    st.until = NOW_S - 1
    const third = io()
    await readBios(pool, OWNER, book(all), third.io)
    expect(third.rec.asked[0]).toBe(all[2])
    expect(floodSeconds(new Error('FLOOD_WAIT_42'))).toBe(42)
    expect(floodSeconds(new Error('USER_ID_INVALID'))).toBe(0)
  })

  it('a person Telegram will not describe keeps the bio read before', async () => {
    const { st, pool } = bioPool()
    const [a] = ids(1)
    st.people.set(a, { about: 'old bio', at: NOW_S - 40 * 86_400 })
    const { io: d } = io({ failAt: 1 })
    const r = await readBios(pool, OWNER, book([a]), d)
    expect(r.bios_read).toBe(1)
    expect(st.people.get(a)).toEqual({ about: 'old bio', at: NOW_S })
  })

  it('the never read come before the oldest read', async () => {
    const { st, pool } = bioPool()
    const old = ids(SPEC.BIOS_PER_RUN)
    for (const id of old)
      st.people.set(id, { about: 'x', at: NOW_S - 40 * 86_400 })
    const [fresh] = ids(1, 500)
    const d = io()
    await readBios(pool, OWNER, book([...old, fresh]), d.io)
    expect(d.rec.asked[0]).toBe(fresh)
    expect(d.rec.asked).toHaveLength(SPEC.BIOS_PER_RUN)
  })

  it('a bio read this month is not read again', async () => {
    const { st, pool } = bioPool()
    const [a, b] = ids(2)
    st.people.set(a, { about: 'x', at: NOW_S - 29 * 86_400 })
    st.people.set(b, { about: 'y', at: NOW_S - 30 * 86_400 })
    const d = io()
    await readBios(pool, OWNER, book([a, b]), d.io)
    expect(d.rec.asked).toEqual([b])
  })
})

// ---- spec v2: LinkedIn and X in his own browser -------------------------------------

const LI_ANNA = 'linkedin:anna-dev'
const X_GLEB = 'x:gleb_codes'
const X_ONLYFOLLOWED = 'x:followed_only'

const li = (handle: string, about: string): NetPerson => ({
  lead: `linkedin:${handle}`,
  network: 'linkedin',
  handle,
  name: handle,
  about,
  url: `https://www.linkedin.com/in/${handle}/`,
  connection: true,
  followsOwner: false,
})
const xp = (
  handle: string,
  about: string,
  followsOwner: boolean
): NetPerson => ({
  lead: `x:${handle.toLowerCase()}`,
  network: 'x',
  handle,
  name: handle,
  about,
  url: `https://x.com/${handle}`,
  connection: false,
  followsOwner,
})

const signedIn = (...ids: string[]): NetworkLogin[] =>
  ['linkedin', 'x'].map(id => ({
    id,
    name: id,
    state: ids.includes(id) ? 'signed_in' : 'signed_out',
  }))

function browser(
  o: {
    logins?: NetworkLogin[] | null
    driving?: boolean
    reads?: Partial<Record<'linkedin' | 'x', NetRead | Error>>
    sends?: Array<
      { done: true; receipt: boolean } | { done: false; why: string }
    >
    states?: string[]
  } = {}
) {
  const rec = {
    asked: [] as string[],
    opened: [] as string[],
    typed: [] as Array<{ network: string; url: string; text: string }>,
  }
  const states = o.states ?? ['allowed']
  setOutreachDepsForTests({
    ask: async (_c, what) => {
      rec.asked.push(what)
      return `card-${rec.asked.length}`
    },
    answer: async () => ({
      state: states.length > 1 ? states.shift()! : states[0],
      telegramId: OWNER,
    }),
    sleep: async () => {},
    send: async () => {
      throw new Error('a network card must not reach Telegram')
    },
    logins: async () =>
      o.logins === undefined ? signedIn('linkedin', 'x') : o.logins,
    driving: async () => o.driving ?? false,
    readNetwork: async (_c, network) => {
      rec.opened.push(network)
      const r = o.reads?.[network]
      if (r instanceof Error) throw r
      return r ?? { ok: true, people: [] }
    },
    sendNetwork: async (_c, network, person, text) => {
      rec.typed.push({ network, url: person.url, text })
      return (
        (o.sends ?? [{ done: true, receipt: true }]).shift() ?? {
          done: true,
          receipt: true,
        }
      )
    },
  })
  return rec
}

const goodReads = {
  linkedin: {
    ok: true,
    people: [
      li('anna-dev', 'Backend developer | Python | Kubernetes'),
      li('olga-hr', 'HR partner, hiring'),
      // cyrillic-ok-next-line
      li('vera-pm', 'Я не программист, продакт; python немного'),
    ],
  },
  x: {
    ok: true,
    people: [
      xp('gleb_codes', 'Rust and FPGA, commits daily', true),
      xp('followed_only', 'Go developer, golang tips', false),
      xp('cat_pics', 'cats', true),
    ],
  },
} satisfies Record<'linkedin' | 'x', NetRead>

const netDraft = (lead: string, why: string) =>
  // cyrillic-ok-next-line
  `Привет! Видел в профиле, что ты пишешь на ${why}. Я собрал курс: 27 уроков, в каждом 1 работающий виджет, потом лаборатория из 3. ${SPEC.COURSE_URL}`

describe('networks: the round in his browser', () => {
  it('not signed in: that network is not opened, and the answer says so', async () => {
    const { db, pool } = world()
    const rec = browser({ logins: signedIn('x'), reads: goodReads })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(rec.opened).toEqual(['x'])
    expect(r.networks.linkedin).toMatchObject({
      login: 'signed_out',
      opened: false,
      verdict: 'unknown',
    })
    expect(r.networks.linkedin.note).toMatch(/not signed in/)
    expect(db.net.some(p => p.network === 'linkedin')).toBe(false)
  })

  for (const state of ['expired', 'refused', 'unknown'] as const) {
    it(`${state}: not opened either`, async () => {
      const { pool } = world()
      const rec = browser({
        logins: [
          { id: 'linkedin', name: 'LinkedIn', state },
          { id: 'x', name: 'X', state },
        ],
        reads: goodReads,
      })
      await tool.handler({ step: 'networks' }, ctxOf(pool))
      expect(rec.opened).toEqual([])
    })
  }

  it('no browser to ask: nothing opened, both unknown', async () => {
    const { pool } = world()
    const rec = browser({ logins: null, reads: goodReads })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(rec.opened).toEqual([])
    expect(r.opened).toBe(false)
    expect(r.networks.x.verdict).toBe('unknown')
  })

  it('while he drives, the round opens nothing', async () => {
    const { pool } = world()
    const rec = browser({ driving: true, reads: goodReads })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(rec.opened).toEqual([])
    expect(r.stopped).toMatch(/driving/)
  })

  it('a page that did not read is unknown, not "no programmers"', async () => {
    const { db, pool } = world()
    browser({
      reads: {
        linkedin: { ok: false, why: 'the list did not read', people: [] },
        x: new Error('pod went away'),
      },
    })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(r.networks.linkedin.verdict).toBe('unknown')
    expect(r.networks.linkedin.why).toMatch(/did not read/)
    expect(r.networks.x.verdict).toBe('unknown')
    expect(db.net).toEqual([])
  })

  it('files programmers by THEIR headline or bio, tagged with the network', async () => {
    const { db, pool } = world()
    browser({ reads: goodReads })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(r.networks.linkedin.verdict).toBe('found')
    expect(r.networks.linkedin.programmers.map((p: any) => p.lead)).toEqual([
      LI_ANNA,
    ])
    expect(r.networks.linkedin.not).toBe(1)
    expect(r.networks.x.programmers.map((p: any) => p.lead).sort()).toEqual(
      [X_GLEB, X_ONLYFOLLOWED].sort()
    )
    const tags = db.tags.filter(t => t.lead.includes(':'))
    expect(tags.map(t => [t.lead, t.source]).sort()).toEqual(
      [
        [LI_ANNA, 'linkedin'],
        [X_GLEB, 'x'],
        [X_ONLYFOLLOWED, 'x'],
      ].sort()
    )
    expect(JSON.parse(tags[0].evidence).quotes[0].source).toMatch(
      /headline|bio/
    )
    // Only programmers are kept, with where a message can go.
    expect(db.net.map(p => [p.lead, p.channel]).sort()).toEqual(
      [
        [LI_ANNA, 'linkedin'],
        [X_GLEB, 'x'],
        [X_ONLYFOLLOWED, 'none'],
      ].sort()
    )
    const followed = r.networks.x.programmers.find(
      (p: any) => p.lead === X_ONLYFOLLOWED
    )
    expect(followed.may_draft).toBe('no-channel')
    // A second round adds nobody twice.
    browser({ reads: goodReads })
    await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(db.net).toHaveLength(3)
    expect(db.tags.filter(t => t.lead.includes(':'))).toHaveLength(3)
  })

  it('a list that read nobody is unknown, and one with no programmers is none', async () => {
    const { pool } = world()
    browser({
      reads: {
        linkedin: { ok: true, people: [] },
        x: { ok: true, people: [xp('cat_pics', 'cats', true)] },
      },
    })
    const r: any = await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(r.networks.linkedin.verdict).toBe('unknown')
    expect(r.networks.x.verdict).toBe('none')
  })

  it('a person he removed is not filed again', async () => {
    const { db, pool } = world()
    db.dropped.push({ owner: OWNER, lead: LI_ANNA })
    browser({ reads: goodReads })
    await tool.handler({ step: 'networks' }, ctxOf(pool))
    expect(db.net.some(p => p.lead === LI_ANNA)).toBe(false)
    expect(db.tags.some(t => t.lead === LI_ANNA)).toBe(false)
  })

  it('the readers keep only plausible handles and merge both X lists', () => {
    const got = peopleOf('x', [
      { handle: 'ok_name', name: 'A', about: 'rust' },
      { handle: 'has space', name: 'B', about: 'x' },
      { handle: 'x'.repeat(16), name: 'C', about: 'x' },
      null,
    ])
    expect(got.map(p => p.lead)).toEqual(['x:ok_name'])
    expect(got[0].followsOwner).toBe(false)
    const followers = peopleOf('x', [{ handle: 'ok_name', about: '' }], true)
    expect(merged([got, followers])[0]).toMatchObject({
      followsOwner: true,
      about: 'rust',
    })
    expect(peopleOf('linkedin', 'not a list')).toEqual([])
    expect(peopleOf('linkedin', [{ handle: 'anna-dev' }])[0].url).toBe(
      'https://www.linkedin.com/in/anna-dev/'
    )
  })
})

describe('networks: one message, one card, one press', () => {
  const ready = async () => {
    const w = world()
    browser({ reads: goodReads })
    await tool.handler({ step: 'networks' }, ctxOf(w.pool))
    return w
  }

  it('two drafts are not one card, and no card is made', async () => {
    const w = await ready()
    const rec = browser()
    const r: any = await tool.handler(
      {
        step: 'draft',
        network: 'x',
        drafts: [
          { lead: X_GLEB, text: netDraft(X_GLEB, 'Rust') },
          { lead: LI_ANNA, text: netDraft(LI_ANNA, 'Python') },
        ],
      },
      ctxOf(w.pool)
    )
    expect(r.refused).toMatch(/one card per message/)
    expect(rec.asked).toEqual([])
  })

  it('one draft makes its own card with the text in full; nothing is typed', async () => {
    const w = await ready()
    const rec = browser()
    const r: any = await tool.handler(
      {
        step: 'draft',
        network: 'linkedin',
        drafts: [{ lead: LI_ANNA, text: netDraft(LI_ANNA, 'Python') }],
      },
      ctxOf(w.pool)
    )
    expect(r.on_card).toEqual([LI_ANNA])
    expect(rec.asked).toHaveLength(1)
    expect(rec.asked[0]).toContain(netDraft(LI_ANNA, 'Python'))
    expect(rec.asked[0]).toContain('https://www.linkedin.com/in/anna-dev/')
    expect(rec.asked[0]).toContain('LinkedIn')
    expect(rec.typed).toEqual([])
  })

  it('the same draft checks as Telegram, and the channel and network rules', async () => {
    const w = await ready()
    const rec = browser()
    const check = async (network: string, lead: string, text: string) =>
      (
        (await tool.handler(
          { step: 'draft', network, drafts: [{ lead, text }] },
          ctxOf(w.pool)
        )) as any
      ).refused?.[lead]
    expect(
      await check(
        'x',
        X_GLEB,
        netDraft(X_GLEB, 'Rust').replace(
          SPEC.COURSE_URL,
          'https://t27.ai/#/course'
        )
      )
    ).toBe('hash-link')
    expect(
      await check('x', X_GLEB, netDraft(X_GLEB, 'Rust').replace('27', '40'))
    ).toBe('number')
    expect(
      await check('x', X_GLEB, 'The best course! ' + netDraft(X_GLEB, 'Rust'))
    ).toBe('hype')
    // Gleb wrote Rust and FPGA, not Python: not about him.
    expect(await check('x', X_GLEB, netDraft(X_GLEB, 'Python'))).toBe(
      'not-personal'
    )
    // Followed by him, not following him: no way to write.
    expect(
      await check('x', X_ONLYFOLLOWED, netDraft(X_ONLYFOLLOWED, 'Go'))
    ).toBe('no-channel')
    // A LinkedIn person on an X card, and a Telegram id on one.
    expect(await check('x', LI_ANNA, netDraft(LI_ANNA, 'Python'))).toMatch(
      /not a x person/
    )
    expect(await check('linkedin', ANNA, draftFor(ANNA, 'Verilog'))).toMatch(
      /not a linkedin person/
    )
    // Somebody the round never filed.
    expect(await check('x', 'x:stranger', netDraft('x:stranger', 'Rust'))).toBe(
      'not-programmer'
    )
    w.db.optOuts.push({ owner: OWNER, client: X_GLEB })
    expect(await check('x', X_GLEB, netDraft(X_GLEB, 'Rust'))).toBe('opted-out')
    expect(rec.asked).toEqual([])
  })

  for (const answer of ['denied', 'expired']) {
    it(`${answer}: nothing is typed in his browser`, async () => {
      const w = await ready()
      const rec = browser({ states: [answer] })
      const { approval } = (await tool.handler(
        {
          step: 'draft',
          network: 'x',
          drafts: [{ lead: X_GLEB, text: netDraft(X_GLEB, 'Rust') }],
        },
        ctxOf(w.pool)
      )) as any
      const r: any = await tool.handler(
        { step: 'send', approval },
        ctxOf(w.pool)
      )
      expect(r.sent).toBe(false)
      expect(rec.typed).toEqual([])
      expect(w.db.outreach).toEqual([])
    })
  }

  it('Allow types exactly the card text once, and no second message there', async () => {
    const w = await ready()
    const rec = browser()
    // A line break would press Enter in a chat box: one line, shown as such.
    const text = netDraft(X_GLEB, 'Rust').replace('! ', '!\n')
    const { approval } = (await tool.handler(
      { step: 'draft', network: 'x', drafts: [{ lead: X_GLEB, text }] },
      ctxOf(w.pool)
    )) as any
    const oneLineText = text.replace('!\n', '! ')
    expect(rec.asked[0]).toContain(oneLineText)
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.results).toEqual({ [X_GLEB]: 'sent' })
    expect(rec.typed).toEqual([
      { network: 'x', url: 'https://x.com/gleb_codes', text: oneLineText },
    ])
    expect(w.db.outreach.map(o => o.lead)).toEqual([X_GLEB])
    // The card is spent.
    const again: any = await tool.handler(
      { step: 'send', approval },
      ctxOf(w.pool)
    )
    expect(again.sent).toBe(false)
    expect(rec.typed).toHaveLength(1)
    // ... and no second message there: no reply is read, so none is known.
    const r2: any = await tool.handler(
      {
        step: 'draft',
        network: 'x',
        drafts: [{ lead: X_GLEB, text: netDraft(X_GLEB, 'Rust') }],
      },
      ctxOf(w.pool)
    )
    expect(r2.refused[X_GLEB]).toBe('pitched-no-reply')
    expect(rec.asked).toHaveLength(1)
  })

  it('signed out by the press: nothing typed, nothing recorded', async () => {
    const w = await ready()
    const rec = browser({ logins: signedIn('linkedin') })
    const { approval } = (await tool.handler(
      {
        step: 'draft',
        network: 'x',
        drafts: [{ lead: X_GLEB, text: netDraft(X_GLEB, 'Rust') }],
      },
      ctxOf(w.pool)
    )) as any
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.results[X_GLEB]).toMatch(/not signed in/)
    expect(rec.typed).toEqual([])
    expect(w.db.outreach).toEqual([])
  })

  it('a stop after the card still wins at the press', async () => {
    const w = await ready()
    const rec = browser()
    const { approval } = (await tool.handler(
      {
        step: 'draft',
        network: 'linkedin',
        drafts: [{ lead: LI_ANNA, text: netDraft(LI_ANNA, 'Python') }],
      },
      ctxOf(w.pool)
    )) as any
    w.db.optOuts.push({ owner: OWNER, client: LI_ANNA })
    const r: any = await tool.handler({ step: 'send', approval }, ctxOf(w.pool))
    expect(r.results[LI_ANNA]).toBe('not sent: opted-out')
    expect(rec.typed).toEqual([])
  })

  it('a missing control is "not sent"; a press with no receipt says so', async () => {
    const w = await ready()
    browser({ sends: [{ done: false, why: 'not found: message' }] })
    const draftOne = async () =>
      (
        (await tool.handler(
          {
            step: 'draft',
            network: 'linkedin',
            drafts: [{ lead: LI_ANNA, text: netDraft(LI_ANNA, 'Python') }],
          },
          ctxOf(w.pool)
        )) as any
      ).approval
    const r: any = await tool.handler(
      { step: 'send', approval: await draftOne() },
      ctxOf(w.pool)
    )
    expect(r.results[LI_ANNA]).toBe('not sent: not found: message')
    expect(w.db.outreach).toEqual([])
    browser({ sends: [{ done: true, receipt: false }] })
    const r2: any = await tool.handler(
      { step: 'send', approval: await draftOne() },
      ctxOf(w.pool)
    )
    expect(r2.results[LI_ANNA]).toMatch(/^sent \(Send was pressed/)
    // Pressed is pressed: recorded, so it is never sent twice.
    expect(w.db.outreach.map(o => o.lead)).toEqual([LI_ANNA])
  })

  it('the card names the network, the person and the one message', () => {
    const card = netCardText('x', {
      lead: X_GLEB,
      label: 'Gleb @gleb_codes',
      text: 'hello',
      url: 'https://x.com/gleb_codes',
    })
    expect(card).toContain(' X')
    expect(card).toContain('@gleb_codes')
    expect(card).toContain('https://x.com/gleb_codes')
    expect(card).toContain('hello')
    expect(card.length).toBeLessThanOrEqual(CARD_MAX)
  })
})
