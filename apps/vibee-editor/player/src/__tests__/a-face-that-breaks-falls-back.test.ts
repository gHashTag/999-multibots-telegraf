/**
 * A FACE THAT DOES NOT LOAD SHOWS INITIALS, NOT A BROKEN ICON.
 *
 * `components/Crm/Avatar.tsx` was extracted for exactly this: a signed link
 * expires and the browser draws its own broken-picture mark. It even imports
 * `initialsOf` FROM the row of circles -- and that row still drew a bare
 * `<img>`, so the same client showed initials in the CRM list and a broken
 * icon in the rail. The rule was lifted out of a file and never came back to
 * it (form 187, fourth time this week).
 *
 * Guarded across the FAMILY rather than per component: every picture of a
 * PERSON needs the fallback, wherever somebody adds one next. Logos and
 * brand marks are local files shipped with the app -- if those fail nothing
 * else works, and an error path for them is theatre.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..')

function files(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full)
      } else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) {
        out.push(full)
      }
    }
  }
  walk(SRC)
  return out
}

/**
 * AN IMAGE FED BY DATA, WHICH IS THE ONE THAT CAN FAIL.
 *
 * The first version of this matched `src={...avatar|photo|face...}` -- by the
 * NAME of the variable -- and missed the very site that prompted it: the row
 * of circles calls its prop `url`. Names are what the author happened to
 * type; what matters is where the picture comes from.
 *
 * `src={expression}` is a URL from a server or a person: it expires, it 404s,
 * it is somebody else's storage. `src="/logo.svg"` is a file shipped inside
 * the app -- if that fails nothing else works, and an error path for it is
 * theatre.
 */
const DATA_IMG = /<img[^>]*\ssrc=\{[\s\S]{0,300}?\/>/gi

describe('every picture of a person can fall back', () => {
  it('finds person-pictures at all', () => {
    // Negative control: a pattern that matches nothing would pass the next
    // assertion for every file in the repository.
    const all = files().flatMap(f => {
      const m = fs.readFileSync(f, 'utf8').match(DATA_IMG)
      return m ? [f] : []
    })
    expect(
      all.length,
      'the pattern must find the ones we know about'
    ).toBeGreaterThan(1)
  })

  /**
   * THE SITES THAT STILL HAVE NO ERROR PATH, AND MAY ONLY GET FEWER.
   *
   * The rule is right for all of them -- every one of these URLs comes from a
   * server and can 404 or expire -- but giving fifteen screens a sensible
   * fallback is fifteen judgements about what should stand in the gap, and a
   * hurried one is worse than the broken icon it replaces.
   *
   * So this is a ratchet, not a claim of cleanliness: the list says what is
   * owed, a NEW bare image fails on the day it is written, and the list is
   * only ever allowed to shrink. The faces were done first because a person's
   * picture has an obvious answer -- their initials -- and because a broken
   * face is the one a person recognises as broken.
   */
  const OWED = [
    /*
     * NOT A DEBT, AND THE PATTERN CANNOT SEE THAT. `BRAND_MARK_URL` is
     * '/t27-mark.svg' -- a file shipped inside the app, written into a
     * constant, so `src={...}` matches while the picture is not data at all.
     * If it fails nothing else works, and an error path for it is theatre
     * (form 192). Kept on the list with its reason rather than "fixed".
     */
    'components/BrandLoader/BrandLoader.tsx',
    'components/Stories/Stories.tsx',
    'components/Video/LazyVideo.tsx',
    'components/Video/ProgressiveVideo.tsx',
    'components/Video/VideoFeed.tsx',
    /* A Remotion composition, rendered off-screen into a video rather than
       shown to anybody: a fallback there would appear in nobody's eyes. */
    'compositions/SplitTalkingHead.tsx',
  ]

  /**
   * AN `onError` THAT ONLY LOGS IS NOT A FAILURE PATH.
   *
   * Found while paying this debt down: one site already carried
   * `onError={() => console.error(...)}` and my check counted it as handled.
   * The person still sees the browser's broken mark; the log reaches whoever
   * is not looking at the screen. A site could "pay" its debt by writing to
   * a console nobody reads.
   *
   * WHAT CAN BE DECIDED HERE, AND WHAT CANNOT. Whether a handler really
   * fixes anything is not answerable by reading the tag: `onError={() =>
   * handleImageError(id)}` calls a function that sets state, and a first
   * version of this check -- looking for `setX`, `display`, `style` in the
   * body -- called that site broken. It is not.
   *
   * What IS decidable: a handler whose body is nothing but console calls
   * does nothing at all. Strip those, and if what remains is empty, the tag
   * has a handler in name only.
   */
  const handlesFailure = (tag: string): boolean => {
    const m = /onError=\{([\s\S]*?)\}\s*(?:\/?>|\n)/.exec(tag)
    if (!m) return false
    const withoutLogs = m[1]!
      .replace(/console\.\w+\([\s\S]*?\)/g, '')
      .replace(/[(){}=>;,\s]/g, '')
    return withoutLogs.length > 0
  }

  const bareSites = () => {
    const out: string[] = []
    for (const f of files()) {
      const text = fs.readFileSync(f, 'utf8')
      for (const tag of text.match(DATA_IMG) ?? []) {
        if (!handlesFailure(tag)) out.push(path.relative(SRC, f))
      }
    }
    return [...new Set(out)]
  }

  it('THE RULE ITSELF: a handler in name only does not count', () => {
    /*
     * Pinned directly, because the site-by-site checks cannot pin it: once
     * every file is either honest or on the list, a `handlesFailure` that
     * always answered TRUE would pass all of them and quietly stop being a
     * check. That mutation survived until this test existed.
     */
    expect(
      handlesFailure('<img src={u} onError={() => console.error(u)} />'),
      'console alone leaves the broken mark on the screen'
    ).toBe(false)
    expect(
      handlesFailure(
        '<img src={u} onError={() => { console.warn(u); console.log(1) }} />'
      )
    ).toBe(false)
    // And what does count: anything that changes the page, whether inline or
    // through a named function -- `handleImageError(id)` sets state, and a
    // first version of this rule wrongly called that site broken.
    expect(
      handlesFailure('<img src={u} onError={() => setBroken(true)} />')
    ).toBe(true)
    expect(
      handlesFailure('<img src={u} onError={() => handleImageError(id)} />')
    ).toBe(true)
    expect(
      handlesFailure(
        '<img src={u} onError={e => { console.error(u); e.currentTarget.style.display = "none" }} />'
      ),
      'logging AND acting is acting'
    ).toBe(true)
    expect(handlesFailure('<img src={u} />')).toBe(false)
  })

  it('no NEW picture arrives without a way to fail', () => {
    const unexpected = bareSites().filter(f => !OWED.includes(f))
    expect(
      unexpected,
      'these draw a picture from a server and would show a broken icon:\n' +
        unexpected.join('\n')
    ).toEqual([])
  })

  it('and the debt only shrinks: nothing on the list is already paid', () => {
    // The other direction of the ratchet. Without it the list would keep
    // names that have been fixed, and the next reader would trust a figure
    // that is too high -- which is how a debt stops being read at all.
    const bare = bareSites()
    const stale = OWED.filter(f => !bare.includes(f))
    expect(
      stale,
      'these are fixed and must leave the list:\n' + stale.join('\n')
    ).toEqual([])
  })

  it('the faces themselves are done', () => {
    // What this tick actually fixed: every picture of a PERSON, which is the
    // family the CRM shows and the one with an obvious fallback.
    for (const f of [
      'components/Chat/ChatThreads.tsx',
      'components/Crm/Avatar.tsx',
      'components/Comments/Comments.tsx',
      'components/Leads/LeadCard.tsx',
      'components/Header/Header.tsx',
    ]) {
      expect(
        bareSites(),
        `${f} draws a face and must handle a failure`
      ).not.toContain(f)
    }
  })
})
