import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOLS, toMcpTools } from './src/agent/tools'
import { a2aCard } from './src/agent/a2a'
import { pricingSummary } from './src/agent/pricing'
import { systemPrompt } from './src/agent/chat'

/**
 * WE SELL TOKENS. THERE IS NO SUBSCRIPTION TO SELL.
 *
 * The owner, 2026-09-08:
 * "Мы продаем токены и все: текст, видео, фото. Всё привязывается к токену" (cyrillic-ok: the owner's own words)
 *
 * Until this change the agent offered a club at ninety-nine and
 * nine-hundred-ninety-nine dollars a month, and held the product behind it:
 * the full harness and the weekly meetings were "in the club". Nothing in
 * this repository has ever charged for such a club: no invoice, no ledger
 * row, no handler. The agent's own playbook forbids promising anything that
 * is not in the price list, and this was the largest promise it made.
 *
 * The club had three mouths, and deleting one would have left the agent
 * contradicting itself: the `club` tool, the `pricing` tool's summary, and the
 * system prompt. The tool description was the worst of them -- `toMcpTools`
 * copies it verbatim into /.well-known/agent-card.json, which auth.ts serves
 * to anyone with no credential at all. So "$99/мес" was published to
 * strangers, not merely spoken in chat.
 */

const FORBIDDEN = ['$99', '$999', 'Trinity Club', 'тарифы клуба']

/**
 * Case-insensitive, and that is not tidiness. The shipped tool description
 * read the club-tariffs phrase capitalised while this list spelled it in
 * lower case:
 * a case-sensitive matcher would have walked past the very copy it exists to
 * catch. The self-check below caught it before the test was committed.
 */
function offences(text: string): string[] {
  const hay = text.toLowerCase()
  return FORBIDDEN.filter(needle => hay.includes(needle.toLowerCase()))
}

describe('no subscription is offered anywhere the agent speaks', () => {
  /**
   * SELF-CHECK. The needle is the exact string that shipped, so that "no
   * offences" cannot be confused with "the matcher looked for nothing".
   */
  it('the matcher finds the club copy that actually shipped', () => {
    // Two real samples, because no single shipped line carried all four
    // needles: the tool description spelled the prices, the price entry
    // spelled the name. A one-sample self-check would have passed while the
    // name went unwatched -- it did, on the first run of this test.
    const toolDescription =
      'Тарифы клуба Trinity S³AI: Basic $99/мес (доступ к харнесу) и Pro $999/мес'
    const priceEntry = "название: 'Trinity Club — Basic', цена: '$99/мес'"
    const seen = new Set([
      ...offences(toolDescription),
      ...offences(priceEntry),
    ])
    expect([...seen].sort()).toEqual([...FORBIDDEN].sort())
    expect(offences('Токены покупаются за Telegram Stars')).toEqual([])
  })

  it('no tool is named club, and no tool describes a subscription', () => {
    expect(TOOLS.map(t => t.name)).not.toContain('club')
    for (const t of TOOLS) {
      expect(offences(t.description), `tool ${t.name}`).toEqual([])
    }
  })

  /**
   * The card is the one surface an unauthenticated stranger reads, so it gets
   * its own assertion rather than trusting the loop above to cover it.
   */
  it('the public agent card offers no subscription', () => {
    const card = JSON.stringify(a2aCard('https://example.invalid'))
    expect(offences(card)).toEqual([])
    expect(card).not.toContain('"club"')
    expect(JSON.stringify(toMcpTools())).not.toContain('"club"')
  })

  it('the price list has no club and says how to pay instead', () => {
    const summary = pricingSummary() as Record<string, unknown>
    expect(Object.keys(summary)).not.toContain('клуб') // cyrillic-ok: field name
    expect(offences(JSON.stringify(summary))).toEqual([])
    expect(JSON.stringify(summary)).toContain('tokens_invoice')
  })

  it('every surface of the prompt sells the top-up', () => {
    for (const surface of ['bot', 'business', 'app']) {
      const p = systemPrompt(surface)
      expect(offences(p), surface).toEqual([])
      expect(p, surface).toContain('tokens_invoice')
    }
  })
})

/**
 * A file census on top of the behavioural checks: the tests above read the
 * registry through its own exports, so a club re-introduced in a module they
 * do not happen to load would pass them. This reads the directory.
 */
describe('the agent module carries no subscription copy', () => {
  const dir = join(__dirname, 'src', 'agent')

  it('the census can see a file it is meant to catch', () => {
    expect(offences("цена: '$99/мес'")).toEqual(['$99'])
  })

  it('no file under src/agent offers a monthly plan', () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(10)
    const guilty: string[] = []
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8')
      // A test file may quote the old copy to prove it is gone; this is
      // production source only.
      if (f.endsWith('.test.ts')) continue
      if (offences(text).length)
        guilty.push(`${f}: ${offences(text).join(', ')}`)
    }
    expect(guilty).toEqual([])
  })
})
