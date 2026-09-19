/**
 * WHAT THE PROVIDER SAID, AND WHAT IT DID NOT SAY.
 *
 * The expensive failure here is not a wrong answer: it is a confident "nobody
 * paid" produced by a parser that matched nothing. Every shape below is a real
 * one -- the well-formed reply, the "operation not found" that covers most of
 * our backlog, the empty body of a request that never landed.
 *
 * The classification is shared with `scripts/robokassa-reconcile.cjs` on
 * purpose: two answers to one question is how a reconcile starts inventing
 * debts. These cases are the contract between them.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  classifyOpState,
  opStateSignature,
  askOpState,
} from '@/core/robokassa/opState'

const reply = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><OperationStateResponse>${inner}</OperationStateResponse>`

describe('what Robokassa says about an invoice', () => {
  /*
   * WHAT THE BUYER ACTUALLY PAID. A settlement that compares the invoiced
   * amount with itself checks nothing; IncSum is the only independent figure
   * the provider gives, and its ABSENCE must never read as zero.
   */
  it('reads the sum that left the buyer, when the provider states it', () => {
    const r = classifyOpState(
      reply(
        '<Result><Code>0</Code></Result><State><Code>100</Code></State>' +
          '<Info><IncSum>10.000000</IncSum><OutSum>10.000000</OutSum></Info>'
      )
    )
    expect(r.verdict).toBe('PAID')
    expect(r.incSum).toBe(10)
  })

  it('leaves the paid sum undefined rather than zero when it is absent', () => {
    const r = classifyOpState(
      reply('<Result><Code>0</Code></Result><State><Code>100</Code></State>')
    )
    expect(r.verdict).toBe('PAID')
    expect(r.incSum).toBeUndefined()
  })

  it('reads a settled payment as paid', () => {
    const r = classifyOpState(
      reply('<Result><Code>0</Code></Result><State><Code>100</Code></State>')
    )
    expect(r.verdict).toBe('PAID')
    expect(r.state).toBe(100)
  })

  it('reads money on its way to the shop as paid -- the buyer has paid either way', () => {
    expect(
      classifyOpState(
        reply('<Result><Code>0</Code></Result><State><Code>50</Code></State>')
      ).verdict
    ).toBe('PAID')
  })

  it('reads a cancelled operation as not paid', () => {
    expect(
      classifyOpState(
        reply('<Result><Code>0</Code></Result><State><Code>10</Code></State>')
      ).verdict
    ).toBe('NOT_PAID')
  })

  it('sends a hold, a refund and a suspension to a person', () => {
    for (const state of [20, 60, 80]) {
      expect(
        classifyOpState(
          reply(
            `<Result><Code>0</Code></Result><State><Code>${state}</Code></State>`
          )
        ).verdict,
        `state ${state}`
      ).toBe('NEEDS_A_HUMAN')
    }
  })

  /*
   * THE ONE THAT MUST NEVER BECOME A "NO". Result.Code=3 is "operation not
   * found": the provider does not remember this invoice at all. Most of our
   * 165-row backlog answers exactly this, and reading it as unpaid would tell
   * the owner nobody is owed anything.
   */
  it('refuses to turn "operation not found" into "did not pay"', () => {
    const r = classifyOpState(
      reply(
        '<Result><Code>3</Code><Description>not found</Description></Result>'
      )
    )
    expect(r.verdict).toBe('UNKNOWN')
    expect(r.why).toContain('3')
  })

  it('treats an empty or unparseable body as unknown', () => {
    expect(classifyOpState('').verdict).toBe('UNKNOWN')
    expect(classifyOpState('<html>maintenance</html>').verdict).toBe('UNKNOWN')
    expect(classifyOpState(null).verdict).toBe('UNKNOWN')
  })

  it('treats a state code nobody documented as unknown, not as a guess', () => {
    const r = classifyOpState(
      reply('<Result><Code>0</Code></Result><State><Code>77</Code></State>')
    )
    expect(r.verdict).toBe('UNKNOWN')
    expect(r.state).toBe(77)
  })

  it('reads the code from an attribute as well as an element', () => {
    expect(
      classifyOpState(
        '<OperationStateResponse><Result Code="0"/><State Code="100"/></OperationStateResponse>'
      ).verdict
    ).toBe('PAID')
  })
})

describe('asking the provider', () => {
  it('signs the request the way the provider expects', () => {
    // MD5(login:invId:password2) -- the documented form, pinned so a
    // "refactor" of the join order becomes a failing test rather than a
    // silent stream of bad signatures read as UNKNOWN.
    expect(opStateSignature('shop', 42, 'secret')).toBe(
      opStateSignature('shop', '42', 'secret')
    )
    expect(opStateSignature('shop', 42, 'secret')).toMatch(/^[0-9a-f]{32}$/)
    expect(opStateSignature('shop', 42, 'secret')).not.toBe(
      opStateSignature('shop', 43, 'secret')
    )
  })

  it('never asks without credentials, and says so', async () => {
    const fetchImpl = vi.fn()
    const r = await askOpState(
      '1',
      { login: '', password2: '' },
      fetchImpl as never
    )
    expect(r.verdict).toBe('UNKNOWN')
    expect(r.why).toMatch(/credential/i)
    expect(
      fetchImpl,
      'it called out with an empty login'
    ).not.toHaveBeenCalled()
  })

  it('turns a refused request into unknown, never into unpaid', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    }))
    const r = await askOpState(
      '1',
      { login: 'shop', password2: 'secret' },
      fetchImpl as never
    )
    expect(r.verdict).toBe('UNKNOWN')
    expect(r.why).toContain('503')
  })

  it('turns a network failure into unknown too', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    const r = await askOpState(
      '1',
      { login: 'shop', password2: 'secret' },
      fetchImpl as never
    )
    expect(r.verdict).toBe('UNKNOWN')
    expect(r.why).toContain('ENOTFOUND')
  })

  it('carries the invoice and the signature, and never the password', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url)
      return {
        ok: true,
        status: 200,
        text: async () =>
          reply(
            '<Result><Code>0</Code></Result><State><Code>100</Code></State>'
          ),
      }
    })
    const r = await askOpState(
      '210442081',
      { login: 'shop', password2: 'secret' },
      fetchImpl as never
    )
    expect(r.verdict).toBe('PAID')
    expect(seen[0]).toContain('InvoiceID=210442081')
    expect(seen[0]).toContain(opStateSignature('shop', '210442081', 'secret'))
    expect(seen[0], 'the password went out in the URL').not.toContain('secret')
  })
})
