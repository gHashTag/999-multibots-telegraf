import { describe, it, expect } from 'vitest'
import { TOOLS, DIRECT_CALL_ONLY } from './src/agent/tools'
import { systemPrompt } from './src/agent/chat'

/**
 * A TOOL IN THE REGISTRY IS NOT A CAPABILITY THE AGENT KNOWS IT HAS.
 *
 * Found by the owner, twice. First: the nine `browser_*` tools were in the
 * registry AND in the compact kit, and the agent still denied having a
 * browser. Then, measured across the whole registry: SEVEN of 25 families
 * were never named anywhere in the prompt -- crm (23 tools), tg (16),
 * inngest (5), hive (3), project/projects (3), leela (1). Fifty-one tools
 * the agent had and was never told about.
 *
 * A model calls a tool it is offered; it OFFERS a capability it has been
 * told it has. The difference is the whole defect.
 */

const familiesOf = (names: string[]) => [
  ...new Set(names.map(n => n.split('_')[0])),
]

const named = (prompt: string, family: string, names: string[]) =>
  names.some(n => prompt.includes(n)) ||
  prompt.toLowerCase().includes(family.toLowerCase())

describe('the agent is told what it has', () => {
  const all = TOOLS.map(t => t.name)
  /*
   * A DIRECT_CALL_ONLY tool is never offered to a model turn (tools.ts), so
   * it is not a capability the agent has: naming it in the prompt would be
   * the mirror of the defect above -- the agent promising what it cannot do.
   */
  const offered = all.filter(n => !DIRECT_CALL_ONLY.has(n))

  it('NAMES EVERY TOOL FAMILY on the surface the owner talks to', () => {
    const prompt = systemPrompt('bot')
    const missing = familiesOf(offered).filter(
      f =>
        !named(
          prompt,
          f,
          offered.filter(n => n.startsWith(f + '_'))
        )
    )
    expect(missing, `не названы: ${missing.join(' ')}`).toEqual([])
  })

  it('says it has a BROWSER, and how the person takes the wheel', () => {
    const prompt = systemPrompt('bot')
    expect(prompt).toContain('browser_status')
    expect(prompt).toContain('browser_ask_permission')
    /* The two promises the whole design rests on. */
    expect(prompt).toMatch(/перехватить руль|видит КАЖДОЕ/i) // cyrillic-ok: matches the prompt's own words
    expect(prompt).toMatch(/пароли не спрашивай|пароли НЕ спрашивай/i) // cyrillic-ok: matches the prompt
  })

  it('KEEPS THE OWNER SIDE OUT OF A CLIENT DM', () => {
    /*
     * Not for safety -- the tools ARE gated per caller: `tg_*` opens the
     * caller's own Telegram and `crm_*` shows only the caller's own bots'
     * audience, refusing fail-closed otherwise. An earlier comment here said
     * they were not; that was wrong. They stay out of a client DM because
     * there they do not apply, and naming them would only earn refusals.
     */
    const dm = systemPrompt('business')
    for (const secret of [
      'crm_',
      'tg_dialogs',
      'tg_contacts',
      'hive_',
      'mail_',
    ]) {
      expect(dm, secret).not.toContain(secret)
    }
  })

  it('still offers the browser in a client DM, because it is theirs', () => {
    /* browser_* acts on the caller's own telegram id, so in a DM the pod
       belongs to the client. Nothing of anybody else's is reachable. */
    expect(systemPrompt('business')).toContain('browser_status')
  })

  it('does not grow the prompt without bound', () => {
    /* Every line here is context taken from the conversation. */
    expect(systemPrompt('bot').length).toBeLessThan(24_000)
  })
})
