/**
 * THE CONTRACT FOR A FACE-AND-VOICE REEL, ASSERTED AGAINST THE REAL SCHEMA.
 *
 * Every case here is a defect that ALREADY SHIPPED. Feed id 20 (2026-08-26) is
 * the only SplitTalkingHead reel this factory ever published and it failed
 * three ways at once while reporting success: bare-string captions, segments
 * shaped `{url,duration}`, and a 3.2-second clip stretched to 900 frames.
 * Nothing logged an error, because a wrongly shaped prop renders as absence.
 *
 * WHY THE REAL ZOD SCHEMA IS IMPORTED HERE. A hand-copied list of field names
 * would agree with itself forever. `SplitTalkingHeadSchema` is the same object
 * Root.tsx registers the composition with, so renaming a field in the
 * composition turns these tests red instead of turning a render into silence.
 * Verified importable under vitest before this file was written.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  SplitTalkingHeadSchema,
  SegmentSchema,
} from './src/compositions/SplitTalkingHead'
import {
  buildFaceReelProps,
  layoutSegments,
  readFaceSourceFile,
  FPS,
} from './src/face-source'

const CLIP = 'https://app.t27.ai/lipsync/lipsync.mp4'
const BROLL = 'https://app.t27.ai/backgrounds/business/bg00.mp4'
const MUSIC = 'https://app.t27.ai/audio/music/bgmusic.mp3'

const CAPTIONS = [
  { text: 'Меня', startMs: 110, endMs: 270 },
  { text: 'зовут', startMs: 270, endMs: 610 },
  { text: 'Вайби', startMs: 610, endMs: 920 },
]

/** The minimum a source must carry: the clip, and the name it publishes under. */
const BASE = { lipSyncVideo: CLIP, title: 'Вайби: цифровой клон' }

function ok(r: ReturnType<typeof buildFaceReelProps>) {
  if (!r.ok) throw new Error('expected ok, refused: ' + r.refusals.join(' | '))
  return r
}

describe('a valid face source becomes props the composition accepts', () => {
  it('passes the composition schema it will actually be rendered with', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        captions: CAPTIONS,
        bRolls: [BROLL],
        music: MUSIC,
        durationSeconds: 25.92,
      })
    )
    const parsed = SplitTalkingHeadSchema.safeParse(r.props)
    expect(parsed.success).toBe(true)
  })

  it('every produced segment parses as a Segment, in frames', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        bRolls: [BROLL],
        durationSeconds: 25.92,
      })
    )
    const segments = r.props.segments as unknown[]
    expect(segments.length).toBeGreaterThan(1)
    for (const s of segments) {
      expect(SegmentSchema.safeParse(s).success).toBe(true)
      const seg = s as { startFrame: number; durationFrames: number }
      expect(Number.isInteger(seg.startFrame)).toBe(true)
      expect(Number.isInteger(seg.durationFrames)).toBe(true)
    }
  })

  it('no segment outlives the clip', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        bRolls: [BROLL, MUSIC.replace('.mp3', '.mp4')],
        durationSeconds: 10,
      })
    )
    const segments = r.props.segments as {
      startFrame: number
      durationFrames: number
    }[]
    const end = Math.max(...segments.map(s => s.startFrame + s.durationFrames))
    expect(end).toBe(10 * FPS)
  })

  it('a b-roll segment carries the url AND the type BRollLayer switches on', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        bRolls: [BROLL],
        durationSeconds: 20,
      })
    )
    const segments = r.props.segments as {
      type: string
      bRollUrl?: string
      bRollType?: string
    }[]
    const split = segments.find(s => s.type === 'split')
    expect(split?.bRollUrl).toBe(BROLL)
    expect(split?.bRollType).toBe('video')
  })

  it('with no b-roll it is one fullscreen segment, not an empty list', () => {
    const r = ok(buildFaceReelProps({ ...BASE, durationSeconds: 12 }))
    expect(r.props.segments).toEqual([
      { type: 'fullscreen', startFrame: 0, durationFrames: 12 * FPS },
    ])
  })

  it('duration falls back to the last caption when it is not given', () => {
    const r = ok(buildFaceReelProps({ ...BASE, captions: CAPTIONS }))
    expect(r.durationSeconds).toBeCloseTo(0.92, 5)
    expect(r.durationInFrames).toBe(Math.ceil(0.92 * FPS))
    expect(r.notes.join(' ')).toContain('calculateMetadata')
  })

  it('captions are passed through unchanged and switched on', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        captions: CAPTIONS,
        durationSeconds: 5,
      })
    )
    expect(r.props.captions).toEqual(CAPTIONS)
    expect(r.props.showCaptions).toBe(true)
  })

  it('music only reaches the props as an absolute url, with a volume', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        durationSeconds: 5,
        music: MUSIC,
      })
    )
    expect(r.props.backgroundMusic).toBe(MUSIC)
    expect(typeof r.props.musicVolume).toBe('number')
  })
})

describe('the shapes that already shipped broken are refused by name', () => {
  it('bare-string captions -- the exact failure of feed id 20', () => {
    const r = buildFaceReelProps({
      ...BASE,
      captions: ['52', 'теоремы', '16'],
      durationSeconds: 5,
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const why = r.refusals.join(' | ')
    expect(why).toContain('captions[0]')
    // The refusal must name the required shape, not merely say "invalid".
    expect(why).toContain('{text,startMs,endMs}')
    // And it must give the SPECIFIC diagnosis. Without this line the generic
    // "expected an object" branch below satisfies the assertion above, and
    // deleting the bare-string branch survives the mutation -- measured.
    expect(why).toContain('голая строка')
  })

  it('captions whose end precedes their start', () => {
    const r = buildFaceReelProps({
      ...BASE,
      captions: [{ text: 'а', startMs: 900, endMs: 100 }],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('endMs')
  })

  it('segments shaped {url,duration} -- the other failure of feed id 20', () => {
    const r = buildFaceReelProps({
      ...BASE,
      segments: [{ url: BROLL, duration: 5 }],
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const why = r.refusals.join(' | ')
    expect(why).toContain('{url,duration}')
    expect(why).toContain('durationFrames')
  })

  it('a relative clip path, because the render image has no public/', () => {
    const r = buildFaceReelProps({
      ...BASE,
      lipSyncVideo: '/lipsync/lipsync.mp4',
      durationSeconds: 26,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('staticFile')
  })

  it('a missing clip, and the refusal says the voice comes from it', () => {
    const r = buildFaceReelProps({
      ...BASE,
      lipSyncVideo: '',
      durationSeconds: 26,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('lipSyncVideo')
  })

  it('a b-roll whose extension does not say video or image', () => {
    const r = buildFaceReelProps({
      ...BASE,
      bRolls: ['https://app.t27.ai/backgrounds/business/bg00'],
      durationSeconds: 10,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('bRolls[0]')
  })

  it('a relative b-roll path', () => {
    const r = buildFaceReelProps({
      ...BASE,
      bRolls: ['/b-rolls/00.mp4'],
      durationSeconds: 10,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('bRolls[0]')
  })

  it('no length and nothing to derive one from', () => {
    const r = buildFaceReelProps({ ...BASE })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('durationSeconds')
  })

  it('a refusal carries EVERY reason, not just the first', () => {
    const r = buildFaceReelProps({
      ...BASE,
      lipSyncVideo: '/lipsync/lipsync.mp4',
      bRolls: ['/b-rolls/00.mp4'],
      durationSeconds: -1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.length).toBeGreaterThanOrEqual(3)
  })

  it('a refused source yields NO props at all', () => {
    const r = buildFaceReelProps({
      ...BASE,
      captions: ['bare'],
      durationSeconds: 5,
    })
    expect(r.ok).toBe(false)
    expect((r as unknown as { props?: unknown }).props).toBeUndefined()
  })
})

describe('the title is the cap on republishing one fixed clip', () => {
  it('a source without a title is refused', () => {
    const r = buildFaceReelProps({ lipSyncVideo: CLIP, durationSeconds: 26 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('title')
  })

  it('the refusal explains WHY, so nobody adds a rolling title instead', () => {
    const r = buildFaceReelProps({ lipSyncVideo: CLIP, durationSeconds: 26 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('дедуплик')
  })

  it('the title comes back out, trimmed, for the caller to dedupe on', () => {
    const r = ok(
      buildFaceReelProps({
        ...BASE,
        title: '  Один клип  ',
        durationSeconds: 5,
      })
    )
    expect(r.title).toBe('Один клип')
  })
})

describe('reading a source off disk', () => {
  const good = JSON.stringify({ ...BASE, durationSeconds: 26 })

  it('a missing file is a refusal that says who has to act', () => {
    const r = readFaceSourceFile('/nope/face.json', () => {
      throw new Error('ENOENT')
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('владелец')
  })

  it('unparsable JSON is refused, not treated as an empty source', () => {
    const r = readFaceSourceFile('/x/face.json', () => '{ not json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.refusals.join(' ')).toContain('JSON')
  })

  it('an array is refused: the file is one source, not a queue', () => {
    const r = readFaceSourceFile('/x/face.json', () => '[]')
    expect(r.ok).toBe(false)
  })

  it('a good file yields the same props as the direct call', () => {
    const r = readFaceSourceFile('/x/face.json', () => good)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.props.lipSyncVideo).toBe(CLIP)
  })
})

describe('the example shipped with the repository', () => {
  // Documentation that does not validate is worse than none: it teaches the
  // wrong shape with authority. This is the cheapest way to keep it true.
  const EXAMPLE = path.join(__dirname, '../../../loop/face-source.example.json')

  it('exists where the autopilot comment says it does', () => {
    expect(fs.existsSync(EXAMPLE), `${EXAMPLE} is missing`).toBe(true)
  })

  it('passes the very contract it is an example of', () => {
    const r = readFaceSourceFile(EXAMPLE, p => fs.readFileSync(p, 'utf8'))
    if (!r.ok) throw new Error('example refused: ' + r.refusals.join(' | '))
    expect(SplitTalkingHeadSchema.safeParse(r.props).success).toBe(true)
  })
})

describe('the b-roll rhythm', () => {
  it('alternates split and fullscreen and starts on a b-roll', () => {
    const segs = layoutSegments(30 * FPS, [BROLL])
    expect(segs[0].type).toBe('split')
    expect(segs[1].type).toBe('fullscreen')
    expect(segs.map(s => s.startFrame)).toEqual(
      segs.map((_, i) =>
        segs.slice(0, i).reduce((a, s) => a + s.durationFrames, 0)
      )
    )
  })

  it('cycles through the b-rolls instead of repeating the first', () => {
    const b = ['https://h/a.mp4', 'https://h/b.mp4']
    const segs = layoutSegments(40 * FPS, b)
    const used = segs.filter(s => s.bRollUrl).map(s => s.bRollUrl)
    expect(new Set(used).size).toBe(2)
  })

  it('a clip shorter than one split still produces a covering segment', () => {
    const segs = layoutSegments(60, [BROLL])
    expect(segs).toHaveLength(1)
    expect(segs[0].durationFrames).toBe(60)
  })
})
