/**
 * THE INPUT CONTRACT FOR A FACE-AND-VOICE REEL, AND THE REFUSALS THAT ENFORCE IT.
 *
 * WHAT THIS EXISTS TO PREVENT. The factory has shipped exactly one
 * SplitTalkingHead reel through the agent (feed id 20, 2026-08-26). It reported
 * success and failed in three independent ways at once:
 *
 *   - a 3.2 s source clip was published as a 30 s freeze-frame, because
 *     /render/template hardcodes 900 frames and overwrites what
 *     calculateMetadata computed (fixed alongside this file; see
 *     templateDurationInFrames in src/render-duration.ts);
 *   - its `segments` were `{url, duration}` -- not the shape SegmentSchema
 *     declares -- so BRollLayer returned null and the three generated b-rolls
 *     never appeared;
 *   - its `captions` were bare strings ["52", "теоремы", ...] instead of
 *     `{text, startMs, endMs}`, so Captions.tsx rendered nothing.
 *
 * Not one of those three logged an error. Zod is not consulted on the way in:
 * the render server passes props straight through, and a wrongly shaped prop
 * simply renders as absence. So the check has to happen BEFORE the render is
 * started, and it has to REFUSE by name rather than silently drop the layer.
 *
 * WHAT A "FACE SOURCE" IS, EXACTLY. SplitTalkingHead has no voiceover input:
 * the reel's speech comes out of `lipSyncVideo` itself, played by
 * <OffthreadVideo volume={videoVolume}> (SplitTalkingHead.tsx:992, :1076). Face
 * and voice are therefore ONE artefact -- a video whose soundtrack is already
 * the speech. This module does not synthesise, clone or verify a voice, and it
 * makes no claim about whose voice is on the track. It validates that whatever
 * the owner supplies is shaped so the composition can actually render it.
 *
 * WHY EVERY MEDIA PATH MUST BE AN ABSOLUTE URL. resolveMediaPath returns
 * http(s) inputs untouched (mediaPath.ts:85-87) and wraps everything else in
 * staticFile(). `git ls-files apps/vibee-editor/render/public` returns 0 files,
 * so a local path resolves to a 404 inside the deployed image -- which is
 * exactly what the composition's own defaultProps do. A relative path here is a
 * broken render that reports success, so it is refused rather than accepted.
 *
 * WHY THIS FILE IS IN src/. tsconfig include is ["src/**\/*",
 * "render-server.ts"]; `tsc --listFilesOnly` shows ZERO files under scripts/.
 * Logic put beside the autopilot script is invisible to `npm run typecheck` --
 * which is how the top-level-await breakage shipped green.
 */

/** The composition renders at 30 fps; Root.tsx fixes this for every template. */
export const FPS = 30

/**
 * How the b-roll rhythm is laid out when the caller does not pass segments.
 *
 * These are the proportions of the composition's own defaultProps (Root.tsx:
 * 210/180-frame splits broken by 90-frame fullscreen beats), expressed in
 * seconds so the layout follows the clip instead of assuming a 34-second one.
 */
const SPLIT_SECONDS = 6
const BREATHER_SECONDS = 3

const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i

/**
 * What the owner supplies. Only `lipSyncVideo` is mandatory; everything else
 * either has a defensible default or is refused with its reason named.
 */
export interface FaceSource {
  /** Absolute http(s) URL of the talking-head clip. Its audio IS the voice. */
  lipSyncVideo: string
  /** Word-level captions, `{text, startMs, endMs}` each. Bare strings refused. */
  captions?: unknown
  /** Absolute http(s) URLs of b-roll clips or stills for the split half. */
  bRolls?: unknown
  /** Absolute http(s) URL of the music bed. */
  music?: unknown
  /** Clip length. When absent it is derived from the last caption's endMs. */
  durationSeconds?: unknown
  /** Pre-built segments. Validated against SegmentSchema's shape, not guessed. */
  segments?: unknown
  /** Passed through to the composition; both optional. */
  ctaText?: unknown
  ctaHighlight?: unknown
  musicVolume?: unknown
  /**
   * The publication name, and the ONLY thing that stops the same clip going
   * out again and again. Required, not optional -- see the refusal text.
   */
  title?: unknown
  description?: unknown
}

export interface FaceSegment {
  type: 'split' | 'fullscreen'
  startFrame: number
  durationFrames: number
  bRollUrl?: string
  bRollType?: 'video' | 'image'
}

export interface FaceCaption {
  text: string
  startMs: number
  endMs: number
}

export type FaceSourceResult =
  | {
      ok: true
      /** Ready for POST /render/template as `props`. */
      props: Record<string, unknown>
      durationSeconds: number
      durationInFrames: number
      /** Publication name; also the dedupe key that caps this clip at one post. */
      title: string
      description: string
      /** Things the caller should know but that do not block the render. */
      notes: string[]
    }
  | { ok: false; refusals: string[] }

function isAbsoluteMediaUrl(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    (v.startsWith('http://') || v.startsWith('https://'))
  )
}

/**
 * Refusal texts are deliberately long and name the WRONG shape that was seen.
 *
 * "Invalid captions" would have been true of feed id 20 and useless. Naming
 * "an array of strings instead of {text,startMs,endMs}" is the difference
 * between a person fixing it in a minute and re-deriving the schema from the
 * component source.
 */
function checkCaptions(
  raw: unknown,
  refusals: string[]
): FaceCaption[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    refusals.push(
      'captions: ожидается массив, пришло ' +
        typeof raw +
        '. Нужна форма [{text,startMs,endMs}]'
    )
    return undefined
  }
  const out: FaceCaption[] = []
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i]
    if (typeof item === 'string') {
      refusals.push(
        'captions[' +
          i +
          ']: голая строка "' +
          item.slice(0, 20) +
          '". Именно так молча пропали субтитры у ролика 20 в ленте: ' +
          'Captions.tsx читает {text,startMs,endMs}, строку он не показывает'
      )
      return undefined
    }
    const c = item as Record<string, unknown>
    if (!c || typeof c !== 'object') {
      refusals.push(
        'captions[' + i + ']: ожидается объект {text,startMs,endMs}'
      )
      return undefined
    }
    if (typeof c.text !== 'string' || !c.text.length) {
      refusals.push('captions[' + i + '].text: пусто или не строка')
      return undefined
    }
    if (!Number.isFinite(c.startMs) || !Number.isFinite(c.endMs)) {
      refusals.push(
        'captions[' + i + ']: startMs/endMs должны быть числами в миллисекундах'
      )
      return undefined
    }
    if ((c.endMs as number) <= (c.startMs as number)) {
      refusals.push(
        'captions[' +
          i +
          ']: endMs должен быть больше startMs (' +
          String(c.startMs) +
          '..' +
          String(c.endMs) +
          ')'
      )
      return undefined
    }
    out.push({
      text: c.text,
      startMs: c.startMs as number,
      endMs: c.endMs as number,
    })
  }
  return out
}

/**
 * Segments are checked against SegmentSchema's field names, not against a
 * plausible-looking alternative. `{url, duration}` is refused by name because
 * that is the exact shape the one shipped face reel used.
 */
function checkSegments(
  raw: unknown,
  refusals: string[]
): FaceSegment[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) {
    refusals.push('segments: ожидается массив')
    return undefined
  }
  const out: FaceSegment[] = []
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i] as Record<string, unknown>
    if (!s || typeof s !== 'object') {
      refusals.push('segments[' + i + ']: ожидается объект')
      return undefined
    }
    if ('url' in s || 'duration' in s) {
      refusals.push(
        'segments[' +
          i +
          ']: форма {url,duration} — это НЕ схема композиции. ' +
          'Нужна {type,startFrame,durationFrames,bRollUrl,bRollType}. ' +
          'Именно на этом у ролика 20 в ленте пропали все три b-roll'
      )
      return undefined
    }
    if (s.type !== 'split' && s.type !== 'fullscreen') {
      refusals.push(
        'segments[' + i + '].type: допустимо только "split" или "fullscreen"'
      )
      return undefined
    }
    if (!Number.isFinite(s.startFrame) || !Number.isFinite(s.durationFrames)) {
      refusals.push(
        'segments[' +
          i +
          ']: startFrame/durationFrames должны быть числами КАДРОВ'
      )
      return undefined
    }
    const seg: FaceSegment = {
      type: s.type,
      startFrame: s.startFrame as number,
      durationFrames: s.durationFrames as number,
    }
    if (s.bRollUrl !== undefined) {
      if (!isAbsoluteMediaUrl(s.bRollUrl)) {
        refusals.push(
          'segments[' +
            i +
            '].bRollUrl: нужен абсолютный http(s) адрес — в образе рендера нет public/'
        )
        return undefined
      }
      seg.bRollUrl = s.bRollUrl
      seg.bRollType = bRollTypeOf(s.bRollUrl) ?? 'video'
    }
    out.push(seg)
  }
  return out
}

function bRollTypeOf(url: string): 'video' | 'image' | undefined {
  if (VIDEO_EXT.test(url)) return 'video'
  if (IMAGE_EXT.test(url)) return 'image'
  return undefined
}

/**
 * The b-roll rhythm: split with a b-roll, then a fullscreen beat, repeat, and
 * the tail always fullscreen so the face closes the reel.
 *
 * Frames, not seconds -- SegmentSchema counts frames, and the one shipped face
 * reel passed seconds under a different key. The last segment is truncated to
 * the clip so no segment can outlive the video.
 */
export function layoutSegments(
  durationInFrames: number,
  bRolls: string[]
): FaceSegment[] {
  if (!bRolls.length) {
    return [
      { type: 'fullscreen', startFrame: 0, durationFrames: durationInFrames },
    ]
  }
  const splitFrames = Math.round(SPLIT_SECONDS * FPS)
  const breatherFrames = Math.round(BREATHER_SECONDS * FPS)
  const out: FaceSegment[] = []
  let cursor = 0
  let i = 0
  while (cursor < durationInFrames) {
    const url = bRolls[i % bRolls.length]
    const splitLen = Math.min(splitFrames, durationInFrames - cursor)
    if (splitLen <= 0) break
    out.push({
      type: 'split',
      startFrame: cursor,
      durationFrames: splitLen,
      bRollUrl: url,
      bRollType: bRollTypeOf(url) ?? 'video',
    })
    cursor += splitLen
    if (cursor >= durationInFrames) break
    const breatherLen = Math.min(breatherFrames, durationInFrames - cursor)
    out.push({
      type: 'fullscreen',
      startFrame: cursor,
      durationFrames: breatherLen,
    })
    cursor += breatherLen
    i++
  }
  return out
}

/**
 * Validate a face source and build props for SplitTalkingHead.
 *
 * Returns EVERY refusal it can see, not just the first: a person fixing a
 * config file should get the whole list in one pass. Nothing is guessed and
 * nothing is silently dropped -- an unusable input is an `ok: false`, never a
 * render that succeeds with a missing layer.
 */
export function buildFaceReelProps(source: FaceSource): FaceSourceResult {
  const refusals: string[] = []
  const notes: string[] = []

  if (!source || typeof source !== 'object') {
    return { ok: false, refusals: ['источник не объект'] }
  }

  if (typeof source.lipSyncVideo !== 'string' || !source.lipSyncVideo.length) {
    refusals.push(
      'lipSyncVideo: обязателен. Это видео с лицом, и его звуковая дорожка ' +
        'И ЕСТЬ голос — отдельного входа для озвучки у SplitTalkingHead нет'
    )
  } else if (!isAbsoluteMediaUrl(source.lipSyncVideo)) {
    refusals.push(
      'lipSyncVideo "' +
        source.lipSyncVideo +
        '": нужен абсолютный http(s) адрес. Относительный путь уходит в ' +
        'staticFile(), а в образе рендера каталога public/ нет вовсе ' +
        '(git ls-files render/public = 0) — получится рендер по 404'
    )
  }

  /**
   * A title is mandatory because it is the CAP, not decoration.
   *
   * This template's speech is the supplied clip's own soundtrack, so one face
   * source is one fixed artefact. Publishing it under a rolling topic title
   * would put the same 26 seconds into the channel under a new name every
   * cycle. The autopilot dedupes by name against its own recent posts, so a
   * stable title is what makes "at most once" true.
   */
  if (typeof source.title !== 'string' || source.title.trim().length < 3) {
    refusals.push(
      'title: обязателен (минимум 3 символа). Это имя публикации И ключ ' +
        'дедупликации: у SplitTalkingHead речь — это дорожка самого клипа, ' +
        'значит один источник = один ролик, и повторять его под новым ' +
        'заголовком нельзя'
    )
  }

  const captions = checkCaptions(source.captions, refusals)

  const bRolls: string[] = []
  if (source.bRolls !== undefined && source.bRolls !== null) {
    if (!Array.isArray(source.bRolls)) {
      refusals.push('bRolls: ожидается массив адресов')
    } else {
      source.bRolls.forEach((u, i) => {
        if (!isAbsoluteMediaUrl(u)) {
          refusals.push(
            'bRolls[' +
              i +
              ']: нужен абсолютный http(s) адрес, пришло "' +
              String(u).slice(0, 40) +
              '"'
          )
          return
        }
        if (!bRollTypeOf(u)) {
          refusals.push(
            'bRolls[' +
              i +
              ']: по расширению не понять, видео это или картинка — ' +
              'BRollLayer выбирает тег по нему и на неизвестном рисует пустоту'
          )
          return
        }
        bRolls.push(u)
      })
    }
  }

  if (
    source.music !== undefined &&
    source.music !== null &&
    source.music !== ''
  ) {
    if (!isAbsoluteMediaUrl(source.music)) {
      refusals.push('music: нужен абсолютный http(s) адрес')
    }
  }

  const givenSegments = checkSegments(source.segments, refusals)

  // Duration: explicit value wins, otherwise the last caption's end. Both are
  // measurements the caller already has; guessing a length is what produced a
  // 30-second freeze-frame out of a 3-second clip.
  let durationSeconds = 0
  if (source.durationSeconds !== undefined && source.durationSeconds !== null) {
    if (
      typeof source.durationSeconds !== 'number' ||
      !Number.isFinite(source.durationSeconds) ||
      source.durationSeconds <= 0
    ) {
      refusals.push('durationSeconds: должно быть положительным числом секунд')
    } else {
      durationSeconds = source.durationSeconds
    }
  } else if (captions && captions.length) {
    durationSeconds = Math.max(...captions.map(c => c.endMs)) / 1000
    notes.push(
      'длительность выведена из последнего субтитра (' +
        durationSeconds.toFixed(2) +
        ' с); настоящую длину клипа задаёт calculateMetadata по метаданным видео'
    )
  } else if (!givenSegments) {
    refusals.push(
      'durationSeconds: не задана и вывести неоткуда — нужны либо ' +
        'durationSeconds, либо captions, либо готовые segments'
    )
  }

  if (refusals.length) return { ok: false, refusals }

  const durationInFrames = Math.ceil(durationSeconds * FPS)
  const segments = givenSegments ?? layoutSegments(durationInFrames, bRolls)

  if (!bRolls.length && !givenSegments) {
    notes.push('b-roll не задан — весь ролик идёт полноэкранным лицом')
  }
  if (!captions || !captions.length) {
    notes.push(
      'субтитров нет: POST /transcribe в этом сервисе не существует ' +
        '(в баннере объявлен, обработчика нет), поэтому автоподхвата не будет'
    )
  }

  const props: Record<string, unknown> = {
    lipSyncVideo: source.lipSyncVideo,
    segments,
    captions: captions ?? [],
    showCaptions: Boolean(captions && captions.length),
  }
  if (isAbsoluteMediaUrl(source.music)) {
    props.backgroundMusic = source.music
    props.musicVolume =
      typeof source.musicVolume === 'number' ? source.musicVolume : 0.06
  }
  if (typeof source.ctaText === 'string' && source.ctaText.length) {
    props.ctaText = source.ctaText
  }
  if (typeof source.ctaHighlight === 'string' && source.ctaHighlight.length) {
    props.ctaHighlight = source.ctaHighlight
  }

  return {
    ok: true,
    props,
    durationSeconds,
    durationInFrames,
    title: String(source.title).trim(),
    description:
      typeof source.description === 'string' ? source.description : '',
    notes,
  }
}

/**
 * Read a face source off disk.
 *
 * A missing file is a REFUSAL, not an empty object: the caller asked for a
 * face reel and there is nothing to make one from. Saying so beats rendering
 * the composition's defaultProps, which point at /lipsync/lipsync.mp4 and
 * /b-rolls/*.mp4 -- five paths that all 404 in the deployed image.
 */
export function readFaceSourceFile(
  file: string,
  readFile: (p: string) => string
): FaceSourceResult {
  let raw: string
  try {
    raw = readFile(file)
  } catch {
    return {
      ok: false,
      refusals: [
        'нет файла ' +
          file +
          ': владелец ещё не положил сюда своё видео с лицом и голосом. ' +
          'Форма файла описана в src/face-source.ts',
      ],
    }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return {
      ok: false,
      refusals: ['файл ' + file + ' не читается как JSON: ' + String(e)],
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      refusals: ['файл ' + file + ': ожидается объект с полем lipSyncVideo'],
    }
  }
  return buildFaceReelProps(parsed as FaceSource)
}
