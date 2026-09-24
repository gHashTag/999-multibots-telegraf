import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A BUTTON THAT LEAVES TELEGRAM DOES NOT WORK ON HIS PHONE.
 *
 * Owner, 2026-09-22 and again on 2026-09-24, the second time in anger: "the
 * agent sent a link again that does not open in Telegram, so it does not
 * work". A `url` button opens the phone's default browser, which holds no
 * session of ours: the person arrives signed out, or -- on the permission
 * flow -- at a page that answers a question nobody can see.
 *
 * The rule was written down in announce.ts the first time and applied to ONE
 * file. The approval flow, three files away, kept its url buttons for two
 * days. A rule that lives in a comment protects the file the comment is in.
 *
 * So: no `url:` button anywhere in what the render sends. The two shapes
 * that work are `web_app` (opens our page INSIDE Telegram, carrying the
 * person's signed initData) and `callback_data` (never leaves the chat at
 * all). A link to somebody ELSE's site is a different thing and is allowed
 * -- those are not ours to open inside Telegram.
 */
const ROOT = resolve(__dirname, 'src')

/** Every source file under the render, tests aside. */
function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) sources(p, out)
    else if (e.name.endsWith('.ts') && !e.name.includes('.test.')) out.push(p)
  }
  return out
}

/**
 * A button object with a `url` key whose value is OURS.
 *
 * Matched on the line, because a keyboard is written as an object literal
 * and the pair sits together: `{ text: '…', url: something }`.
 */
/**
 * A `url:` WHOSE VALUE IS AN ADDRESS OF OURS.
 *
 * Two earlier versions of this scan cried about healthy code -- first every
 * line with `url:` (110 places: types, parameters, request options), then any
 * such line beside a `text:` (three places, all of them a parameter named
 * `url` or the CORRECT web_app builder). A guard that objects to sound code
 * teaches its reader to ignore it, which costs more than the guard is worth.
 *
 * So the rule is stated as the defect itself: OUR OWN address must never be
 * the value of a `url:` property. A type annotation has no value and a
 * parameter list has no address, so neither can match; somebody else's site
 * is not ours to open inside Telegram and is left alone.
 */
const OURS =
  /(approvalBase|BROWSER_TAB_URL|SELF_PUBLIC_URL|SELF_URL|app\.t27\.ai|vibee-render|\/api\/)/

export function ourUrlButtons(source: string): number[] {
  const hits: number[] = []
  source.split('\n').forEach((line, i) => {
    const m = /\burl:\s*(.+)$/.exec(line)
    if (!m) return
    const value = m[1]
    // A type or a default parameter is not an address.
    if (/^(string|\{|number)/.test(value.trim())) return
    if (!OURS.test(value)) return
    hits.push(i + 1)
  })
  return hits
}

describe('nothing the render sends opens outside Telegram', () => {
  it('no inline button carries a url of ours', () => {
    const offenders: string[] = []
    for (const f of sources(ROOT)) {
      const src = readFileSync(f, 'utf8')
      if (!/inline_keyboard|web_app|callback_data|\burl:/.test(src)) continue
      for (const n of ourUrlButtons(src))
        offenders.push(`${f.slice(ROOT.length + 1)}:${n}`)
    }
    expect(
      offenders,
      'a url button leaves Telegram: use web_app or callback_data'
    ).toEqual([])
  })

  it('the guard can fail: it sees a url button when there is one', () => {
    /*
     * A scan that finds nothing is the shape every one of these defects
     * takes, so the scanner is shown a button and must object to it.
     */
    const bad =
      "  { text: 'Allow', url: `${approvalBase()}/api/browser/approve` },"
    expect(ourUrlButtons(bad)).toEqual([1])
  })

  it('leaves somebody else s link alone', () => {
    const ok = "  { text: 'Docs', url: 'https://core.telegram.org/bots' },"
    expect(ourUrlButtons(ok)).toEqual([])
    // A parameter named url, and the correct web_app builder beside it.
    expect(ourUrlButtons('function f(text: string, url: string) {')).toEqual([])
    expect(
      ourUrlButtons('): { text: string; web_app: { url: string } } {')
    ).toEqual([])
  })
})
