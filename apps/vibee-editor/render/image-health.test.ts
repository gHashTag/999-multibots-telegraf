import { describe, it, expect, beforeEach } from 'vitest'
import {
  noteImagesFailed,
  noteImagesWorked,
  imagesLookDown,
  looksLikeProviderOutage,
  forgetImageHealthForTests,
} from './src/agent/image-health'
import { salesPlaybook } from './src/agent/crm-playbook'
import {
  leadCandidates,
  forgetMemoryTableForTests,
} from './src/agent/chat-memory'

// The render config supplies none; leadCandidates reads it at module load.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'

/**
 * A PROMISE THE PLATFORM CANNOT KEEP, MADE TO A REAL CLIENT.
 *
 * Measured in production 2026-09-16: providers_status answered
 * FAL -- the pictures -- answered HTTP 403 Exhausted balance, while point 4
 * of the playbook told the model, unconditionally, to give every contact a
 * portrait drawn from their own avatar.
 *
 * The evidence is a REAL attempt, not a probe: the FAL health check in
 * render-server POSTs an actual job to the queue, so asking "can we draw"
 * costs a drawing.
 */
const now = 1_000_000_000

describe('what counts as the picture provider being down', () => {
  beforeEach(() => forgetImageHealthForTests())

  it('the refusals that blame the provider', () => {
    for (const why of [
      'HTTP 403 {"detail":"User is locked. Reason: Exhausted balance."}',
      'HTTP 401 unauthorized',
      'insufficient balance',
      'rate limit exceeded',
      'превышен лимит запросов', // cyrillic-ok
      'FAL_KEY не задан', // cyrillic-ok
    ]) {
      expect(looksLikeProviderOutage(why), why).toBe(true)
    }
  })

  it('and the ones that blame THIS request, which must not silence the gift', () => {
    // One odd photo must not stop the lead magnet for everybody else.
    for (const why of [
      'картинка не получилась', // cyrillic-ok
      'фото человека не читается', // cyrillic-ok
      'prompt was rejected by the safety filter',
      '',
    ]) {
      expect(looksLikeProviderOutage(why), why).toBe(false)
    }
  })

  it('nothing seen yet is not evidence of trouble', () => {
    expect(imagesLookDown(now)).toBeNull()
  })

  it('a provider refusal is remembered, with how long ago', () => {
    noteImagesFailed('HTTP 403 Exhausted balance', now)
    const down = imagesLookDown(now + 5 * 60_000)
    expect(down?.why).toContain('403')
    expect(down?.minutesAgo).toBe(5)
  })

  it('a failure that blames THIS request does not silence the gift', () => {
    /*
     * Proven necessary by mutation: with only looksLikeProviderOutage tested
     * directly, deleting the check inside noteImagesFailed left every test
     * green -- and then one unreadable avatar would withdraw the lead magnet
     * from everybody for half an hour.
     */
    noteImagesFailed('картинка не получилась', now) // cyrillic-ok
    expect(imagesLookDown(now)).toBeNull()
  })

  it('a picture that came back clears it immediately', () => {
    noteImagesFailed('HTTP 403 Exhausted balance', now)
    noteImagesWorked()
    expect(imagesLookDown(now)).toBeNull()
  })

  it('and it is forgotten by itself, so a top-up needs no deploy', () => {
    noteImagesFailed('HTTP 403 Exhausted balance', now)
    expect(imagesLookDown(now + 31 * 60_000)).toBeNull()
  })
})

describe('the playbook does not promise what cannot be made', () => {
  const seller = { seller: true, telegramId: '144022504' }

  it('offers the lead magnet when there is no reason to doubt', () => {
    const p = salesPlaybook(seller)
    expect(p).toContain('ЛИД-МАГНИТ')
    expect(p).toContain('crm_deliver_photo')
  })

  it('withdraws it, names the reason, and offers words instead', () => {
    const p = salesPlaybook({
      ...seller,
      giftIsDown: 'HTTP 403 Exhausted balance',
    })
    expect(p).toContain('ПОДАРОК СЕЙЧАС НЕВОЗМОЖЕН')
    expect(p).toContain('403')
    expect(p, 'the model must not be told to call it anyway').not.toContain(
      'сделай подарок из ЕГО ЖЕ аватарки'
    )
    expect(
      p,
      'a withdrawal without an alternative is just a smaller seller'
    ).toContain('план')
  })

  it('a stranger still gets no playbook at all', () => {
    expect(salesPlaybook({ seller: false, giftIsDown: 'HTTP 403' })).toBe('')
  })
})

/*
 * THE PLAN MUST NOT NAME A STEP THE PLATFORM CANNOT TAKE.
 *
 * Measured in production 2026-09-16: FAL answers 403, its balance spent, and
 * of the five candidates the sweep actually looks at, FOUR carried
 * next='deliver'. The brief takes the first one that is not `wait`, so the
 * seller spent its turns preparing a picture nothing could draw.
 *
 * The owner already ruled on this shape once, 2026-09-15, for the other half
 * of it -- a portrait proposed to somebody with no picture in Telegram.
 * Refusing at the tool is too late: by then the plan has promised it.
 */
describe('a delivery needs something to deliver with', () => {
  const OWNER = '144022504'
  const now = new Date('2026-09-16T12:00:00Z')
  // service + price is the combination that sets next='deliver'.
  const WANTS = 'нужна услуга, сколько стоит фото?'
  const pool = {
    query: async (sql: string) => {
      const flat = sql.replace(/\s+/g, ' ')
      if (/GROUP BY lead_id/.test(flat))
        return {
          rows: [
            {
              lead_id: '900000071',
              total: 6,
              inbound: 3,
              last_in: '2026-09-16T09:00:00Z',
              last_out: '2026-09-16T10:00:00Z',
            },
          ],
        }
      if (/^SELECT lead_id, text FROM crm_messages/.test(flat))
        return { rows: [{ lead_id: '900000071', text: WANTS }] }
      return { rows: [] }
    },
  }

  beforeEach(() => forgetMemoryTableForTests())

  it('with the pictures working, the step is still deliver', async () => {
    const [l] = await leadCandidates(pool as never, OWNER, { now })
    expect(l.next).toBe('deliver')
  })

  it('with the pictures down, the step is an offer -- their price ask is still answerable', async () => {
    const [l] = await leadCandidates(pool as never, OWNER, {
      now,
      imagesDown: { why: 'HTTP 403 Exhausted balance', minutesAgo: 4 },
    })
    expect(l.next).toBe('offer')
  })

  it('and the reason travels with it, so the owner sees WHY the plan changed', async () => {
    const [l] = await leadCandidates(pool as never, OWNER, {
      now,
      imagesDown: { why: 'HTTP 403 Exhausted balance', minutesAgo: 4 },
    })
    expect(l.because).toContain('403')
    expect(l.because).toContain('4')
  })

  it('a verdict that has expired is no verdict: null does not withdraw anything', async () => {
    const [l] = await leadCandidates(pool as never, OWNER, {
      now,
      imagesDown: null,
    })
    expect(l.next).toBe('deliver')
  })
})
