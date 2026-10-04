import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as SPEC from './split-reel.gen'
import { PAUSE_SEC as STORY_PAUSE_SEC } from './crm-story-reel.gen'
import { SplitTalkingHeadSchema } from '../compositions/SplitTalkingHead'
import {
  agentSuppliedHouseName,
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
  objectPosPct,
  ownerVoiceAllowed,
  reelCta,
  reelFrames,
  splitReelProps,
  speechFrames,
  speechLines,
  splitSegments,
  STUDIO_FACE,
} from '../split-reel-plan'
import { namesHouse } from '../house-names'
import {
  analyzeReel,
  parseSceneCuts,
  parseShotVerdict,
  rhythmAgainstSpec,
  shotsFromCuts,
} from '../agent/reel-analyze'
import { makeSplitReelTool } from '../agent/split-reel-tool'

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

  it('the version is the last dated note', () => {
    const spec = readFileSync(join(__dirname, 'split-reel.t27'), 'utf8')
    const notes = [...spec.matchAll(/^\/\/ v(\d+) \(/gm)].map(m => Number(m[1]))
    expect(SPEC.VERSION).toBe(7)
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
