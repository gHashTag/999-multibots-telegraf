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
  /**
   * Where the agent clicked, in THIS picture's pixels: a click frame is the
   * page itself (CDP), whose coordinates are the click's, so the ring lands
   * where the press did. A desktop frame has browser chrome above the page
   * and carries no mark rather than a wrong one.
   */
  mark?: { x: number; y: number }
  /** A short word drawn on the frame: what this step was. */
  label?: string
}

/**
 * Steps plus the ticks between them (a frame every TICK_MS while the agent
 * works), about four minutes of work; each frame is a few tens of KB.
 */
export const FILM_MAX_FRAMES = 120
/** While the agent works, the screen is taken this often between steps. */
export const TICK_MS = 2_000
/** The ticking stops this long after the agent's last step. */
export const TICK_IDLE_MS = 15_000
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
/** Seconds each frame stays on screen: ticks make it a quick time-lapse. */
export const FILM_SECONDS_PER_FRAME = 0.8
/** DejaVu ships in the render image (Dockerfile: fonts-dejavu-core). */
export const LABEL_FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

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
    /*
     * JPEG frames are full-range, and format=yuv420p alone came out as
     * yuvj420p (ffprobe, 2026-09-22) -- the full-range twin some iOS players
     * render washed out or refuse. Asking for the TV range is what turns it
     * into plain yuv420p; -pix_fmt alone did not (tested both ways).
     */
    '-color_range',
    'tv',
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
 * One frame's marks: a green ring where the click landed and the step's word
 * in the corner. Pure. The label goes through a file (textfile=), so no
 * character in it needs escaping for the filter graph. Null: nothing to draw.
 */
export function annotateArgs(
  input: string,
  output: string,
  frame: Pick<Frame, 'mark' | 'label'>,
  labelFile: string | null,
  font: string | null
): string[] | null {
  const draws: string[] = []
  if (frame.mark) {
    const x = Math.max(0, Math.round(frame.mark.x) - 24)
    const y = Math.max(0, Math.round(frame.mark.y) - 24)
    draws.push(`drawbox=x=${x}:y=${y}:w=48:h=48:color=0x00ff88@0.95:t=6`)
    draws.push(
      `drawbox=x=${x + 18}:y=${y + 18}:w=12:h=12:color=0x00ff88@0.95:t=fill`
    )
  }
  if (frame.label && labelFile && font) {
    draws.push(
      `drawtext=fontfile=${font}:textfile=${labelFile}:x=20:y=20:fontsize=34:` +
        'fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=12'
    )
  }
  if (!draws.length) return null
  return [
    '-y',
    '-loglevel',
    'error',
    '-i',
    input,
    '-vf',
    draws.join(','),
    '-q:v',
    '3',
    output,
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
  tmpRoot: string,
  font: string | null = null
): Promise<Buffer | null> {
  if (frames.length < 2) return null
  let dir: string | null = null
  try {
    dir = await fs.mkdtemp(`${tmpRoot}/film-`)
    for (let i = 0; i < frames.length; i++) {
      const name = `${dir}/${String(i + 1).padStart(3, '0')}.jpg`
      const raw = `${dir}/raw-${i}.jpg`
      await fs.writeFile(raw, Buffer.from(frames[i].jpeg, 'base64'))
      let labelFile: string | null = null
      if (frames[i].label && font) {
        labelFile = `${dir}/label-${i}.txt`
        await fs.writeFile(labelFile, Buffer.from(frames[i].label!))
      }
      const marks = annotateArgs(raw, name, frames[i], labelFile, font)
      let drawn = false
      if (marks) {
        /* A frame that cannot be drawn on is still a frame. */
        drawn = await exec('ffmpeg', marks).then(
          () => true,
          () => false
        )
      }
      if (!drawn) await fs.writeFile(name, await fs.readFile(raw))
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
