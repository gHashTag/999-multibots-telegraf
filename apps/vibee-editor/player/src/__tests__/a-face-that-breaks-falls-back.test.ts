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
    'components/Assets/AssetCard.tsx',
    'components/BrandLoader/BrandLoader.tsx',
    'components/Chat/SendCardView.tsx',
    'components/Modals/PublishModal.tsx',
    'components/Notifications/NotificationsCenter.tsx',
    'components/Panels/AssetsPanel.tsx',
    'components/Panels/FeedCard.tsx',
    'components/Panels/GeneratePanel.tsx',
    'components/Profile/ProfileFilesGrid.tsx',
    'components/Profile/ProfileHeader.tsx',
    'components/Profile/ProfilePending.tsx',
    'components/Results/ResultsGallery.tsx',
    'components/Sound/SoundAttribution.tsx',
    'components/Stories/Stories.tsx',
    'components/Timeline/ThumbnailScrubber.tsx',
    'components/Timeline/TrimPreview.tsx',
    'components/Video/LazyVideo.tsx',
    'components/Video/ProgressiveVideo.tsx',
    'components/Video/VideoFeed.tsx',
    /* A Remotion composition, rendered off-screen into a video rather than
       shown to anybody: a fallback there would appear in nobody's eyes. */
    'compositions/SplitTalkingHead.tsx',
  ]

  const bareSites = () => {
    const out: string[] = []
    for (const f of files()) {
      const text = fs.readFileSync(f, 'utf8')
      for (const tag of text.match(DATA_IMG) ?? []) {
        if (!/onError/.test(tag)) out.push(path.relative(SRC, f))
      }
    }
    return [...new Set(out)]
  }

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
