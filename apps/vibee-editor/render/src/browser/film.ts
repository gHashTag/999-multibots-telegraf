/**
 * A FILM OF WHAT THE AGENT DID, FRAME BY FRAME.
 *
 * Owner, 2026-09-22: "after the agent has worked, a video of it, and a full
 * report in plain language". The journal says what happened; this shows it.
 *
 * WHAT IT IS, HONESTLY. Not a continuous recording of the stream -- that
 * would mean a second encoder running beside neko for every person, all the
 * time. It is one picture of the whole screen (neko's own shot, the pixels
 * the person's video carries) after each step that changed or looked at the
 * page, played back one frame a second. Frame N is step N of the report.
 *
 * WHERE IT LIVES. In memory, per person, capped and aged out: a film is
 * made to be sent once, right after the turn, and nothing about it needs to
 * survive a deploy. Probes never film (they are not the agent's work).
 *
 * WHAT IT NEVER HOLDS. Anything the person typed is on the screen only if
 * the page shows it -- a password field shows dots. The film is sent to the
 * person themselves, in their own chat, and nowhere else.
 */

export interface Frame {
  /** When the frame was taken (ms since epoch). */
  at: number
  /** The tool whose step this frame shows. */
  tool: string
  /** JPEG, base64. */
  jpeg: string
}

/** Enough for a long task; each frame is a few tens of KB. */
export const FILM_MAX_FRAMES = 40
/** A film nobody collected within this is dropped. */
export const FILM_TTL_MS = 30 * 60_000

/* Steps worth a frame: they change the page, or they are the agent looking. */
export const FILMED_TOOLS: ReadonlySet<string> = new Set([
  'browser_open',
  'browser_click',
  'browser_type',
  'browser_evaluate',
  'browser_close_tab',
  'browser_screenshot',
])

const films = new Map<string, Frame[]>()

export function resetFilmsForTests(): void {
  films.clear()
}

/** Add a frame; the oldest go first past the cap, stale ones on every add. */
export function addFrame(
  telegramId: string,
  frame: Frame,
  now = Date.now()
): void {
  const list = (films.get(telegramId) ?? []).filter(
    f => now - f.at < FILM_TTL_MS
  )
  list.push(frame)
  while (list.length > FILM_MAX_FRAMES) list.shift()
  films.set(telegramId, list)
}

/** The frames taken since `since`, removed from memory: a film is sent once. */
export function takeFilm(telegramId: string, since: number): Frame[] {
  const list = films.get(telegramId) ?? []
  const taken = list.filter(f => f.at >= since)
  const kept = list.filter(f => f.at < since)
  if (kept.length) films.set(telegramId, kept)
  else films.delete(telegramId)
  return taken
}

export type Exec = (bin: string, args: string[]) => Promise<unknown>

/** Every frame fits this box, letterboxed: frames can differ in size. */
export const FILM_WIDTH = 1280
export const FILM_HEIGHT = 720
/** Seconds each frame stays on screen. */
export const FILM_SECONDS_PER_FRAME = 1.5

/**
 * The ffmpeg arguments that turn numbered JPEGs into an MP4 a phone plays.
 * Pure, so the shape (even sizes, yuv420p, faststart) is tested directly;
 * without yuv420p Telegram's player on iOS shows a black square.
 */
export function filmArgs(dir: string, out: string): string[] {
  const box = `${FILM_WIDTH}:${FILM_HEIGHT}`
  return [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(1 / FILM_SECONDS_PER_FRAME),
    '-i',
    `${dir}/%03d.jpg`,
    '-vf',
    `scale=${box}:force_original_aspect_ratio=decrease,pad=${box}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
    '-r',
    '10',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-movflags',
    '+faststart',
    out,
  ]
}

/**
 * The film as MP4 bytes; null when there are fewer than two frames (one
 * picture is not a film) or ffmpeg fails. Never throws: a report without its
 * film is still the report.
 */
export async function filmToMp4(
  frames: Frame[],
  exec: Exec,
  fs: {
    mkdtemp: (prefix: string) => Promise<string>
    writeFile: (path: string, data: Buffer) => Promise<void>
    readFile: (path: string) => Promise<Buffer>
    rm: (
      path: string,
      opts: { recursive: boolean; force: boolean }
    ) => Promise<void>
  },
  tmpRoot: string
): Promise<Buffer | null> {
  if (frames.length < 2) return null
  let dir: string | null = null
  try {
    dir = await fs.mkdtemp(`${tmpRoot}/film-`)
    for (let i = 0; i < frames.length; i++) {
      const name = `${dir}/${String(i + 1).padStart(3, '0')}.jpg`
      await fs.writeFile(name, Buffer.from(frames[i].jpeg, 'base64'))
    }
    const out = `${dir}/film.mp4`
    await exec('ffmpeg', filmArgs(dir, out))
    return await fs.readFile(out)
  } catch (e) {
    console.warn('[browser] film not made:', String(e).slice(0, 200))
    return null
  } finally {
    if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
