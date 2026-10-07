import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './split-reel.gen'
import {
  END_CARD_DEFAULT_TITLE as STORY_DEFAULT_TITLE,
  PAUSE_SEC as STORY_PAUSE_SEC,
} from './crm-story-reel.gen'
import { SplitTalkingHeadSchema } from '../compositions/SplitTalkingHead'
import {
  agentSuppliedHouseName,
  backstopRefund,
  callColourFrom,
  callDrawn,
  captionStartMs,
  captionsFromWords,
  ctaFor,
  deliverable,
  faceObjectPosition,
  faceTargetYPct,
  firstSpeechMs,
  framesForSeconds,
  houseNameAllowed,
  houseOwn,
  houseOwnTurn,
  leadOfTurn,
  measuredPace,
  msOfSeconds,
  objectPosPct,
  paceFor,
  paceToKeep,
  ownerVoiceAllowed,
  reelCallColour,
  reelCta,
  reelFrames,
  splitReelProps,
  speechChars,
  speechFrames,
  speechLines,
  speechMsEstimate,
  speechUnits,
  speechUnitsOf,
  slowestPace,
  splitSegments,
  STUDIO_FACE,
  textFits,
  voiceRefused,
  voiceTooLong,
} from '../split-reel-plan'
import { namesHouse } from '../house-names'
import {
  analyzeReel,
  parseSceneCuts,
  parseShotVerdict,
  rhythmAgainstSpec,
  shotsFromCuts,
} from '../agent/reel-analyze'
import { callReads, makeSplitReelTool } from '../agent/split-reel-tool'
import { readableShade } from '../agent/story-reel-tool'
import { keepVoicePace, saveLeadVoice, voicePaceOf } from '../agent/lead-voice'

/*
 * The charge is spied on below through the tools themselves, and the house's
 * own wallet is read once at load (house-ids.ts), hence vi.hoisted.
 */
const HOUSE_ID = vi.hoisted(() => {
  process.env.HOUSE_TELEGRAM_IDS = '900000001'
  return '900000001'
})
const SELLER_ID = '900000077'
const CLIENT_ID = '900000005'

/** A pool that remembers every statement; it holds no tokens and no clone. */
function emptyPool() {
  const said: string[] = []
  return {
    said,
    query: async (sql: string) => {
      said.push(String(sql))
      return { rows: [] }
    },
  }
}
/** The debit statement of the ledger: the one place a wallet is charged. */
const DEBIT = /UPDATE user_tokens SET balance = balance - /

/** A ledger that keeps its references, as its unique (kind, ref) does. */
const CREDIT = /UPDATE user_tokens SET balance = balance \+ /
function tokenLedger() {
  const said: Array<[string, unknown[]]> = []
  const refs = new Set<string>()
  return {
    credits: () => said.filter(([q]) => CREDIT.test(q)).map(([, p]) => p[1]),
    refunds: () =>
      said
        .filter(
          ([q, p]) => /INSERT INTO token_ledger/.test(q) && p[3] === 'refund'
        )
        .map(([, p]) => p[5]),
    query: async (sql: string, params: unknown[] = []) => {
      said.push([String(sql), params])
      if (/SELECT 1 FROM token_ledger WHERE kind/.test(sql))
        return { rows: refs.has(`${params[0]} ${params[1]}`) ? [{}] : [] }
      if (/INSERT INTO token_ledger/.test(sql) && params[5])
        refs.add(`${params[3]} ${params[5]}`)
      if (CREDIT.test(sql)) return { rows: [{ balance: params[1] }] }
      return { rows: [] }
    },
  }
}

/**
 * The ledger, plus the clones in lead_voices (split-reel v9): who made each,
 * of whom, and the slowest pace kept on it. The statements are
 * lead-voice.ts's own; an update that does not keep the greater value
 * overwrites, as Postgres would.
 */
type VoiceRow = {
  owner: string
  lead: string
  voice: string
  pace: number | null
}
/**
 * The rows a pace statement's WHERE names, read from the statement itself:
 * an OR of ANDs over the conditions lead-voice.ts can write. A fake that
 * filtered by the voice whatever the SQL said kept one voice's pace off every
 * other clone even when the statement wrote it there (split-reel v9,
 * PACE_ON_OTHER_VOICES). A condition the fake does not know throws, so a new
 * one is a red test, never a silent pass.
 */
function whereOf(sql: string, params: unknown[]): (r: VoiceRow) => boolean {
  const clause = /\bWHERE\b([\s\S]*?)(?:\bORDER BY\b|\bLIMIT\b|$)/i.exec(sql)
  if (!clause) return () => true
  const arg = (n: string) => String(params[Number(n) - 1])
  const condition = (text: string): ((r: VoiceRow) => boolean) => {
    const c = text.trim()
    let m: RegExpExecArray | null
    if ((m = /^voice_id = \$(\d+)$/.exec(c))) {
      const v = arg(m[1])
      return r => r.voice === v
    }
    if ((m = /^owner_id = \$(\d+)$/.exec(c))) {
      const v = arg(m[1])
      return r => r.owner === v
    }
    if ((m = /^lead_id = \$(\d+)$/.exec(c))) {
      const v = arg(m[1])
      return r => r.lead === v
    }
    if (/^ms_per_char IS NULL$/i.test(c)) return r => r.pace == null
    if (/^ms_per_char IS NOT NULL$/i.test(c)) return r => r.pace != null
    throw new Error(`voiceBook: a condition the fake does not know: ${c}`)
  }
  const anyOf = clause[1]
    .trim()
    .split(/\s+OR\s+/i)
    .map(all => all.split(/\s+AND\s+/i).map(condition))
  return r => anyOf.some(all => all.every(holds => holds(r)))
}
function voiceBook(rows: VoiceRow[]) {
  const book = tokenLedger()
  const query = async (sql: string, params: unknown[] = []) => {
    const q = String(sql)
    const [a, b] = params.map(String)
    if (/SELECT lead_id, voice_id, seconds FROM lead_voices/.test(q))
      return {
        rows: rows
          .filter(r => r.owner === a && r.lead === b)
          .map(r => ({ lead_id: r.lead, voice_id: r.voice, seconds: 30 })),
      }
    if (/SELECT voice_id, seconds FROM lead_voices/.test(q))
      return {
        rows: rows
          .filter(r => r.lead === a)
          .map(r => ({ voice_id: r.voice, seconds: 30 })),
      }
    if (/SELECT ms_per_char FROM lead_voices/.test(q)) {
      const kept = rows
        .filter(whereOf(q, params))
        .map(r => r.pace)
        .sort((x, y) => (y ?? -1) - (x ?? -1))
      return { rows: kept.slice(0, 1).map(p => ({ ms_per_char: p })) }
    }
    if (/UPDATE lead_voices SET ms_per_char/.test(q)) {
      const slowest = /GREATEST\(COALESCE\(ms_per_char, 0\), \$2\)/.test(q)
      for (const r of rows.filter(whereOf(q, params)))
        r.pace = slowest ? Math.max(r.pace ?? 0, Number(b)) : Number(b)
      return { rows: [] }
    }
    return book.query(sql, params)
  }
  return { ...book, query, rows }
}

/** split_reel over fake tools: audio_generate answers `seconds`, at `spent`. */
function heldReel(voice: { url: string; seconds: number; spent: number }) {
  const paid: string[] = []
  const lookup = (name: string) => ({
    name,
    description: '',
    parameters: {},
    handler: async () => {
      paid.push(name)
      if (name !== 'audio_generate') return { done: false, reason: 'stop here' }
      return {
        сделано: true, // cyrillic-ok: audio_generate's own answer keys
        url: voice.url,
        seconds: voice.seconds,
        токены: { потрачено: voice.spent }, // cyrillic-ok: audio_generate's own answer keys
      }
    },
  })
  const senses = {
    length: async () => voice.seconds,
    hear: async () => ({ words: [] }),
  }
  return { paid, reel: makeSplitReelTool(lookup as never, senses as never) }
}
const REEL_ARGS = { image_url: 'https://ours/face.png', brolls: ['a garden'] }

/**
 * split_reel to the end over fake tools that all succeed (v10): what it hands
 * reel_render is what the composition draws. The pool answers her profile and
 * the end card her seller keeps for her, as story-template.ts reads them, and
 * nothing else.
 */
async function drawnCall(
  args: Record<string, unknown>,
  turn: { telegramId: string; faceOf?: string },
  her: { profile?: unknown; kept?: unknown } = {}
) {
  const paid: string[] = []
  let props: any = null
  const answer: Record<string, (a: any) => unknown> = {
    audio_generate: () => ({
      сделано: true, // cyrillic-ok: audio_generate's own answer key
      url: 'https://ours/voice.mp3',
      seconds: 9,
    }),
    image_edit: () => ({ done: true, url: 'https://ours/broll.png' }),
    lipsync_generate: () => ({
      done: true,
      url: 'https://ours/clip.mp4',
      seconds: 9,
    }),
    reel_render: a => {
      props = a.props
      return { готово: true, url: 'https://ours/reel.mp4' } // cyrillic-ok: reel_render's own answer key
    },
  }
  const lookup = (name: string) => ({
    name,
    description: '',
    parameters: {},
    handler: async (a: any) => {
      paid.push(name)
      return answer[name](a)
    },
  })
  const senses = {
    length: async () => 9,
    hear: async () => ({
      words: [
        { word: 'Hello', start: 0.4, end: 0.8 },
        { word: 'now', start: 8.5, end: 8.9 },
      ],
    }),
  }
  const pool = {
    query: async (sql: string) => {
      if (/FROM crm_client_profiles/.test(sql) && her.profile)
        return { rows: [{ profile: her.profile }] }
      if (/FROM story_end_cards/.test(sql) && her.kept)
        return { rows: [{ end_card: her.kept }] }
      return { rows: [] }
    },
  }
  const out: any = await makeSplitReelTool(
    lookup as never,
    senses as never
  ).handler(
    { ...REEL_ARGS, text: 'Hello, this is Anna ... write now', ...args },
    { ...turn, pool } as never
  )
  return { out, paid, colour: props?.ctaColor as string | undefined }
}
/** A client's turn on her seller's wallet. */
const HER_TURN = { telegramId: SELLER_ID, faceOf: CLIENT_ID }

/**
 * gHashTag/t27 specs/automation/split-reel.t27, vendored beside its
 * `t27c gen-ts` output. Each `test` block of the spec runs here against the
 * host planner (split-reel-plan.ts) and the analyser (agent/reel-analyze.ts).
 */
const segCount = (total: number) => splitSegments(total).length
/** The house's own reel, as split_reel builds its call (v7). */
const NEUTRAL = 'Write to me'
const HOUSE_CALL = { house: true, neutral: NEUTRAL }
const lastLen = (total: number) => splitSegments(total).at(-1)!.durationFrames

describe('split-reel.t27 against the host', () => {
  it('the vendored spec is the one the generated module came from', () => {
    const spec = readFileSync(join(__dirname, 'split-reel.t27'), 'utf8')
    expect(spec).toContain(`pub const VERSION : u8 = ${SPEC.VERSION};`)
  })

  it('the reel opens on the face, then split 120 and full 45 by turns', () => {
    expect(segCount(450)).toBe(6)
    expect(lastLen(450)).toBe(60)
    expect(segCount(225)).toBe(3)
    expect(lastLen(225)).toBe(45)
    const s = splitSegments(450)
    expect(s.map(x => x.type)).toEqual([
      'fullscreen',
      'split',
      'fullscreen',
      'split',
      'fullscreen',
      'split',
    ])
    expect(s[0].durationFrames).toBe(SPEC.OPEN_FULL_FRAMES)
    for (let i = 1; i < s.length; i++)
      expect(s[i].startFrame).toBe(
        s[i - 1].startFrame + s[i - 1].durationFrames
      )
  })

  it('a voice shorter than the opening is one shot of the face', () => {
    expect(segCount(50)).toBe(1)
    expect(lastLen(50)).toBe(50)
  })

  it('fifteen seconds is the ceiling and the words are one at a time in yellow', () => {
    expect(framesForSeconds(15)).toBe(450)
    expect(framesForSeconds(40)).toBe(450)
    const p = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 15,
      call: HOUSE_CALL,
    })
    expect(p.captionColor).toBe('#FFFF00')
    expect(SPEC.WORDS_PER_CAPTION).toBe(1)
    expect(SPEC.OWN_VOICE).toBe(true)
    expect(SPEC.CAPTIONS_FROM_FINAL_VOICE).toBe(true)
    expect(SPEC.CAPTION_DRIFT_MAX_MS).toBeLessThanOrEqual(150)
  })

  it("each caption is a word of the final voice, at that word's time", () => {
    const caps = captionsFromWords(
      [
        { word: ' Доброе', start: 0, end: 0.44 },
        { word: ' ', start: 0.44, end: 0.45 },
        { word: ' утро!', start: 0.44, end: 0.96 },
      ],
      68
    )
    expect(caps).toEqual([
      { text: 'Доброе', startMs: 68, endMs: 508, confidence: 1 },
      { text: 'утро!', startMs: 508, endMs: 1028, confidence: 1 },
    ])
  })

  it('a caption starts where the sound starts, not in the pause before it', () => {
    expect(captionStartMs(5720, 6300, 6380)).toBe(6300)
    expect(captionStartMs(1340, 1340, 1440)).toBe(1340)
    expect(captionStartMs(1000, 1500, 1400)).toBe(1000)
    expect(SPEC.ONSET_FRAME_MS).toBe(10)
    expect(SPEC.CAPTION_ON_SILENCE_MAX_MS).toBeLessThanOrEqual(
      SPEC.CAPTION_DRIFT_MAX_MS
    )
    // 8 kHz voice: 0.5 s loud, 0.5 s silence, 0.5 s loud.
    const rate = 8000
    const pcm = new Int16Array(rate * 1.5)
    for (let i = 0; i < pcm.length; i++)
      if (i < rate / 2 || i >= rate) pcm[i] = i % 2 ? 8000 : -8000
    const speech = speechFrames(pcm, rate)
    expect(speech.length).toBe(150)
    expect(firstSpeechMs(speech, 600, 1200)).toBe(1000)
    expect(firstSpeechMs(speech, 600, 900)).toBe(900)
    // Whisper gave the second word the pause; the caption waits for the sound.
    const caps = captionsFromWords(
      [
        { word: 'Доброе', start: 0, end: 0.5 },
        { word: 'и', start: 0.6, end: 1.2 },
      ],
      0,
      speech
    )
    expect(caps.map(c => c.startMs)).toEqual([0, 1000])
  })

  it('a tail shorter than a second joins the shot before it', () => {
    // A 13.35 s voice (2026-10-02) left an 11-frame split at the very end.
    expect(segCount(401)).toBe(5)
    expect(lastLen(401)).toBe(56)
    expect(segCount(190)).toBe(2)
    expect(lastLen(190)).toBe(130)
    expect(segCount(61)).toBe(1)
    expect(lastLen(61)).toBe(61)
    expect(splitSegments(401).at(-1)!.type).toBe('fullscreen')
  })

  it('in a split the face fills the lower half, not a circle', () => {
    // The first reel from this spec came out with SplitTalkingHead's default:
    // a 25% circle on black under the b-roll.
    const p = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 15,
      call: HOUSE_CALL,
    })
    expect(SPEC.FACE_FILLS_HALF).toBe(true)
    expect(p.splitIsCircle).toBe(false)
    expect(p.splitCircleSize).toBe(50)
  })

  it('the face is aimed at the middle of its window, never cut at the seam', () => {
    // Reel 2 (2026-10-02): the split showed the middle of the 9:16 lipsync and
    // the top of the head sat on the seam.
    expect(objectPosPct(760, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(29)
    expect(objectPosPct(537, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(5)
    expect(objectPosPct(300, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(0)
    expect(objectPosPct(1900, 1920, 960, SPEC.FACE_CENTER_Y_PCT)).toBe(100)
    expect(objectPosPct(760, 1920, 1920, SPEC.FACE_CENTER_Y_PCT)).toBe(50)
    expect(objectPosPct(518, 1080, 1080, SPEC.FACE_CENTER_X_PCT)).toBe(50)
    expect(SPEC.FACE_CENTER_X_PCT).toBe(50)
    expect(SPEC.HEADROOM_MIN_PCT).toBeGreaterThan(0)
  })

  it('a face too big for the middle is aimed lower, never past the drift', () => {
    expect(faceTargetYPct(30)).toBe(50)
    expect(faceTargetYPct(49)).toBe(55)
    expect(faceTargetYPct(49) - 49).toBe(SPEC.HEADROOM_AIM_PCT)
    expect(faceTargetYPct(58)).toBe(60)
    expect(SPEC.HEADROOM_AIM_PCT).toBeGreaterThan(SPEC.HEADROOM_MIN_PCT)
    // Reel 1 (2026-10-02): a 720x1280 Kie lipsync, the face box 313 px tall.
    // Centred, the split showed 0% above the skull; aimed at 55% it keeps 6%.
    const reel1 = { cx: 375, cy: 521, srcW: 720, srcH: 1280 }
    expect(faceObjectPosition(reel1, 1080, 960)).toBe('50% 31%')
    expect(faceObjectPosition({ ...reel1, h: 313 }, 1080, 960)).toBe('50% 26%')
    // Full screen of a 9:16 source cannot be re-aimed, measured or not.
    expect(faceObjectPosition({ ...reel1, h: 313 }, 1080, 1920)).toBe('50% 50%')
  })

  it('the planner tells the composition where the face is, per window', () => {
    const p = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 15,
      call: HOUSE_CALL,
    })
    // Unmeasured: the studio's own place, aimed up from the default 50%.
    expect(p.splitFacePosition).toBe('50% 6%')
    expect(p.fullscreenFacePosition).toBe('50% 50%')
    // A 720x1280 lipsync is the same frame at a different size.
    const small = {
      ...STUDIO_FACE,
      cx: 345.6,
      cy: 358.4,
      srcW: 720,
      srcH: 1280,
    }
    expect(faceObjectPosition(small, 1080, 960)).toBe('50% 6%')
    // A measured face low in the frame is aimed lower, never past the edge.
    const low = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 15,
      call: HOUSE_CALL,
      face: { cx: 540, cy: 1700, srcW: 1080, srcH: 1920 },
    })
    expect(low.splitFacePosition).toBe('50% 100%')
  })

  it('the reel ends on a held frame with the call, inside fifteen seconds', () => {
    const fits = (total: number) => total <= SPEC.MAX_SECONDS * SPEC.FPS
    expect(reelFrames(368)).toBe(458)
    expect(fits(reelFrames(368))).toBe(false)
    expect(fits(reelFrames(346))).toBe(true)
    expect(SPEC.CTA_PAUSE_SEC).toBe(3)
    expect(SPEC.CTA_ALWAYS).toBe(true)
    expect(fits(reelFrames(SPEC.SPEECH_MAX_SECONDS * SPEC.FPS))).toBe(true)
    expect(fits(reelFrames(SPEC.SPEECH_MAX_SECONDS * SPEC.FPS + 1))).toBe(false)
  })

  it('the pause is the one every reel template ends on', () => {
    // StoryReel's canon (crm-story-reel.t27 PAUSE_SEC): one ending, not two.
    expect(SPEC.CTA_PAUSE_SEC).toBe(STORY_PAUSE_SEC)
    const p = splitReelProps({
      lipSyncVideo: 'https://x/l.mp4',
      seconds: 11.5,
      call: HOUSE_CALL,
    })
    expect(p.pauseSec).toBe(SPEC.CTA_PAUSE_SEC)
    expect(p.ctaText).toBe(SPEC.OWNER_CTA)
    expect(p.speechSec).toBe(11.5)
    expect(
      splitReelProps({
        lipSyncVideo: 'x',
        seconds: 5,
        call: { house: false, given: '@her_bot', neutral: NEUTRAL },
      }).ctaText
    ).toBe('@her_bot')
    // The composition takes what the planner sends, and old props keep no pause.
    const parsed = SplitTalkingHeadSchema.safeParse({
      ...p,
      segments: p.segments.map(x => ({ ...x, caption: '' })),
    })
    expect(parsed.success).toBe(true)
  })

  it('a reel is given to a person only when it was measured and is clean', () => {
    expect(SPEC.REEL_CHECK_BEFORE_SEND).toBe(true)
    expect(deliverable(true, 0)).toBe(true)
    expect(deliverable(true, 1)).toBe(false)
    expect(deliverable(false, 0)).toBe(false)
  })

  it('a reel is the house own only when the house orders it and nobody else is named', () => {
    expect(houseOwn(true, false, false, false)).toBe(true)
    expect(houseOwn(true, true, false, false)).toBe(false)
    expect(houseOwn(true, false, true, false)).toBe(false)
    expect(houseOwn(true, false, false, true)).toBe(false)
    expect(houseOwn(true, true, true, true)).toBe(false)
    // A seller who is not the house: her own reel is not the house's.
    expect(houseOwn(false, false, false, false)).toBe(false)
    // The same rule read off a turn: the lead is the order's, else the turn's client.
    expect(houseOwnTurn({ house: true }, '')).toBe(true)
    expect(houseOwnTurn({ house: true, sellerSweep: true }, '')).toBe(false)
    expect(houseOwnTurn({ house: false }, '')).toBe(false)
    expect(leadOfTurn(undefined, { faceOf: '900000077' })).toBe('900000077')
    expect(leadOfTurn(' 900000005 ', { faceOf: '900000077' })).toBe('900000005')
    expect(leadOfTurn('', {})).toBe('')
    const turn = { house: true, faceOf: '900000077' }
    expect(houseOwnTurn(turn, leadOfTurn(undefined, turn))).toBe(false)
  })

  it('a client reel ends on the client call, never on the owner bot', () => {
    expect(ctaFor(false, false, false, true)).toBe(SPEC.CTA_CLIENT)
    expect(ctaFor(false, false, false, false)).toBe(SPEC.CTA_NEUTRAL)
    expect(ctaFor(false, true, false, false)).toBe(SPEC.CTA_GIVEN)
    expect(ctaFor(false, true, false, true)).toBe(SPEC.CTA_GIVEN)
    expect(ctaFor(false, true, true, true)).toBe(SPEC.CTA_CLIENT)
    expect(ctaFor(false, true, true, false)).toBe(SPEC.CTA_NEUTRAL)
    expect(SPEC.CTA_ALWAYS).toBe(true)
    // In words: her profile's call, else the neutral one, never the bot.
    const her = { house: false, client: 'Book a fitting', neutral: NEUTRAL }
    expect(reelCta(her)).toBe('Book a fitting')
    expect(reelCta({ house: false, neutral: NEUTRAL })).toBe(NEUTRAL)
    expect(reelCta({ ...her, given: 'Call Anna' })).toBe('Call Anna')
    expect(reelCta({ ...her, given: SPEC.OWNER_CTA })).toBe('Book a fitting')
    expect(
      reelCta({
        house: false,
        given: `Write ${SPEC.OWNER_CTA}`,
        neutral: NEUTRAL,
      })
    ).toBe(NEUTRAL)
    for (const c of [her, { house: false, neutral: NEUTRAL }])
      expect(namesHouse(reelCta(c))).toBe(false)
    expect(
      splitReelProps({ lipSyncVideo: 'x', seconds: 5, call: her }).ctaText
    ).toBe('Book a fitting')
  })

  it('the house own reel still ends on the bot', () => {
    expect(ctaFor(true, false, false, false)).toBe(SPEC.CTA_OWNER)
    expect(ctaFor(true, false, false, true)).toBe(SPEC.CTA_OWNER)
    expect(ctaFor(true, true, true, false)).toBe(SPEC.CTA_GIVEN)
    expect(ctaFor(true, true, false, false)).toBe(SPEC.CTA_GIVEN)
    expect(SPEC.OWNER_CTA).toBe('@t27ai_bot')
    expect(reelCta(HOUSE_CALL)).toBe(SPEC.OWNER_CTA)
    expect(reelCta({ ...HOUSE_CALL, given: SPEC.OWNER_CTA })).toBe(
      SPEC.OWNER_CTA
    )
    expect(reelCta({ ...HOUSE_CALL, given: 'Call me' })).toBe('Call me')
  })

  it('a reel the house did not order never speaks in the owner voice', () => {
    expect(ownerVoiceAllowed(true)).toBe(true)
    expect(ownerVoiceAllowed(false)).toBe(false)
    expect(SPEC.OWNER_VOICE_ON_CLIENT_REEL).toBe(false)
    expect(SPEC.OWN_VOICE).toBe(true)
  })

  it('a house name stands in her own words, never where the agent put it', () => {
    expect(houseNameAllowed(true, true)).toBe(true)
    expect(houseNameAllowed(true, false)).toBe(true)
    expect(houseNameAllowed(false, true)).toBe(false)
    expect(houseNameAllowed(false, false)).toBe(true)
    expect(SPEC.AGENT_HOUSE_NAME_ON_CLIENT_REEL).toBe(false)
    // Agent-supplied: a line names the house and is not her own words.
    expect(agentSuppliedHouseName('ask Trinity', undefined)).toBe(true)
    expect(agentSuppliedHouseName('ask Trinity', 'say: ask Trinity')).toBe(
      false
    )
    expect(agentSuppliedHouseName('Book with Anna', undefined)).toBe(false)
    expect(agentSuppliedHouseName('Book with Anna', 'say Trinity')).toBe(false)
    // The house by name, as written and as spoken.
    expect(namesHouse(`write to ${SPEC.OWNER_CTA}`)).toBe(true)
    expect(namesHouse('T27AI_BOT')).toBe(true)
    expect(namesHouse('ask Trinity')).toBe(true)
    expect(namesHouse('спроси Тринити')).toBe(true) // cyrillic-ok: the brand as spoken
    expect(namesHouse('S³AI')).toBe(true)
    expect(namesHouse('Book a fitting with Anna')).toBe(false)
    expect(namesHouse('Запишитесь на примерку')).toBe(false) // cyrillic-ok: a client call
  })

  /*
   * Her own words, judged LINE BY LINE (crm-story-reel v22 own_words, the one
   * detector in house-names.ts): sellers address the bot by name, so her
   * message naming it lends no line the house's name. A line she typed
   * herself stands, even inside a longer script.
   */
  const OWN_WORDS = [
    // cyrillic-ok: her messages and lines as she types them
    {
      said: 'Тринити, сделай сплит-рилс',
      line: 'Это Тринити говорит',
      hers: false,
    },
    {
      said: 'Trinity, make a split reel',
      line: 'This is Trinity speaking',
      hers: false,
    },
    {
      said: 'в конце скажи: Напиши Тринити',
      line: 'Напиши Тринити',
      hers: true,
    },
    {
      said: 'at the end say: Write to Trinity',
      line: 'Write to Trinity',
      hers: true,
    },
  ]
  const scriptWith = (line: string) =>
    /[а-я]/i.test(line) // cyrillic-ok: picks the script's language
      ? `Привет, я Анна, пеку торты. ${line}` // cyrillic-ok: her script
      : `Hello, I am Anna, I bake cakes. ${line}`

  it('own words are judged line by line: naming the bot lends no line', () => {
    expect(speechLines('One. Two!\nThree? Four… five')).toEqual([
      'One.',
      'Two!',
      'Three?',
      'Four…',
      'five',
    ])
    for (const c of OWN_WORDS) {
      expect(agentSuppliedHouseName(c.line, c.said)).toBe(!c.hers)
      expect(agentSuppliedHouseName(scriptWith(c.line), c.said)).toBe(!c.hers)
      expect(
        houseNameAllowed(false, agentSuppliedHouseName(c.line, c.said))
      ).toBe(c.hers)
    }
  })

  it('split_reel refuses the agent line before spend, and lets her line through, RU and EN', async () => {
    for (const c of OWN_WORDS) {
      const paid: string[] = []
      const lookup = (name: string) => ({
        name,
        description: '',
        parameters: {},
        handler: async () => {
          paid.push(name)
          return { done: false, reason: 'stop here' }
        },
      })
      const senses = {
        length: async () => 9,
        hear: async () => ({ words: [] }),
      }
      const out: any = await makeSplitReelTool(
        lookup as never,
        senses as never
      ).handler(
        {
          image_url: 'https://ours/face.png',
          text: scriptWith(c.line),
          brolls: ['a garden'],
        },
        { telegramId: SELLER_ID, ownerSaid: c.said, pool: emptyPool() } as never
      )
      expect(out.done).toBe(false)
      // Refused: nothing paid. Hers: past the check, to the voice.
      expect(paid).toEqual(c.hers ? ['audio_generate'] : [])
    }
  }, 120_000)

  it('audio_generate refuses the agent line before spend, and lets her line through, RU and EN', async () => {
    const { TOOLS_BY_NAME } = await import('../agent/tools')
    const audio = TOOLS_BY_NAME.get('audio_generate')!
    const fetched = vi.spyOn(globalThis, 'fetch')
    try {
      for (const c of OWN_WORDS) {
        const pool = emptyPool()
        const out: any = await audio.handler(
          { text: scriptWith(c.line), voice_id: 'v-1' },
          { telegramId: SELLER_ID, ownerSaid: c.said, pool } as never
        )
        expect(out.сделано).toBe(false) // cyrillic-ok: audio_generate's own answer key
        // Refused: no debit was run. Hers: it reached the debit (her empty
        // wallet then refuses it).
        expect(pool.said.some(q => DEBIT.test(q))).toBe(c.hers)
      }
      expect(fetched).not.toHaveBeenCalled()
    } finally {
      fetched.mockRestore()
    }
  }, 120_000)

  it('a refusal comes before the charge, so a refused call costs nothing', async () => {
    expect(SPEC.REFUSED_BEFORE_SPEND).toBe(true)
    const { TOOLS_BY_NAME } = await import('../agent/tools')
    const audio = TOOLS_BY_NAME.get('audio_generate')!
    const fetched = vi.spyOn(globalThis, 'fetch')
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      // charged(true) == false, audio_generate: a seller who pays asks for a
      // lead's voice that was never cloned -- refused, and no debit was run.
      const seller = emptyPool()
      const noClone: any = await audio.handler(
        { text: 'Hello, this is Anna', for_lead: CLIENT_ID },
        { telegramId: SELLER_ID, pool: seller } as never
      )
      expect(noClone.сделано).toBe(false) // cyrillic-ok: audio_generate's own answer key
      expect(seller.said.some(q => DEBIT.test(q))).toBe(false)

      // ...and the house's sweep for leads, which only the owner's voice
      // could speak: refused before spendTokens, which for the house leaves
      // its own line ("the house does not pay itself") whenever it runs.
      const house = emptyPool()
      const sweep: any = await audio.handler({ text: 'Hello, this is Anna' }, {
        telegramId: HOUSE_ID,
        sellerSweep: true,
        pool: house,
      } as never)
      expect(sweep.сделано).toBe(false) // cyrillic-ok: audio_generate's own answer key
      expect(sweep.причина).toMatch(/for_lead/) // cyrillic-ok: audio_generate's own answer key
      const lines = logged.mock.calls.map(c => String(c[0]))
      expect(lines.some(l => /«audio_generate»/.test(l))).toBe(false)
      expect(house.said.some(q => DEBIT.test(q))).toBe(false)
      expect(fetched).not.toHaveBeenCalled()

      // charged(false) == true: a call that goes ahead is charged -- the same
      // seller naming a voice reaches the debit (her empty wallet refuses it).
      const paying = emptyPool()
      await audio.handler({ text: 'Hello, this is Anna', voice_id: 'v-1' }, {
        telegramId: SELLER_ID,
        pool: paying,
      } as never)
      expect(paying.said.some(q => DEBIT.test(q))).toBe(true)
    } finally {
      logged.mockRestore()
      fetched.mockRestore()
    }

    // split_reel: its charge is the first paid tool it calls. A refused reel
    // calls none; a reel that goes ahead calls the voice first.
    const paid: string[] = []
    const lookup = (name: string) => ({
      name,
      description: '',
      parameters: {},
      handler: async () => {
        paid.push(name)
        return { done: false, reason: 'stop here' }
      },
    })
    const senses = { length: async () => 9, hear: async () => ({ words: [] }) }
    const reel = makeSplitReelTool(lookup as never, senses as never)
    const ARGS = {
      image_url: 'https://ours/face.png',
      text: 'Hello, this is Anna ... write now',
      brolls: ['a garden'],
    }
    const pool = emptyPool()
    // Another client's reel on this client's turn.
    const other: any = await reel.handler({ ...ARGS, for_lead: '900000006' }, {
      telegramId: SELLER_ID,
      faceOf: CLIENT_ID,
      pool,
    } as never)
    expect(other.done).toBe(false)
    // A house name the agent put into a seller's reel.
    const named: any = await reel.handler(
      { ...ARGS, text: 'Hello, this is Trinity ... write now' },
      { telegramId: SELLER_ID, pool } as never
    )
    expect(named.done).toBe(false)
    expect(paid).toEqual([])
    const ahead: any = await reel.handler(ARGS, {
      telegramId: SELLER_ID,
      pool,
    } as never)
    expect(ahead.done).toBe(false)
    expect(paid).toEqual(['audio_generate'])
  }, 60_000)

  it('an ordinary caller with no voice of her own is refused before the charge', async () => {
    // The spec's vectors, against the mirror.
    expect(voiceRefused(false, false, false)).toBe(true)
    expect(voiceRefused(false, true, false)).toBe(false)
    expect(voiceRefused(false, false, true)).toBe(false)
    expect(voiceRefused(true, false, false)).toBe(false)
    expect(voiceRefused(true, true, true)).toBe(false)
    expect(SPEC.STOCK_VOICE_FOR_ORDINARY).toBe(false)
    expect(SPEC.OWN_VOICE).toBe(true)

    const { TOOLS_BY_NAME } = await import('../agent/tools')
    const audio = TOOLS_BY_NAME.get('audio_generate')!
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('no network in this test'))
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    const asked = () => fetched.mock.calls.map(c => String(c[0]))
    try {
      // voice_refused(false, false, false): a seller who names no voice and
      // has none chosen is refused -- no debit, no voice looked up anywhere.
      const seller = emptyPool()
      const bare: any = await audio.handler({ text: 'Hello, this is Anna' }, {
        telegramId: SELLER_ID,
        pool: seller,
      } as never)
      expect(bare.сделано).toBe(false) // cyrillic-ok: audio_generate's own answer key
      expect(bare.причина).toMatch(/voice_id/) // cyrillic-ok: audio_generate's own answer key
      expect(bare.причина).toMatch(/crm_voice_clone/) // cyrillic-ok: audio_generate's own answer key
      expect(seller.said.some(q => DEBIT.test(q))).toBe(false)
      expect(asked()).toEqual([])

      // charged(voice_refused(false, false, true)): her own clone, named by
      // her own id, goes ahead to the charge (her empty wallet refuses it).
      const clonedSaid: string[] = []
      const cloned = {
        said: clonedSaid,
        query: async (sql: string) => {
          clonedSaid.push(String(sql))
          return /FROM lead_voices/.test(sql)
            ? { rows: [{ voice_id: 'lead-voice_900000077', seconds: 30 }] }
            : { rows: [] }
        },
      }
      await audio.handler(
        { text: 'Hello, this is Anna', for_lead: SELLER_ID },
        {
          telegramId: SELLER_ID,
          pool: cloned,
        } as never
      )
      expect(cloned.said.some(q => DEBIT.test(q))).toBe(true)

      // voice_refused(false, true, false) == false: a named voice goes ahead.
      const named = emptyPool()
      await audio.handler({ text: 'Hello, this is Anna', voice_id: 'v-1' }, {
        telegramId: SELLER_ID,
        pool: named,
      } as never)
      expect(named.said.some(q => DEBIT.test(q))).toBe(true)

      // voice_refused(true, false, false) == false: the house keeps its own
      // path, whatever that path answers on a test machine.
      const house: any = await audio
        .handler({ text: 'Hello, this is Anna' }, {
          telegramId: HOUSE_ID,
          pool: emptyPool(),
        } as never)
        .catch((e: unknown) => ({ причина: String(e) })) // cyrillic-ok: audio_generate's own answer key
      expect(String(house.причина ?? '')).not.toMatch(/crm_voice_clone/) // cyrillic-ok: audio_generate's own answer key
      // Nobody, house or not, asks an account for a voice list.
      expect(asked().some(u => u.includes('/api/voices'))).toBe(false)
    } finally {
      logged.mockRestore()
      fetched.mockRestore()
    }
  }, 120_000)

  it('a voice too long for the format is refused from its text, before it is paid', async () => {
    // The pace is the measured one, rounded up so the estimate errs long.
    expect(
      Math.floor(
        (SPEC.MEASURED_MS + SPEC.MEASURED_CHARS - 1) / SPEC.MEASURED_CHARS
      )
    ).toBe(SPEC.MS_PER_CHAR)
    expect(Math.floor(SPEC.MEASURED_MS / SPEC.MEASURED_CHARS)).toBeLessThan(
      SPEC.MS_PER_CHAR
    )
    expect(textFits(SPEC.MEASURED_CHARS, 0)).toBe(false)
    // The boundary: 214 characters fit, 215 do not.
    expect(speechMsEstimate(214, 0)).toBe(11984)
    expect(textFits(214, 0)).toBe(true)
    expect(speechMsEstimate(215, 0)).toBe(12040)
    expect(textFits(215, 0)).toBe(false)
    expect(textFits(0, 0)).toBe(true)
    // Characters as the pace was measured: words joined by single spaces.
    expect(speechChars('  one  two\n three ')).toBe(13)

    // split_reel: a text past the boundary calls no paid tool; one at it
    // goes ahead to the voice. Runs of spaces count as one, as measured.
    const paid: string[] = []
    const lookup = (name: string) => ({
      name,
      description: '',
      parameters: {},
      handler: async () => {
        paid.push(name)
        return { done: false, reason: 'stop here' }
      },
    })
    const senses = { length: async () => 9, hear: async () => ({ words: [] }) }
    const reel = makeSplitReelTool(lookup as never, senses as never)
    const fits = 'word '.repeat(43).trim()
    expect(speechChars(fits)).toBe(214)
    const ARGS = { image_url: 'https://ours/face.png', brolls: ['a garden'] }
    const ctx = { telegramId: SELLER_ID, pool: emptyPool() } as never
    const long: any = await reel.handler({ ...ARGS, text: `${fits}s` }, ctx)
    expect(long.done).toBe(false)
    expect(long.reason).toMatch(new RegExp(`${SPEC.SPEECH_MAX_SECONDS} с`)) // cyrillic-ok: the tool's own unit
    expect(paid).toEqual([])
    const spaced: any = await reel.handler(
      { ...ARGS, text: fits.replace(/ /g, '   ') },
      ctx
    )
    expect(spaced.done).toBe(false)
    expect(paid).toEqual(['audio_generate'])
  }, 60_000)

  it('a voice refused for its length after it is paid is given back, once', async () => {
    // The spec's vectors, against the mirror.
    expect(voiceTooLong(12001)).toBe(true)
    expect(voiceTooLong(12000)).toBe(false)
    expect(backstopRefund(true, 12001, 10)).toBe(10)
    expect(backstopRefund(true, 14500, 37)).toBe(37)
    expect(backstopRefund(true, 12000, 10)).toBe(0)
    expect(backstopRefund(false, 14500, 10)).toBe(0)
    expect(backstopRefund(true, 14500, 0)).toBe(0)
    expect(textFits(214, 0)).toBe(true)
    expect(SPEC.REFUND_TOO_LONG_VOICE).toBe(true)
    expect(SPEC.REFUSED_BEFORE_SPEND).toBe(true)
    // split_reel measures seconds; the spec's ceiling is in milliseconds.
    expect(voiceTooLong(msOfSeconds(SPEC.SPEECH_MAX_SECONDS))).toBe(false)
    expect(voiceTooLong(msOfSeconds(12.0001))).toBe(true)

    // audio_generate's answer: the url, the length, and what the charge took.
    const VOICE = 'https://ours/v.mp3'
    let seconds = 13
    let spent: number | null = 10
    const paid: string[] = []
    const lookup = (name: string) => ({
      name,
      description: '',
      parameters: {},
      handler: async () => {
        paid.push(name)
        if (name !== 'audio_generate')
          return { done: false, reason: 'stop here' }
        return {
          сделано: true, // cyrillic-ok: audio_generate's own answer keys
          url: VOICE,
          seconds,
          ...(spent === null ? {} : { токены: { потрачено: spent } }), // cyrillic-ok: audio_generate's own answer keys
        }
      },
    })
    let sensed = 13
    const senses = {
      length: async () => sensed,
      hear: async () => ({ words: [] }),
    }
    const reel = makeSplitReelTool(lookup as never, senses as never)
    const ARGS = {
      image_url: 'https://ours/face.png',
      brolls: ['a garden'],
      text: 'word '.repeat(30).trim(),
    }
    const run = async (who: string, args: object = ARGS) => {
      const pool = tokenLedger()
      paid.length = 0
      const r: any = await reel.handler(args, {
        telegramId: who,
        pool,
      } as never)
      return { r, pool }
    }
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      // Paid here, measured past the ceiling: the exact sum comes back, and
      // nothing after the voice is ordered.
      const paidHere = await run(SELLER_ID)
      expect(paidHere.r.done).toBe(false)
      expect(paidHere.r.voice_url).toBeUndefined()
      expect(paidHere.r.reason).toMatch(/; 10 ток\. за этот голос возвращены$/) // cyrillic-ok: the tool's own words
      // A voice given back is not offered again (v9): its url is not in
      // the answer at all.
      expect(paidHere.r.reason).not.toContain(VOICE)
      expect(JSON.stringify(paidHere.r)).not.toContain(VOICE)
      expect(paid).toEqual(['audio_generate'])
      expect(paidHere.pool.credits()).toEqual([10])
      expect(paidHere.pool.refunds()).toEqual([`split-reel-too-long:${VOICE}`])
      // Once: the same voice again finds its reference taken, and the
      // answer does not claim a refund that did not happen.
      const again: any = await reel.handler(ARGS, {
        telegramId: SELLER_ID,
        pool: paidHere.pool,
      } as never)
      expect(again.reason).not.toMatch(/возвращены/) // cyrillic-ok: the tool's own words
      // Not given back this time, so the voice is still the agent's to see.
      expect(again.reason).toContain(VOICE)
      expect(paidHere.pool.credits()).toEqual([10])

      // A voice passed back from an earlier call was not paid for here.
      const passed = await run(SELLER_ID, { ...ARGS, voice_url: VOICE })
      expect(passed.r.reason).toMatch(/13\.0 с/) // cyrillic-ok: the tool's own unit
      expect(paid).toEqual([])
      expect(passed.pool.credits()).toEqual([])

      // A voice that fits goes on to the stills; nothing comes back.
      seconds = 9
      const fits = await run(SELLER_ID)
      expect(paid[0]).toBe('audio_generate')
      expect(paid).toContain('image_edit')
      expect(fits.pool.credits()).toEqual([])

      // The house: charged nothing, so its receipt names nothing -- and a
      // receipt that named a sum still gives the house nothing.
      seconds = 13
      spent = null
      const house = await run(HOUSE_ID)
      expect(paid).toEqual(['audio_generate'])
      expect(house.pool.credits()).toEqual([])
      spent = 10
      expect((await run(HOUSE_ID)).pool.credits()).toEqual([])

      // A voice that cannot be measured is kept, not refused for its length.
      seconds = 0
      sensed = 0
      const deaf = await run(SELLER_ID)
      expect(deaf.r.voice_url).toBe(VOICE)
      expect(deaf.pool.credits()).toEqual([])

      // Refused from its text: nothing charged, nothing given back.
      const ahead = await run(SELLER_ID, {
        ...ARGS,
        text: 'word '.repeat(44).trim(),
      })
      expect(paid).toEqual([])
      expect(ahead.pool.credits()).toEqual([])
    } finally {
      logged.mockRestore()
    }
  }, 60_000)

  it('a voice is held to its own slowest measured pace before it is paid', async () => {
    expect(SPEC.PACE_PER_VOICE).toBe(true)
    // A voice never measured is judged at MS_PER_CHAR.
    expect(paceFor(0)).toBe(SPEC.MS_PER_CHAR)
    // A voice once measured at 70 ms a unit is judged at 70.
    expect(paceFor(70)).toBe(70)
    expect(speechMsEstimate(171, 70)).toBe(11970)
    expect(textFits(171, 70)).toBe(true)
    expect(speechMsEstimate(172, 70)).toBe(12040)
    expect(textFits(172, 70)).toBe(false)
    expect(textFits(200, 0)).toBe(true)
    expect(textFits(200, 70)).toBe(false)
    // A quicker voice does not stretch the ceiling.
    expect(paceFor(40)).toBe(SPEC.MS_PER_CHAR)
    expect(textFits(214, 40)).toBe(true)
    expect(textFits(215, 40)).toBe(false)
    expect(paceToKeep(0, 14000, 200)).toBe(70)
    expect(textFits(200, paceToKeep(0, 14000, 200))).toBe(false)
    expect(backstopRefund(true, 14000, 12)).toBe(12)

    // split_reel on a client's turn: the seller's clone of her speaks. The
    // wallet is the seller's (ctx.telegramId); the pace is the VOICE's.
    const OTHER_ID = '900000006'
    const rows: VoiceRow[] = [
      { owner: SELLER_ID, lead: CLIENT_ID, voice: 'lead-voice_A', pace: null },
      { owner: SELLER_ID, lead: OTHER_ID, voice: 'lead-voice_B', pace: null },
    ]
    const pool = voiceBook(rows)
    const VOICE = 'https://ours/held.mp3'
    const voice = { url: VOICE, seconds: 14, spent: 12 }
    const { paid, reel } = heldReel(voice)
    const text = `${'word '.repeat(40).trim()}.`
    expect(speechUnits(text)).toBe(200)
    const onTurnOf = (faceOf: string) =>
      ({ telegramId: SELLER_ID, pool, faceOf }) as never
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      // Never measured, so judged at MS_PER_CHAR: paid, measured at 14 s,
      // given back -- and the voice's row now keeps 70.
      const first: any = await reel.handler(
        { ...REEL_ARGS, text },
        onTurnOf(CLIENT_ID)
      )
      expect(paid).toEqual(['audio_generate'])
      expect(first.reason).toMatch(/; 12 ток\. за этот голос возвращены$/) // cyrillic-ok: the tool's own words
      expect(JSON.stringify(first)).not.toContain(VOICE)
      expect(pool.credits()).toEqual([12])
      expect(rows.map(r => r.pace)).toEqual([70, null])

      // The same text for the same voice: refused from its text, unpaid.
      paid.length = 0
      const again: any = await reel.handler(
        { ...REEL_ARGS, text },
        onTurnOf(CLIENT_ID)
      )
      expect(again.done).toBe(false)
      expect(again.reason).toMatch(/^text на ~14 с речи/) // cyrillic-ok: the tool's own words
      expect(paid).toEqual([])
      expect(pool.credits()).toEqual([12])

      // Her own reel, ordered by herself: the same clone, the same pace.
      const herself: any = await reel.handler(
        { ...REEL_ARGS, text, for_lead: CLIENT_ID },
        { telegramId: CLIENT_ID, pool } as never
      )
      expect(herself.reason).toMatch(/^text на ~14 с речи/) // cyrillic-ok: the tool's own words
      expect(paid).toEqual([])

      // A text short enough for 70 ms a unit still goes ahead for her.
      voice.seconds = 9
      const shorter = `${'word '.repeat(34).trim()}.`
      expect(speechUnits(shorter)).toBe(170)
      await reel.handler({ ...REEL_ARGS, text: shorter }, onTurnOf(CLIENT_ID))
      expect(paid[0]).toBe('audio_generate')

      // Another client's clone was never measured: the same 200 go ahead.
      paid.length = 0
      await reel.handler({ ...REEL_ARGS, text }, onTurnOf(OTHER_ID))
      expect(paid[0]).toBe('audio_generate')
      expect(rows[0].pace).toBe(70)
      expect(pool.credits()).toEqual([12])
    } finally {
      logged.mockRestore()
    }
  }, 60_000)

  it('a voice keeps the slowest pace it was ever measured at', async () => {
    expect(measuredPace(SPEC.MEASURED_MS, SPEC.MEASURED_CHARS)).toBe(
      SPEC.MS_PER_CHAR
    )
    // Rounded up, so the pace errs long.
    expect(measuredPace(12001, 214)).toBe(57)
    expect(measuredPace(14000, 200)).toBe(70)
    expect(measuredPace(5000, 0)).toBe(0)
    // Slowest wins, in either order.
    expect(slowestPace(70, 60)).toBe(70)
    expect(slowestPace(60, 70)).toBe(70)
    expect(slowestPace(0, 57)).toBe(57)
    expect(paceToKeep(80, 14000, 200)).toBe(80)
    expect(paceToKeep(60, 14000, 200)).toBe(70)
    // A text too short to measure keeps what was kept.
    // Half the ceiling at MS_PER_CHAR, in the spec's integer division.
    expect(SPEC.MIN_PACE_UNITS * 2).toBe(
      Math.floor((SPEC.SPEECH_MAX_SECONDS * 1000) / SPEC.MS_PER_CHAR)
    )
    expect(paceToKeep(0, 1200, 10)).toBe(0)
    expect(paceToKeep(0, 9000, SPEC.MIN_PACE_UNITS - 1)).toBe(0)
    expect(paceToKeep(0, 9000, SPEC.MIN_PACE_UNITS)).toBe(85)

    // The row, through lead-voice.ts's own statements.
    const rows: VoiceRow[] = [
      { owner: SELLER_ID, lead: CLIENT_ID, voice: 'lead-voice_A', pace: 70 },
    ]
    const pool = voiceBook(rows)
    await keepVoicePace(pool as never, 'lead-voice_A', 60)
    expect(await voicePaceOf(pool as never, 'lead-voice_A')).toBe(70)
    await keepVoicePace(pool as never, 'lead-voice_A', 80)
    expect(await voicePaceOf(pool as never, 'lead-voice_A')).toBe(80)
    // Read by the voice: the caller's id names no voice.
    expect(await voicePaceOf(pool as never, SELLER_ID)).toBe(0)
    expect(await voicePaceOf(pool as never, 'lead-voice_none')).toBe(0)

    // A clone made again is a new voice: its row starts unmeasured.
    const said: string[] = []
    await saveLeadVoice(
      { query: async (q: string) => (said.push(q), { rows: [] }) },
      {
        owner: SELLER_ID,
        lead: CLIENT_ID,
        voiceId: 'lead-voice_A2',
        seconds: 30,
        sourceUrl: 'https://ours/notes.ogg',
      }
    )
    expect(said.at(-1)).toMatch(
      /ms_per_char = CASE WHEN lead_voices\.voice_id = EXCLUDED\.voice_id\s+THEN lead_voices\.ms_per_char END/
    )

    // split_reel: a quicker reel later does not speed the voice up, and a
    // short text paid and measured does not set a pace at all.
    const { reel } = heldReel({
      url: 'https://ours/v.mp3',
      seconds: 9,
      spent: 5,
    })
    const onTurn = { telegramId: SELLER_ID, pool, faceOf: CLIENT_ID } as never
    const logged = vi.spyOn(console, 'log').mockImplementation(() => {})
    try {
      rows[0].pace = 70
      const quicker = `${'word '.repeat(34).trim()}.`
      await reel.handler({ ...REEL_ARGS, text: quicker }, onTurn)
      expect(rows[0].pace).toBe(70)
      rows[0].pace = null
      await reel.handler({ ...REEL_ARGS, text: 'Hello there.' }, onTurn)
      expect(rows[0].pace).toBeNull()
      // A text long enough to measure sets it: 9000 ms over 170 units.
      await reel.handler({ ...REEL_ARGS, text: quicker }, onTurn)
      expect(rows[0].pace).toBe(measuredPace(9000, 170))
    } finally {
      logged.mockRestore()
    }
  }, 60_000)

  it("a voice's pace is kept on its own row and never on another voice", async () => {
    expect(SPEC.PACE_ON_OTHER_VOICES).toBe(false)
    // row_pace_after, through lead-voice.ts's own statement: split_reel keeps
    // paceToKeep(kept, ms, units) on the measured voice with keepVoicePace.
    // B is another client of the same seller, C another seller's clone.
    const rows: VoiceRow[] = [
      { owner: SELLER_ID, lead: CLIENT_ID, voice: 'lead-voice_A', pace: null },
      {
        owner: SELLER_ID,
        lead: '900000006',
        voice: 'lead-voice_B',
        pace: null,
      },
      {
        owner: '900000078',
        lead: '900000008',
        voice: 'lead-voice_C',
        pace: 60,
      },
    ]
    const pool = voiceBook(rows)
    // Voice A paid for 200 units over 14000 ms: its row, never measured, keeps 70.
    await keepVoicePace(
      pool as never,
      'lead-voice_A',
      paceToKeep(0, 14000, 200)
    )
    expect(rows[0].pace).toBe(70)
    // Voice B, never measured, still has no pace: A's 70 does not land on it.
    expect(rows[1].pace).toBeNull()
    const paceB = await voicePaceOf(pool as never, 'lead-voice_B')
    expect(paceB).toBe(0)
    expect(textFits(200, paceB)).toBe(true)
    // Voice C, measured at 60, keeps 60: A's slower pace does not land on it.
    expect(rows[2].pace).toBe(60)
    expect(await voicePaceOf(pool as never, 'lead-voice_C')).toBe(60)
    // A already at 80, measured at 70: it keeps 80, and the others stay.
    rows[0].pace = 80
    await keepVoicePace(
      pool as never,
      'lead-voice_A',
      paceToKeep(80, 14000, 200)
    )
    expect(rows.map(r => r.pace)).toEqual([80, null, 60])

    // The fake can see the leak it guards against: handed a WHERE that also
    // names the never-measured rows, it writes A's pace onto B, as Postgres
    // would -- so a statement that did so here would turn this test red.
    const leak = voiceBook([
      { owner: SELLER_ID, lead: CLIENT_ID, voice: 'lead-voice_A', pace: null },
      {
        owner: SELLER_ID,
        lead: '900000006',
        voice: 'lead-voice_B',
        pace: null,
      },
    ])
    await leak.query(
      `UPDATE lead_voices SET ms_per_char = GREATEST(COALESCE(ms_per_char, 0), $2)
        WHERE voice_id = $1 OR ms_per_char IS NULL`,
      ['lead-voice_A', 70]
    )
    expect(leak.rows.map(r => r.pace)).toEqual([70, 70])
    await expect(
      leak.query(
        `UPDATE lead_voices SET ms_per_char = $2 WHERE lower(username) = $1`,
        ['x', 1]
      )
    ).rejects.toThrow(/a condition the fake does not know/)
  })

  it('a digit or a syllable character weighs more than a letter', async () => {
    expect(speechUnitsOf(SPEC.MEASURED_CHARS, 0, 0)).toBe(SPEC.MEASURED_CHARS)
    expect(speechUnitsOf(150, 20, 0)).toBe(230)
    expect(speechUnitsOf(0, 0, 60)).toBe(240)
    expect(textFits(150 + 20, 0)).toBe(true)
    expect(textFits(speechUnitsOf(150, 20, 0), 0)).toBe(false)
    expect(textFits(speechUnitsOf(0, 0, 53), 0)).toBe(true)
    expect(textFits(speechUnitsOf(0, 0, 54), 0)).toBe(false)
    expect(textFits(54, 0)).toBe(true)
    expect(SPEC.PLAIN_CHAR_WEIGHT).toBe(1)
    expect(SPEC.DIGIT_WEIGHT).toBeGreaterThan(SPEC.PLAIN_CHAR_WEIGHT)
    expect(SPEC.WIDE_CHAR_WEIGHT).toBeGreaterThan(SPEC.PLAIN_CHAR_WEIGHT)

    // The host counts a text the way the spec weighs it.
    const digits = `${'word '.repeat(30)}${'1'.repeat(20)}`
    expect(speechChars(digits)).toBe(170)
    expect(speechUnits(digits)).toBe(speechUnitsOf(150, 20, 0))
    const latin = 'word '.repeat(43).trim()
    expect(speechUnits(latin)).toBe(speechChars(latin))
    expect(speechUnits('Цена 1500 ₽')).toBe(speechUnitsOf(7, 4, 0)) // cyrillic-ok: a Cyrillic letter weighs one
    expect(speechUnits('٣')).toBe(SPEC.DIGIT_WEIGHT)
    expect(speechUnits('中の카')).toBe(speechUnitsOf(0, 0, 3))
    expect(speechUnits('α'.repeat(54))).toBe(54)

    // split_reel refuses the heavy texts before it pays; the light ones go.
    const { paid, reel } = heldReel({
      url: 'https://ours/v.mp3',
      seconds: 9,
      spent: 5,
    })
    const ctx = { telegramId: SELLER_ID, pool: tokenLedger() } as never
    const goes = async (text: string) => {
      paid.length = 0
      await reel.handler({ ...REEL_ARGS, text }, ctx)
      return paid[0] === 'audio_generate'
    }
    expect(await goes(digits)).toBe(false)
    expect(await goes('a'.repeat(170))).toBe(true)
    expect(await goes('の'.repeat(54))).toBe(false)
    expect(await goes('の'.repeat(53))).toBe(true)
    expect(await goes('α'.repeat(54))).toBe(true)
  }, 60_000)

  it('a client with no palette gets the neutral call colour, not the house gold', async () => {
    expect(callColourFrom(false, false, false, false)).toBe(SPEC.CTA_NEUTRAL)
    expect(callColourFrom(false, false, false, false)).not.toBe(SPEC.CTA_OWNER)
    expect(SPEC.NEUTRAL_CALL_COLOR).toBe('#FFFFFF')
    expect(SPEC.HOUSE_CALL_COLOR).toBe('#FFD700')
    // One gold: the house's call colour is the story reel's default call.
    expect(SPEC.HOUSE_CALL_COLOR).toBe(STORY_DEFAULT_TITLE)
    expect(
      callColourFrom(houseOwn(false, false, false, false), false, false, false)
    ).toBe(SPEC.CTA_NEUTRAL)
    expect(
      callColourFrom(houseOwn(true, false, true, false), false, false, false)
    ).toBe(SPEC.CTA_NEUTRAL)
    expect(
      callColourFrom(houseOwn(true, false, true, false), false, false, true)
    ).toBe(SPEC.CTA_CLIENT)
    // In colours, and as the planner hands them to the composition.
    expect(reelCallColour({ house: false })).toEqual({
      colour: SPEC.NEUTRAL_CALL_COLOR,
      from: SPEC.CTA_NEUTRAL,
    })
    const props = splitReelProps({
      lipSyncVideo: 'x',
      seconds: 5,
      call: { house: false, neutral: NEUTRAL },
    })
    expect(props.ctaColor).toBe(SPEC.NEUTRAL_CALL_COLOR)
    expect(SplitTalkingHeadSchema.safeParse(props).success).toBe(true)
    // Through split_reel: her turn, her seller's own reel, a client named on
    // the house's turn, the house's turn with a client -- none is the gold.
    for (const [args, turn] of [
      [{}, HER_TURN],
      [{}, { telegramId: SELLER_ID }],
      [{ for_lead: CLIENT_ID }, { telegramId: HOUSE_ID }],
      [{}, { telegramId: HOUSE_ID, faceOf: CLIENT_ID }],
    ] as const) {
      const { out, colour } = await drawnCall(args, turn)
      expect(out.done).toBe(true)
      expect(colour).toBe(SPEC.NEUTRAL_CALL_COLOR)
    }
  }, 60_000)

  it("a client reel's call is drawn in the order's colour, else hers", async () => {
    expect(callColourFrom(false, false, false, true)).toBe(SPEC.CTA_CLIENT)
    expect(callColourFrom(false, true, false, true)).toBe(SPEC.CTA_GIVEN)
    expect(callColourFrom(false, true, false, false)).toBe(SPEC.CTA_GIVEN)
    expect(callColourFrom(false, true, true, true)).toBe(SPEC.CTA_CLIENT)
    expect(callColourFrom(false, true, true, false)).toBe(SPEC.CTA_NEUTRAL)
    expect(callColourFrom(false, true, true, true)).toBe(
      ctaFor(false, true, true, true)
    )
    expect(callColourFrom(false, false, false, false)).toBe(
      ctaFor(false, false, false, false)
    )
    // In colours.
    const hers = { house: false, hers: '#e8a0bf' }
    expect(reelCallColour(hers).colour).toBe('#e8a0bf')
    expect(reelCallColour({ ...hers, given: '#7fd1ae' }).colour).toBe('#7fd1ae')
    expect(
      reelCallColour({ ...hers, given: '#ffd700', givenIsHouse: true }).colour
    ).toBe('#e8a0bf')
    expect(
      reelCallColour({ house: false, given: '#ffd700', givenIsHouse: true })
        .colour
    ).toBe(SPEC.NEUTRAL_CALL_COLOR)
    // Through split_reel: her profile's colour; the card her seller keeps for
    // her over it; the order's over both. One spelling: #rrggbb, lower case.
    const profile = { visual: { gold_title: '#E8A0BF' } }
    const kept = { title: '#a0d8ef' }
    expect((await drawnCall({}, HER_TURN, { profile })).colour).toBe('#e8a0bf')
    expect((await drawnCall({}, HER_TURN, { profile, kept })).colour).toBe(
      '#a0d8ef'
    )
    expect(
      (await drawnCall({ cta_color: '#7FD1AE' }, HER_TURN, { profile, kept }))
        .colour
    ).toBe('#7fd1ae')
    // The house's gold handed in for her reel: hers stands, else neutral.
    expect(
      (await drawnCall({ cta_color: '#FFD700' }, HER_TURN, { profile })).colour
    ).toBe('#e8a0bf')
    expect((await drawnCall({ cta_color: '#ffd700' }, HER_TURN)).colour).toBe(
      SPEC.NEUTRAL_CALL_COLOR
    )
    // Gold in HER own palette is hers, and stands.
    expect(
      (
        await drawnCall({}, HER_TURN, {
          profile: { visual: { gold_title: '#FFD700' } },
        })
      ).colour
    ).toBe('#ffd700')
  }, 60_000)

  it('the house own reel keeps its gold', async () => {
    expect(callColourFrom(true, false, false, false)).toBe(SPEC.CTA_OWNER)
    expect(callColourFrom(true, false, false, true)).toBe(SPEC.CTA_OWNER)
    expect(callColourFrom(true, true, false, false)).toBe(SPEC.CTA_GIVEN)
    expect(callColourFrom(true, true, true, false)).toBe(SPEC.CTA_GIVEN)
    expect(
      callColourFrom(houseOwn(true, false, false, false), false, false, false)
    ).toBe(SPEC.CTA_OWNER)
    expect(reelCallColour({ house: true }).colour).toBe(SPEC.HOUSE_CALL_COLOR)
    expect(
      splitReelProps({ lipSyncVideo: 'x', seconds: 5, call: HOUSE_CALL })
        .ctaColor
    ).toBe(SPEC.HOUSE_CALL_COLOR)
    const own = await drawnCall({}, { telegramId: HOUSE_ID })
    expect(own.out.done).toBe(true)
    expect(own.colour).toBe(SPEC.HOUSE_CALL_COLOR)
    // The house may give its own colour, its gold included.
    expect(
      (await drawnCall({ cta_color: '#a0d8ef' }, { telegramId: HOUSE_ID }))
        .colour
    ).toBe('#a0d8ef')
    expect(
      (await drawnCall({ cta_color: '#FFD700' }, { telegramId: HOUSE_ID }))
        .colour
    ).toBe('#ffd700')
  }, 60_000)

  it("a call colour that does not read: the order's is refused before the charge, hers is shaded", async () => {
    for (const from of [
      SPEC.CTA_GIVEN,
      SPEC.CTA_CLIENT,
      SPEC.CTA_OWNER,
      SPEC.CTA_NEUTRAL,
    ])
      expect(callDrawn(from, true)).toBe(SPEC.CALL_AS_IS)
    expect(callDrawn(SPEC.CTA_GIVEN, false)).toBe(SPEC.CALL_REFUSED)
    expect(callDrawn(SPEC.CTA_CLIENT, false)).toBe(SPEC.CALL_SHADE)
    expect(SPEC.GIVEN_CALL_COLOR_UNREADABLE_REFUSED).toBe(true)
    expect(SPEC.REFUSED_BEFORE_SPEND).toBe(true)
    // Read by the story reel's own check, on the ground under the call.
    expect(SPEC.CALL_GROUND).toBe('#000000')
    expect(callReads(SPEC.NEUTRAL_CALL_COLOR)).toBe(true)
    expect(callReads(SPEC.HOUSE_CALL_COLOR)).toBe(true)
    expect(callReads('#10182a')).toBe(false)
    const shade = readableShade('#10182a', SPEC.CALL_GROUND)
    expect(callReads(shade)).toBe(true)
    // The order's colour that does not read: refused, nothing paid, and the
    // refusal names the shade that reads.
    const refused = await drawnCall({ cta_color: '#10182a' }, HER_TURN)
    expect(refused.out.done).toBe(false)
    expect(refused.out.reason).toMatch(/^cta_color: /)
    expect(refused.out.reason).toContain(shade)
    expect(refused.paid).toEqual([])
    // A colour that is no #hex at all: refused the same way, for free.
    const bad = await drawnCall({ cta_color: 'gold' }, HER_TURN)
    expect(bad.out.done).toBe(false)
    expect(bad.out.reason).toMatch(/^cta_color: /)
    expect(bad.paid).toEqual([])
    // Hers, as dark: drawn in its shade that reads, and the reel goes ahead.
    const shaded = await drawnCall({}, HER_TURN, {
      profile: { visual: { gold_title: '#10182a' } },
    })
    expect(shaded.out.done).toBe(true)
    expect(shaded.colour).toBe(shade)
    expect(shaded.paid).toContain('reel_render')
  }, 60_000)

  it('the version is the last dated note', () => {
    const spec = readFileSync(join(__dirname, 'split-reel.t27'), 'utf8')
    const notes = [...spec.matchAll(/^\/\/ v(\d+) \(/gm)].map(m => Number(m[1]))
    expect(SPEC.VERSION).toBe(10)
    expect(Math.max(...notes)).toBe(SPEC.VERSION)
  })

  it('b-roll goes to the split shots in turn, video or still by its name', () => {
    const s = splitSegments(450, ['https://x/a.mp4', 'https://x/b.jpg'])
    const splits = s.filter(x => x.type === 'split')
    expect(splits.map(x => x.bRollType)).toEqual(['video', 'image', 'video'])
    expect(s.filter(x => x.type === 'fullscreen').every(x => !x.bRollUrl)).toBe(
      true
    )
  })
})

describe('reel_analyze reads the reference reel back into the spec', () => {
  // The cuts measured on the owner's reference reel, 2026-10-02.
  const stderr = [1.9, 1.93, 5.9, 7.4, 11.4, 12.9, 14.7]
    .map(t => `[Parsed_showinfo_1] n:0 pts:1 pts_time:${t} duration:1`)
    .join('\n')

  it('a url the model chose goes through the guarded door, or nowhere', async () => {
    // Decided before any socket opens: an internal name, the cloud metadata
    // address, a port an internal service answers on. The answer names no
    // status, so it says nothing about which internal address is alive.
    for (const url of [
      'http://vibee-render.railway.internal/reel.mp4',
      'http://169.254.169.254/latest/meta-data/',
      'http://example.com:5432/reel.mp4',
    ]) {
      const r = await analyzeReel(url)
      expect(r.ok).toBe(false)
      expect(String(r.why)).not.toMatch(/download|HTTP/)
    }
  })

  it('one cut per change, a flicker after it is the same cut', () => {
    expect(parseSceneCuts(stderr)).toEqual([1.9, 5.9, 7.4, 11.4, 12.9, 14.7])
  })

  it('the reference reel has the spec rhythm', () => {
    const shots = shotsFromCuts(parseSceneCuts(stderr), 14.97, 30)
    expect(shots.map(s => s.durationFrames)).toEqual([
      57, 120, 45, 120, 45, 54, 8,
    ])
    const r = rhythmAgainstSpec(
      shots.slice(0, 6).map((s, i) => ({
        type: i % 2 ? 'split' : 'fullscreen',
        durationFrames: s.durationFrames,
      }))
    )
    expect(r.matches).toBe(true)
  })

  it('the vision answer becomes a layout', () => {
    expect(parseShotVerdict('SPLIT. Superman flying').type).toBe('split')
    expect(parseShotVerdict('Full: a man with headphones').shows).toBe(
      'a man with headphones'
    )
    expect(parseShotVerdict(null).type).toBe('unknown')
  })
})
