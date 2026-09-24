import { afterEach, describe, expect, it } from 'vitest'
import {
  MailError,
  ZohoMail,
  approvalText,
  boundedLimit,
  draftFrom,
  missingCredentials,
  normaliseSearch,
  stripHtml,
  summary,
  zohoEnv,
} from './mail-zoho'
import {
  MAIL_TOOLS,
  setMailDepsForTests,
  setMailboxForTests,
  type MailDeps,
} from './mail-tools'
import { OWNER_TELEGRAM_ID } from './telegram-tools'

/*
 * THE OWNER'S MAILBOX. Addresses are invented (example.test); no real
 * person's mail belongs in a repository.
 */

describe('search keys Zoho actually honours', () => {
  it('wraps a bare word, because Zoho rejects an unwrapped term', () => {
    expect(normaliseSearch('recruiter')).toBe('entire:recruiter')
  })

  it('strips the dead contains: operator (it matched nothing, ever)', () => {
    expect(normaliseSearch('entire:contains:hh.ru')).toBe('entire:hh.ru')
    expect(normaliseSearch('content:CONTAINS:offer')).toBe('content:offer')
  })

  it('REFUSES an unknown field: Zoho would return everything unfiltered', () => {
    expect(() => normaliseSearch('from:hh.ru')).toThrow(MailError)
    expect(() => normaliseSearch('from:contains:arxiv')).toThrow(/unfiltered/)
    expect(() => normaliseSearch('   ')).toThrow(MailError)
  })
})

describe('reading', () => {
  it('turns html into text without scripts', () => {
    expect(
      stripHtml('<p>Hi&nbsp;there</p><script>x()</script><br>&#1055;&amp;')
    ).toBe('Hi there\n \nП&')
  })

  it('bounds the limit', () => {
    expect(boundedLimit(undefined)).toBe(25)
    expect(boundedLimit(0)).toBe(25)
    expect(boundedLimit(5000)).toBe(200)
    expect(boundedLimit(7)).toBe(7)
  })

  it('summarises on the true epoch and says it is UTC', () => {
    const s = summary({
      messageId: '1',
      receivedTime: String(Date.UTC(2026, 8, 24, 5, 7)),
      fromAddress: 'a@example.test',
      status2: '0',
      hasAttachment: '1',
    })
    expect(s.received).toBe('2026-09-24 05:07 UTC')
    expect(s.unread).toBe(true)
    expect(s.hasAttachment).toBe(true)
  })
})

describe('credentials', () => {
  it('names what is missing and never echoes a value', () => {
    const e = zohoEnv({ ZOHO_CLIENT_ID: 'id-value' } as any)
    expect(missingCredentials(e)).toEqual([
      'ZOHO_CLIENT_SECRET',
      'ZOHO_REFRESH_TOKEN',
    ])
    expect(e.region).toBe('com')
  })

  it('refuses to call Zoho without them', async () => {
    const box = new ZohoMail(zohoEnv({} as any), (() => {
      throw new Error('must not reach the network')
    }) as any)
    await expect(box.accessToken()).rejects.toThrow(/not configured/)
  })
})

describe('a letter is checked before anybody is asked', () => {
  it('refuses a malformed address instead of guessing', () => {
    expect(() =>
      draftFrom({ to: 'someone at example', subject: 's', body: 'b' })
    ).toThrow(/not an address/)
    expect(() => draftFrom({ to: 'a@example.test', body: 'b' })).toThrow(
      /subject/
    )
  })

  it('puts the whole letter on the card, clipped and saying so', () => {
    const text = approvalText(
      { to: 'a@example.test', subject: 'Hello', body: 'x'.repeat(700) },
      'me@example.test'
    )
    expect(text).toContain('To: a@example.test')
    expect(text).toContain('Subject: Hello')
    expect(text).toContain('(+100 chars)')
  })
})

/* ---- the send: prepared by the model, released only by the owner's tap ---- */

const OWNER = OWNER_TELEGRAM_ID
const send = MAIL_TOOLS.find(t => t.name === 'mail_send')!

function fakeBox(sent: unknown[]) {
  const box = new ZohoMail(
    zohoEnv({
      ZOHO_CLIENT_ID: 'i',
      ZOHO_CLIENT_SECRET: 's',
      ZOHO_REFRESH_TOKEN: 'r',
    } as any),
    (async (url: string, init?: any) => {
      if (url.includes('/oauth/v2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 't',
            expires_in: 3600,
            scope: 'ZohoMail.messages.READ ZohoMail.messages.CREATE',
          })
        )
      }
      if (url.endsWith('/api/accounts')) {
        return new Response(
          JSON.stringify({
            data: [{ accountId: '77', primaryEmailAddress: 'me@example.test' }],
          })
        )
      }
      sent.push({ url, body: JSON.parse(init.body) })
      return new Response(JSON.stringify({ data: { messageId: '999' } }))
    }) as any
  )
  return box
}

function deps(
  states: string[],
  answeredBy = OWNER
): MailDeps & {
  asked: string[]
} {
  const asked: string[] = []
  return {
    asked,
    async ask(_ctx, what) {
      asked.push(what)
      return 'card-1'
    },
    async answer() {
      return { state: states.shift() ?? 'pending', telegramId: answeredBy }
    },
    async sleep() {},
  }
}

const ctx = (id = OWNER) => ({ telegramId: id, pool: {} as any })

afterEach(() => {
  setMailboxForTests(null)
  setMailDepsForTests(null)
})

describe('mail_send', () => {
  const letter = { to: 'a@example.test', subject: 'Offer', body: 'Thanks!' }

  it("is the OWNER's alone: anybody else is refused before anything", async () => {
    await expect(send.handler(letter, ctx('123'))).rejects.toThrow()
  })

  it('first call only asks; nothing leaves', async () => {
    const sent: unknown[] = []
    setMailboxForTests(fakeBox(sent))
    const d = deps([])
    setMailDepsForTests(d)
    const r: any = await send.handler(letter, ctx())
    expect(r.sent).toBe(false)
    expect(r.approval).toBe('card-1')
    expect(d.asked[0]).toContain('Subject: Offer')
    expect(sent).toEqual([])
  })

  it('sends EXACTLY the prepared letter after the tap, once', async () => {
    const sent: any[] = []
    setMailboxForTests(fakeBox(sent))
    setMailDepsForTests(deps(['pending', 'allowed']))
    await send.handler(letter, ctx())
    // A second call cannot change the words: only the card id is read.
    const r: any = await send.handler(
      { approval: 'card-1', to: 'evil@example.test' } as any,
      ctx()
    )
    expect(r.sent).toBe(true)
    expect(sent).toHaveLength(1)
    expect(sent[0].body.toAddress).toBe('a@example.test')
    expect(sent[0].body.content).toBe('Thanks!')
    const again: any = await send.handler({ approval: 'card-1' }, ctx())
    expect(again.sent).toBe(false)
    expect(sent).toHaveLength(1)
  })

  it('a denied or unanswered card sends nothing', async () => {
    const sent: unknown[] = []
    setMailboxForTests(fakeBox(sent))
    setMailDepsForTests(deps(['denied']))
    await send.handler(letter, ctx())
    const r: any = await send.handler({ approval: 'card-1' }, ctx())
    expect(r.sent).toBe(false)
    expect(sent).toEqual([])
  })

  it('a card answered by somebody else sends nothing', async () => {
    const sent: unknown[] = []
    setMailboxForTests(fakeBox(sent))
    setMailDepsForTests(deps(['allowed'], '555'))
    await send.handler(letter, ctx())
    const r: any = await send.handler({ approval: 'card-1' }, ctx())
    expect(r.sent).toBe(false)
    expect(sent).toEqual([])
  })
})
