/**
 * THE REEL PLAN: ONE VOICE-OVER IS THE SPINE, THE FACE APPEARS ONLY WHERE IT
 * EARNS ITS KEEP.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT "A TALKING PHOTO". src/talking-portrait.ts
 * buys one continuous talking head and drops it in a medallion. At the measured
 * price of veed/fabric-1 -- 18 credits per second, src/config/
 * lipsync-models.config.ts -- a 15-second reel is 270 credits, about 4% of the
 * whole account balance for ONE post. That is both expensive and weak film
 * grammar: an unbroken close-up is not how a reel is cut.
 *
 * THE ARITHMETIC THE OWNER CHOSE, and the reason this module is shaped the way
 * it is. Measured today, 2026-08-31, on this account:
 *
 *   Kie TTS (google/gemini-3-1-flash-tts)   1.37 credits for 9.72 s  (0.14 cr/s)
 *   Kie img2img (google/nano-banana-edit)   4 credits per engraving
 *   talking head (veed/fabric-1)            18 credits per second
 *
 * So the voice track is a rounding error and only the FACE costs anything --
 * one face second is worth about 128 voice seconds. A reel of 3 s hook face +
 * 2 s closing face + 10 s of engravings under the same voice is about 111
 * credits against 270 for the naive wall-to-wall head: 2.4x cheaper, and it
 * puts our own engraving style on screen instead of one long close-up.
 *
 * THE UNIT OF WORK IS THEREFORE A PLAN, NOT A CLIP: one voice-over, a few face
 * cuts with their start and duration, stills for the rest. Every face call is
 * fed the CORRESPONDING SLICE of the one voice-over.
 *
 * THE PROPERTY THAT MAKES THE WHOLE DESIGN WORK, and the one a test must pin:
 * the assembled reel's audio is THE SINGLE VOICE-OVER FILE, never the
 * concatenation of the clips' own soundtracks. Concatenating clip audio is how
 * the voice jumps at every cut -- each provider clip is separately encoded,
 * separately padded, and starts and ends on silence. Laying the one file
 * underneath makes continuity structural rather than lucky, and it is why
 * `assembleArgs` maps exactly one audio input and drops every clip's audio.
 *
 * WHY ffmpeg AND NOT REMOTION. All three registered compositions were read
 * first (src/Root.tsx):
 *
 *   SplitTalkingHead  has NO voiceover input at all -- its speech comes out of
 *                     `lipSyncVideo` itself, played by <OffthreadVideo
 *                     volume={videoVolume}> (SplitTalkingHead.tsx:992, :1076).
 *                     Face and voice are ONE artefact there, which is the exact
 *                     opposite of a voice-over spine.
 *   NoirReel          has no voiceover prop, and with empty captions its end
 *                     card starts at zero and covers the whole reel.
 *   TrinityBlogReel   does have `voiceover` as a full-length <Audio>
 *                     (TrinityBlogReel.tsx:149, :832) -- but its visual is one
 *                     blog card with a single oval medallion. It has no ordered
 *                     track of face and still segments, which is the thing
 *                     being assembled here.
 *
 * None fits, and inventing a fourth composition would still leave ffmpeg in the
 * chain, because cutting the audio slice for each face call is an ffmpeg job
 * either way. One tool for the cut and the assembly keeps the guarantee above
 * to a single `-map` pair instead of a React tree that renders absence when a
 * prop is the wrong shape (the failure src/face-source.ts was written about).
 *
 * NOTHING HERE THROWS OUTWARD. Every refusal is a value with the number that
 * caused it, because the caller's correct reaction is to say what it would have
 * cost, not to disappear.
 */

/* ------------------------------------------------------------------- money */

/**
 * The ceiling is denominated in SECONDS OF FACE, not in reels.
 *
 * A per-reel ceiling cannot bound anything: the same "one reel" is 36 credits
 * or 540 depending on a number nobody looked at. Face seconds are the only
 * quantity that multiplies into the bill, so that is what is capped, and the
 * refusal quotes both the seconds and the credits they buy.
 */
export const DEFAULT_FACE_CEILING_SECONDS = 5

/** veed/fabric-1 on kie.ai, from src/config/lipsync-models.config.ts. */
export const KIE_FABRIC_CREDITS_PER_SECOND = 18

/** The reel is vertical at 30 fps, the same frame every composition uses. */
export const WIDTH = 1080
export const HEIGHT = 1920
export const FPS = 30

export type Log = (line: string) => void

/** A window of the voice-over that the face will speak, in milliseconds. */
export interface FaceCut {
  startMs: number
  durationMs: number
}

export type SegmentKind = 'face' | 'still'

/**
 * One visual segment of the finished reel. `index` points into the face cuts
 * for a face segment and into the still list for a still, so the assembler
 * never has to re-derive which asset belongs where.
 */
export interface PlannedSegment {
  kind: SegmentKind
  startMs: number
  endMs: number
  index: number
}

export interface ReelPlan {
  voiceMs: number
  faceCuts: FaceCut[]
  faceSeconds: number
  ceilingSeconds: number
  creditsPerFaceSecond: number
  /** What the face layer will cost if this plan runs. Quoted in every refusal. */
  faceCredits: number
  stillCount: number
  timeline: PlannedSegment[]
  /** Non-empty means: do not spend. Each entry carries the number that caused it. */
  refusals: string[]
  notes: string[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function faceSecondsOf(cuts: FaceCut[]): number {
  return round2(cuts.reduce((a, c) => a + Math.max(0, c.durationMs), 0) / 1000)
}

export function faceCreditsFor(
  seconds: number,
  creditsPerSecond = KIE_FABRIC_CREDITS_PER_SECOND
): number {
  return round2(seconds * creditsPerSecond)
}

/**
 * GATE ONE, AND IT RUNS BEFORE A SINGLE PROVIDER IS TOLD ANYTHING.
 *
 * The face seconds are known from the request alone -- they do not depend on
 * how long the voice-over turns out to be -- so the price can be computed and
 * refused before even the TTS call, which is the cheap one. A ceiling checked
 * after the synthesis would still be a ceiling, but it would already have
 * spent; this one has not.
 */
export function checkFaceBudget(opts: {
  faceCuts: FaceCut[]
  ceilingSeconds?: number
  creditsPerFaceSecond?: number
}): { ok: boolean; faceSeconds: number; faceCredits: number; reason?: string } {
  const ceiling = opts.ceilingSeconds ?? DEFAULT_FACE_CEILING_SECONDS
  const rate = opts.creditsPerFaceSecond ?? KIE_FABRIC_CREDITS_PER_SECOND
  const faceSeconds = faceSecondsOf(opts.faceCuts)
  const faceCredits = faceCreditsFor(faceSeconds, rate)
  if (faceSeconds > ceiling) {
    return {
      ok: false,
      faceSeconds,
      faceCredits,
      reason:
        `лицо ${faceSeconds} с при потолке ${ceiling} с: это ${faceCredits} ` +
        `кредитов по ${rate} за секунду — не начинаю`,
    }
  }
  return { ok: true, faceSeconds, faceCredits }
}

/**
 * Where the face goes when the caller does not say: the opening hook and the
 * closing call, and nothing in between.
 *
 * Those are the two places a face earns its keep -- the first second decides
 * whether the reel is watched, the last one decides whether anything happens
 * afterwards. Everything between them is illustration, and illustration is
 * 128x cheaper as a still.
 */
export function defaultFaceCuts(opts: {
  voiceMs: number
  hookMs?: number
  closeMs?: number
}): FaceCut[] {
  const hook = Math.max(0, Math.round(opts.hookMs ?? 3000))
  const close = Math.max(0, Math.round(opts.closeMs ?? 2000))
  const cuts: FaceCut[] = []
  if (hook > 0)
    cuts.push({ startMs: 0, durationMs: Math.min(hook, opts.voiceMs) })
  const closeStart = opts.voiceMs - close
  if (close > 0 && closeStart > hook)
    cuts.push({ startMs: closeStart, durationMs: close })
  return cuts
}

/**
 * THE ORDERING, and it is the second thing a test must pin.
 *
 * The timeline must (a) start at 0, (b) end exactly at the voice-over's end,
 * (c) leave no gap and no overlap, and (d) place the face segments at exactly
 * the millisecond windows the audio slices were cut from. Break any one of
 * those and the reel still renders -- with the face lip-syncing to words it is
 * not saying, or with a frozen tail where the voice keeps talking. Neither
 * looks like an error from outside, which is why this is computed here rather
 * than assembled by hand at the call site.
 *
 * Stills fill every remaining interval, in order, cycling through however many
 * engravings were supplied.
 */
export function buildTimeline(opts: {
  voiceMs: number
  faceCuts: FaceCut[]
  stillCount: number
}): PlannedSegment[] {
  const out: PlannedSegment[] = []
  const cuts = [...opts.faceCuts].sort((a, b) => a.startMs - b.startMs)
  let cursor = 0
  let still = 0
  const pushStill = (startMs: number, endMs: number) => {
    if (endMs - startMs < 1) return
    if (opts.stillCount <= 0) return
    out.push({ kind: 'still', startMs, endMs, index: still % opts.stillCount })
    still++
  }
  cuts.forEach((cut, i) => {
    const end = Math.min(opts.voiceMs, cut.startMs + cut.durationMs)
    pushStill(cursor, cut.startMs)
    out.push({ kind: 'face', startMs: cut.startMs, endMs: end, index: i })
    cursor = end
  })
  pushStill(cursor, opts.voiceMs)
  return out
}

/**
 * GATE TWO: the plan, once the real length of the voice-over is known.
 *
 * The face cuts are validated against the actual audio here because a cut that
 * runs past the end of the voice-over is not an error the provider reports --
 * ffmpeg simply returns a shorter slice, the face clip is shorter than its
 * window, and the reel shows a frozen frame while the voice carries on. Same
 * class as a wrongly shaped prop rendering as absence.
 */
export function planReel(opts: {
  voiceMs: number
  faceCuts: FaceCut[]
  stillCount: number
  ceilingSeconds?: number
  creditsPerFaceSecond?: number
}): ReelPlan {
  const ceilingSeconds = opts.ceilingSeconds ?? DEFAULT_FACE_CEILING_SECONDS
  const creditsPerFaceSecond =
    opts.creditsPerFaceSecond ?? KIE_FABRIC_CREDITS_PER_SECOND
  const refusals: string[] = []
  const notes: string[] = []

  if (!(opts.voiceMs > 0))
    refusals.push('длительность озвучки неизвестна — резать нечего')

  const cuts = [...opts.faceCuts]
    .map(c => ({
      startMs: Math.max(0, Math.round(c.startMs)),
      durationMs: Math.max(0, Math.round(c.durationMs)),
    }))
    .sort((a, b) => a.startMs - b.startMs)

  cuts.forEach((c, i) => {
    if (c.durationMs <= 0)
      refusals.push(`кусок лица №${i + 1} нулевой длины — это не кусок`)
    if (c.startMs + c.durationMs > opts.voiceMs)
      refusals.push(
        `кусок лица №${i + 1} (${c.startMs}..${c.startMs + c.durationMs} мс) ` +
          `выходит за озвучку в ${opts.voiceMs} мс: ffmpeg вернёт кусок короче, ` +
          'лицо замрёт, а голос продолжит'
      )
    const prev = cuts[i - 1]
    if (prev && c.startMs < prev.startMs + prev.durationMs)
      refusals.push(
        `куски лица №${i} и №${i + 1} перекрываются — одна секунда голоса ` +
          'не может звучать в двух кадрах сразу'
      )
  })

  if (opts.stillCount <= 0 && cuts.length === 0)
    refusals.push('ни лица, ни картинок — собирать нечего')

  const budget = checkFaceBudget({
    faceCuts: cuts,
    ceilingSeconds,
    creditsPerFaceSecond,
  })
  if (!budget.ok && budget.reason) refusals.push(budget.reason)

  const timeline = buildTimeline({
    voiceMs: opts.voiceMs,
    faceCuts: cuts,
    stillCount: opts.stillCount,
  })

  const covered = timeline.reduce((a, s) => a + (s.endMs - s.startMs), 0)
  if (opts.voiceMs > 0 && covered !== opts.voiceMs)
    refusals.push(
      `дорожка покрывает ${covered} мс из ${opts.voiceMs}: под голосом остался ` +
        'бы чёрный кадр'
    )

  if (cuts.length === 0 && opts.voiceMs > 0)
    notes.push('лица нет вовсе — ролик соберётся из гравюр под ту же озвучку')

  return {
    voiceMs: opts.voiceMs,
    faceCuts: cuts,
    faceSeconds: budget.faceSeconds,
    ceilingSeconds,
    creditsPerFaceSecond,
    faceCredits: budget.faceCredits,
    stillCount: opts.stillCount,
    timeline,
    refusals,
    notes,
  }
}

/* ---------------------------------------------------------------- assembly */

export interface AssemblyInput {
  /** Local file for each face segment, indexed like `PlannedSegment.index`. */
  faceFiles: string[]
  /** Local file for each still, indexed like `PlannedSegment.index`. */
  stillFiles: string[]
  /** The ONE voice-over. Its bytes are the finished reel's only audio. */
  voiceFile: string
  outFile: string
}

function msToS(ms: number): string {
  return (ms / 1000).toFixed(3)
}

/**
 * The ffmpeg argv for the whole assembly, built as data so a test can read it.
 *
 * Two things are load-bearing and both are visible in the returned array:
 *
 *   -- every visual input is taken as VIDEO ONLY (`[i:v]`), so no clip's own
 *      soundtrack can reach the output. The face clips do carry audio: it is
 *      the same voice, separately encoded, and concatenating it is exactly the
 *      jump this design exists to avoid;
 *   -- the voice-over is the LAST input and the only `-map` of an audio
 *      stream, so the output has one continuous audio track by construction.
 *
 * The stills get a slow push (`zoompan`) rather than sitting still: a static
 * frame under a moving voice reads as a stalled video, and the push is free.
 */
export function assembleArgs(
  plan: ReelPlan,
  input: AssemblyInput
): { args: string[]; inputs: string[] } {
  const inputs: string[] = []
  const filters: string[] = []
  const labels: string[] = []

  plan.timeline.forEach((seg, i) => {
    const file =
      seg.kind === 'face'
        ? input.faceFiles[seg.index]
        : input.stillFiles[seg.index]
    const durMs = seg.endMs - seg.startMs
    const frames = Math.max(1, Math.round((durMs / 1000) * FPS))
    const idx = inputs.length
    if (seg.kind === 'still') {
      // A still needs an explicit loop and rate: without them ffmpeg treats the
      // image as a single frame and the segment is 1/30 s long.
      inputs.push('-loop', '1', '-t', msToS(durMs), '-i', file)
      filters.push(
        `[${idx}:v]scale=${WIDTH * 2}:${HEIGHT * 2}:force_original_aspect_ratio=increase,` +
          `crop=${WIDTH * 2}:${HEIGHT * 2},` +
          // 1.00 -> 1.10 across the segment: slow enough to read as a push
          // rather than a zoom, and it never leaves the frame.
          `zoompan=z='min(1+0.10*on/${frames},1.10)':d=1:` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${WIDTH}x${HEIGHT}:fps=${FPS},` +
          `trim=end=${msToS(durMs)},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`
      )
    } else {
      inputs.push('-i', file)
      filters.push(
        `[${idx}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
          `crop=${WIDTH}:${HEIGHT},fps=${FPS},` +
          `trim=end=${msToS(durMs)},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`
      )
    }
    labels.push(`[v${i}]`)
  })

  const voiceIndex = inputs.filter(a => a === '-i').length
  inputs.push('-i', input.voiceFile)
  filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[vout]`)

  return {
    inputs,
    args: [
      '-hide_banner',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[vout]',
      // The single voice-over, and nothing else, is the audio of the reel.
      '-map',
      `${voiceIndex}:a`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-r',
      String(FPS),
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-y',
      input.outFile,
    ],
  }
}

/** The argv that cuts one face cut out of the voice-over. */
export function sliceArgs(opts: {
  voiceFile: string
  cut: FaceCut
  outFile: string
}): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    msToS(opts.cut.startMs),
    '-t',
    msToS(opts.cut.durationMs),
    '-i',
    opts.voiceFile,
    // Re-encode rather than copy: a stream copy snaps to the nearest packet
    // boundary, and a face clip that starts 40 ms early lip-syncs to the wrong
    // word for its whole length.
    '-c:a',
    'pcm_s16le',
    '-ar',
    '24000',
    '-ac',
    '1',
    '-y',
    opts.outFile,
  ]
}
