/**
 * THE SPLIT REEL, CUT FROM ITS SPEC.
 *
 * gHashTag/t27 specs/automation/split-reel.t27 holds the rhythm (the face
 * first, then split and full by turns), the caption colour and the ceiling;
 * this file only turns those numbers into the `segments` and props the
 * Remotion composition SplitTalkingHead takes. Nothing here restates a
 * number: change the spec, regenerate split-reel.gen.ts, and every reel
 * follows. The spec's own vectors run against this file in
 * spec/split-reel.test.ts.
 */
import * as SPEC from './spec/split-reel.gen'
import { houseNameByAgent, namesHouse } from './house-names'

export interface SplitSegment {
  type: 'split' | 'fullscreen'
  startFrame: number
  durationFrames: number
  bRollUrl?: string
  bRollType?: 'video' | 'image'
}

/** The cuts of a reel this many frames long, b-roll handed out in turn. */
export function splitSegments(
  totalFrames: number,
  bRolls: readonly string[] = []
): SplitSegment[] {
  const total = Math.max(1, Math.round(totalFrames))
  const out: SplitSegment[] = []
  let at = 0
  let split = 0
  const push = (type: SplitSegment['type'], want: number) => {
    const durationFrames = Math.min(want, total - at)
    if (durationFrames <= 0) return
    const seg: SplitSegment = { type, startFrame: at, durationFrames }
    if (type === 'split' && bRolls.length) {
      const url = bRolls[split % bRolls.length]
      seg.bRollUrl = url
      seg.bRollType = /\.(mp4|mov|webm)(\?|$)/i.test(url) ? 'video' : 'image'
      split += 1
    }
    out.push(seg)
    at += durationFrames
  }
  push('fullscreen', SPEC.OPEN_FULL_FRAMES)
  while (at < total) {
    push('split', SPEC.SPLIT_FRAMES)
    push('fullscreen', SPEC.FULL_FRAMES)
  }
  // A tail shorter than a second is a flash nobody can read: it joins the shot before it.
  const last = out[out.length - 1]
  if (out.length > 1 && last.durationFrames < SPEC.MIN_SHOT_FRAMES) {
    out.pop()
    out[out.length - 1].durationFrames += last.durationFrames
  }
  return out
}

/** Frames of a voice this many seconds long, clipped to the spec's ceiling. */
export function framesForSeconds(seconds: number): number {
  const s = Math.min(Math.max(0, seconds), SPEC.MAX_SECONDS)
  return Math.max(1, Math.round(s * SPEC.FPS))
}

/** Where the face is in the lipsync, in its own pixels (centre of the face). */
export interface FaceInSource {
  cx: number
  cy: number
  srcW: number
  srcH: number
  /** Height of the face box (Haar, brow to chin), when it was measured. */
  h?: number
}

/**
 * The studio's face when nothing was measured: SPEC.STUDIO_FACE_*_PCT of a
 * 9:16 frame. Percentages, so the source resolution does not matter.
 */
export const STUDIO_FACE: FaceInSource = {
  cx: (1080 * SPEC.STUDIO_FACE_X_PCT) / 100,
  cy: (1920 * SPEC.STUDIO_FACE_Y_PCT) / 100,
  srcW: 1080,
  srcH: 1920,
}

/** split-reel.t27 `object_pos_pct`, in the spec's own integer arithmetic. */
export function objectPosPct(
  face: number,
  rendered: number,
  window: number,
  target: number
): number {
  if (rendered <= window) return 50
  if (face * 100 <= window * target) return 0
  return Math.min(
    100,
    Math.floor((face * 100 - window * target) / (rendered - window))
  )
}

/** split-reel.t27 `face_target_y_pct`: the middle, or lower for a big face. */
export function faceTargetYPct(boxPct: number): number {
  const need = boxPct + SPEC.HEADROOM_AIM_PCT
  if (need <= SPEC.FACE_CENTER_Y_PCT) return SPEC.FACE_CENTER_Y_PCT
  const lowest = SPEC.FACE_CENTER_Y_PCT + SPEC.FACE_OFF_CENTER_MAX_PCT
  return need > lowest ? lowest : need
}

/**
 * CSS object-position for an `object-fit: cover` video in a boxW x boxH window
 * that puts the face at SPEC.FACE_CENTER_*_PCT of the window, or lower when the
 * measured face box would leave its skull at the window's top edge (spec v6).
 */
export function faceObjectPosition(
  face: FaceInSource,
  boxW: number,
  boxH: number
): string {
  const scale = Math.max(boxW / face.srcW, boxH / face.srcH)
  const x = objectPosPct(
    Math.round(face.cx * scale),
    Math.round(face.srcW * scale),
    boxW,
    SPEC.FACE_CENTER_X_PCT
  )
  const rendered = Math.round(face.srcH * scale)
  const target =
    face.h && rendered > boxH
      ? faceTargetYPct(Math.ceil((face.h * scale * 100) / boxH))
      : SPEC.FACE_CENTER_Y_PCT
  const y = objectPosPct(Math.round(face.cy * scale), rendered, boxH, target)
  return `${x}% ${y}%`
}

/** A whisper word (verbose_json, word granularity), seconds. */
export interface SpokenWord {
  word: string
  start: number
  end: number
}

/**
 * Captions from the words of the FINAL voice -- the file the reel plays --
 * shifted by the measured audio offset (`tri reel-check`). Never carry
 * captions over from an earlier cut of the voice (split-reel.t27 v3).
 */
export function captionsFromWords(
  words: readonly SpokenWord[],
  offsetMs = 0,
  speech?: SpeechFrames
) {
  return words
    .map(w => ({ text: w.word.trim(), start: w.start, end: w.end }))
    .filter(w => w.text)
    .map(w => {
      const whisperMs = Math.round(w.start * 1000)
      const endMs = Math.round(w.end * 1000)
      const startMs = speech
        ? captionStartMs(
            whisperMs,
            firstSpeechMs(speech, whisperMs, endMs),
            endMs
          )
        : whisperMs
      return {
        text: w.text,
        startMs: Math.max(0, startMs + offsetMs),
        endMs: Math.max(0, endMs + offsetMs),
        confidence: 1,
      }
    })
}

/** Which ONSET_FRAME_MS frames of the final voice are speech (spec v4). */
export type SpeechFrames = readonly boolean[]

/**
 * Speech frames of mono 16-bit PCM: a frame is speech when its level is within
 * SPEECH_BELOW_LOUD_DB of the voice's loud level (95th percentile).
 */
export function speechFrames(
  pcm: Int16Array,
  sampleRate: number
): SpeechFrames {
  const per = Math.max(1, Math.round((sampleRate * SPEC.ONSET_FRAME_MS) / 1000))
  const n = Math.floor(pcm.length / per)
  const db: number[] = []
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let j = i * per; j < (i + 1) * per; j++) sum += pcm[j] * pcm[j]
    db.push(20 * Math.log10(Math.sqrt(sum / per) + 1))
  }
  if (!db.length) return []
  const loud = [...db].sort((x, y) => x - y)[Math.floor(0.95 * (db.length - 1))]
  return db.map(v => v >= loud - SPEC.SPEECH_BELOW_LOUD_DB)
}

/** The first speech moment in [fromMs, toMs), or toMs when there is none. */
export function firstSpeechMs(
  speech: SpeechFrames,
  fromMs: number,
  toMs: number
) {
  const f = SPEC.ONSET_FRAME_MS
  for (
    let i = Math.max(0, Math.floor(fromMs / f));
    i * f < toMs && i < speech.length;
    i++
  )
    if (speech[i]) return Math.max(fromMs, i * f)
  return toMs
}

/** Mirror of the spec's caption_start_ms. */
export function captionStartMs(
  whisperMs: number,
  firstSpeech: number,
  endMs: number
) {
  if (firstSpeech < whisperMs || firstSpeech >= endMs) return whisperMs
  return firstSpeech
}

/** Mirror of the spec's house_own (v7): the house orders it, nobody else is named. */
export function houseOwn(
  houseCaller: boolean,
  clientTurn: boolean,
  forLead: boolean,
  sellerSweep: boolean
): boolean {
  if (!houseCaller) return false
  if (clientTurn) return false
  if (forLead) return false
  return !sellerSweep
}

/** Mirror of the spec's cta_for (v7): which call the reel ends on. */
export function ctaFor(
  house: boolean,
  given: boolean,
  givenNamesHouse: boolean,
  clientHasCta: boolean
): number {
  if (given && (house || !givenNamesHouse)) return SPEC.CTA_GIVEN
  if (house) return SPEC.CTA_OWNER
  if (clientHasCta) return SPEC.CTA_CLIENT
  return SPEC.CTA_NEUTRAL
}

/** Mirror of the spec's owner_voice_allowed (v7). */
export function ownerVoiceAllowed(house: boolean): boolean {
  return house || SPEC.OWNER_VOICE_ON_CLIENT_REEL
}

/**
 * Mirror of the spec's house_name_allowed (v7): a house name stands on the
 * house's own reel, and elsewhere only in words the person put there herself.
 */
export function houseNameAllowed(
  house: boolean,
  agentSupplied: boolean
): boolean {
  if (house) return true
  if (!agentSupplied) return true
  return SPEC.AGENT_HOUSE_NAME_ON_CLIENT_REEL
}

/**
 * Mirror of the spec's voice_refused (v8): an ordinary caller who names no
 * voice and has no clone of her own is refused before the charge. There is
 * no stock voice to give her (STOCK_VOICE_FOR_ORDINARY); the house keeps its
 * own path.
 */
export function voiceRefused(
  house: boolean,
  hasVoiceId: boolean,
  hasClone: boolean
): boolean {
  if (hasVoiceId) return false
  if (hasClone) return false
  if (house) return false
  return !SPEC.STOCK_VOICE_FOR_ORDINARY
}

/** Mirror of the spec's speech_ms_estimate (v8): ms of speech from its text. */
export function speechMsEstimate(chars: number): number {
  return chars * SPEC.MS_PER_CHAR
}

/** Mirror of the spec's text_fits (v8): the estimate is within the format. */
export function textFits(chars: number): boolean {
  return speechMsEstimate(chars) <= SPEC.SPEECH_MAX_SECONDS * 1000
}

/**
 * Characters as the spec's pace was measured (MEASURED_CHARS): the words
 * joined by single spaces, nothing around them.
 */
export function speechChars(text: string): number {
  return Array.from(
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  ).length
}

/**
 * A reel's speech as the lines own_words judges: one per line break or
 * sentence end, so a house name is weighed with the words of its own
 * sentence and never with the sentence before it.
 */
export function speechLines(text: string): string[] {
  return String(text ?? '')
    .split(/\n+|(?<=[.!?…])\s+/u)
    .map(line => line.trim())
    .filter(Boolean)
}

/**
 * The spec's agent_supplied for a reel's speech: some line names the house
 * and is not the person's own words this turn (ToolContext.ownerSaid, set
 * only by code). Judged line by line by the one detector, house-names.ts
 * (crm-story-reel v22 own_words): sellers address the bot by name, so her
 * message naming it lends no line anything.
 */
export function agentSuppliedHouseName(
  text: string,
  personSaid?: string
): boolean {
  return speechLines(text).some(line => houseNameByAgent(line, personSaid))
}

/**
 * The turn as the v7 rule reads it. Every field is set only by code (the
 * wallet's id, chat.ts clientTurnContext), never by the model's words.
 */
export interface ReelTurn {
  /** Whether the wallet ordering the reel is the house's (isHouse). */
  house: boolean
  /** The client the turn works for. */
  faceOf?: string
  /** An unattended sweep: every reel in it is for a lead. */
  sellerSweep?: boolean
}

/** Whose voice and call a reel carries: the lead the order names, else the turn's client. */
export function leadOfTurn(
  forLead: unknown,
  turn: Pick<ReelTurn, 'faceOf'>
): string {
  return String(forLead ?? '').trim() || String(turn?.faceOf ?? '').trim()
}

/** The spec's house_own, read off a turn and the lead resolved by leadOfTurn. */
export function houseOwnTurn(turn: ReelTurn, lead: string): boolean {
  return houseOwn(
    turn?.house === true,
    Boolean(turn?.faceOf),
    Boolean(lead),
    Boolean(turn?.sellerSweep)
  )
}

/** What the reel's call is chosen from (spec v7). */
export interface ReelCall {
  /** The house's own reel (houseOwnTurn). */
  house: boolean
  /** The call the order wrote; '' when none. */
  given?: string
  /** The call in the client's own profile; '' when none. */
  client?: string
  /** A call with no name in it: the host's copy. */
  neutral: string
}

/** The call the reel ends on: the spec's cta_for, in words. */
export function reelCta(c: ReelCall): string {
  const given = String(c.given ?? '').trim()
  const client = String(c.client ?? '').trim()
  switch (ctaFor(c.house, Boolean(given), namesHouse(given), Boolean(client))) {
    case SPEC.CTA_GIVEN:
      return given
    case SPEC.CTA_OWNER:
      return SPEC.OWNER_CTA
    case SPEC.CTA_CLIENT:
      return client
    default:
      return c.neutral
  }
}

export interface SplitReelInput {
  lipSyncVideo: string
  /** Where the last word ends; the call starts there (spec v5). */
  seconds: number
  bRolls?: readonly string[]
  captions?: unknown[]
  /** Whose reel it is and what its call is chosen from (spec v7). */
  call: ReelCall
  /** Measured face; the studio's place when absent. */
  face?: FaceInSource
  /** The reel's frame; 1080x1920 when absent. */
  width?: number
  height?: number
}

/** Props for `reel_render {compositionId: SPEC.COMPOSITION, props}`. */
export function splitReelProps(input: SplitReelInput) {
  const width = input.width ?? 1080
  const height = input.height ?? 1920
  const face = input.face ?? STUDIO_FACE
  const splitH = Math.round((height * (100 - SPEC.SPLIT_PCT)) / 100)
  return {
    lipSyncVideo: input.lipSyncVideo,
    segments: splitSegments(framesForSeconds(input.seconds), input.bRolls),
    captions: input.captions ?? [],
    captionColor: SPEC.CAPTION_COLOR,
    splitRatio: SPEC.SPLIT_PCT / 100,
    // SplitTalkingHead defaults a split to a 25% circle; size 50 is scale 1.
    splitIsCircle: !SPEC.FACE_FILLS_HALF,
    splitCircleSize: SPEC.SPLIT_PCT,
    // The face is centred in the window it is shown in (spec v3).
    splitFacePosition: faceObjectPosition(face, width, splitH),
    fullscreenFacePosition: faceObjectPosition(face, width, height),
    // The call at the end, on the held last frame (spec v5): always, and
    // the client's on a client's reel (spec v7).
    ctaText: reelCta(input.call),
    pauseSec: SPEC.CTA_PAUSE_SEC,
    speechSec: input.seconds,
  }
}

/** Mirror of the spec's reel_frames: the voice, then the pause with the call. */
export function reelFrames(speechFrames: number): number {
  return speechFrames + SPEC.CTA_PAUSE_SEC * SPEC.FPS
}

/** Mirror of the spec's deliverable: measured and clean, or not given. */
export function deliverable(measured: boolean, defects: number): boolean {
  if (!measured) return false
  return defects === 0
}

export const SPLIT_REEL_COMPOSITION = SPEC.COMPOSITION
