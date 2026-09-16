import { describe, it, expect, vi, beforeEach } from 'vitest'

/*
 * A GIFT MAY REACH SOMEBODY WITH NO WALLET. THAT IS THE POINT OF IT.
 *
 * resolveLead takes a bare number only for a person already in `users`, and
 * its reason is exact: an invoice credits whatever id is in it, so a mistyped
 * number sends the lead's Stars to a stranger. The same comment names the way
 * out -- "somebody not in the base is named by @username, which Telegram
 * resolves for real".
 *
 * The sweep cannot take that way out: crm_leads hands the model a NUMERIC
 * lead, so the gift was refused for exactly the people it exists for.
 * Production, 2026-09-15, the seller's own words in the hive journal:
 * "deliver is not possible for him -- crm_deliver_photo refused (not in the
 * base, name him by @username)".
 *
 * Ids are synthetic (9000000xx).
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost'

const OWNER = '144022504'
const STRANGER = '900000101'
const KNOWN = '900000102'

const resolveLead = vi.fn()
const personOf = vi.fn()

vi.mock('./src/agent/crm-offer-tool', async orig => ({
  ...((await orig()) as object),
  resolveLead: (...a: unknown[]) => resolveLead(...a),
}))
vi.mock('./src/agent/chat-memory', async orig => ({
  ...((await orig()) as object),
  personOf: (...a: unknown[]) => personOf(...a),
}))

const NOT_IN_BASE = () => {
  throw new Error('человека с id нет в вашей базе — назовите его по @username')
}

async function tool() {
  const { makeCrmDeliverTools } = await import('./src/agent/crm-deliver-tool')
  const tools = makeCrmDeliverTools(() => undefined)
  const t = tools.find(x => x.name === 'crm_deliver_photo')
  expect(t, 'crm_deliver_photo must exist').toBeTruthy()
  return t!
}

const ctx = () =>
  ({ telegramId: OWNER, pool: {}, turn: 't', surface: 'bot' }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('a gift for somebody who is not in the wallet base', () => {
  it('falls back to the @username our own CRM knows', async () => {
    resolveLead
      .mockImplementationOnce(NOT_IN_BASE)
      .mockResolvedValueOnce({ id: STRANGER, display: null, firstName: null })
    personOf.mockResolvedValue({ username: 'stranger_one' })
    const t = await tool()
    // The handler runs on past this point into the real balance and provider
    // code, which is not what these cases are about: the question is only
    // WHICH address was resolved and who was asked for it.
    await t
      .handler({ chat: STRANGER, prompt: 'портрет' }, ctx())
      .catch(() => undefined)
    expect(personOf, 'the CRM was never asked who this is').toHaveBeenCalled()
    expect(
      resolveLead.mock.calls[1]?.[1],
      'the retry must go through Telegram, by name'
    ).toBe('@stranger_one')
  })

  it('the lookup is scoped to the asking owner', async () => {
    resolveLead
      .mockImplementationOnce(NOT_IN_BASE)
      .mockResolvedValueOnce({ id: STRANGER, display: null, firstName: null })
    personOf.mockResolvedValue({ username: 'stranger_one' })
    const t = await tool()
    // The handler runs on past this point into the real balance and provider
    // code, which is not what these cases are about: the question is only
    // WHICH address was resolved and who was asked for it.
    await t
      .handler({ chat: STRANGER, prompt: 'портрет' }, ctx())
      .catch(() => undefined)
    expect(personOf.mock.calls[0]?.[1]).toBe(OWNER)
    expect(personOf.mock.calls[0]?.[2]).toBe(STRANGER)
  })

  it('a PAID delivery keeps the gate: no fallback, the refusal stands', async () => {
    // Without this the assertion lives inside .catch() and a missing throw
    // simply skips it -- a test that cannot fail. A reverse mutation
    // (`if (!handle) throw e` made into a no-op) survived exactly that way.
    // +1 for the `expect(t)` inside tool()
    expect.assertions(3)
    resolveLead.mockImplementation(NOT_IN_BASE)
    personOf.mockResolvedValue({ username: 'stranger_one' })
    const t = await tool()
    await t
      .handler({ chat: STRANGER, prompt: 'портрет', gift: false }, ctx())
      .catch((e: unknown) => {
        // cyrillic-ok: the refusal text resolveLead actually returns
        expect(String(e)).toMatch(/нет в вашей базе/) // cyrillic-ok
      })
    expect(
      personOf,
      'the paid path must not widen who can be addressed'
    ).not.toHaveBeenCalled()
  })

  it('nobody we know: the original refusal is what the seller reads', async () => {
    // +1 for the `expect(t)` inside tool(), +1 for the call count below
    expect.assertions(3)
    resolveLead.mockImplementation(NOT_IN_BASE)
    personOf.mockResolvedValue(null)
    const t = await tool()
    await t
      .handler({ chat: STRANGER, prompt: 'портрет' }, ctx())
      .catch((e: unknown) => {
        // cyrillic-ok: the refusal text resolveLead actually returns
        expect(String(e)).toMatch(/нет в вашей базе/) // cyrillic-ok
      })
    /*
     * AND NO SECOND ATTEMPT. Without this the guard cannot fall: a mutation
     * that drops the `throw` lets the code reach resolveLead('@') with an
     * empty name, which the double refuses identically -- so the error text
     * alone proves nothing. The count is what separates "we stopped" from
     * "we went fishing with no name and were refused again".
     */
    expect(resolveLead).toHaveBeenCalledTimes(1)
  })

  it('a @username target is untouched: one resolve, no lookup', async () => {
    resolveLead.mockResolvedValue({
      id: KNOWN,
      display: null,
      firstName: null,
    })
    const t = await tool()
    await t
      .handler({ chat: '@already_named', prompt: 'портрет' }, ctx())
      .catch(() => undefined)
    expect(resolveLead).toHaveBeenCalledTimes(1)
    expect(personOf).not.toHaveBeenCalled()
  })

  it('a person already in the base never reaches the fallback', async () => {
    resolveLead.mockResolvedValue({
      id: KNOWN,
      display: null,
      firstName: null,
    })
    const t = await tool()
    await t
      .handler({ chat: KNOWN, prompt: 'портрет' }, ctx())
      .catch(() => undefined)
    expect(resolveLead).toHaveBeenCalledTimes(1)
    expect(personOf).not.toHaveBeenCalled()
  })
})
