/**
 * WHAT A TOOL RESULT LOOKS LIKE TO THE MODEL.
 *
 * The chat hands every tool result to the model as a `tool` message of TEXT.
 * A picture in it arrives as tens of kilobytes of base64: the model cannot
 * see it, pays for every character, and -- measured 2026-09-22 -- then says
 * what it expects to be there. Asked "take the whole screen and say what is
 * open", the agent was handed an 80 KB JPEG and described "the Queen's board
 * with task cards, some active". The screen showed a Google sign-in page and
 * five tabs. Nothing in its answer came from the picture.
 *
 * So a picture is replaced, for the model only, by a sentence saying that a
 * picture was taken, how big it was, that the model does NOT see it, and
 * where the facts are: the text fields that travel with it (browser_screenshot
 * sends every tab's title and address) or browser_read. The person, the
 * stream to the client and the MCP caller still get the picture itself.
 */

/** A string this long, under a key that says it is an image, is a picture. */
const PICTURE_MIN_CHARS = 1000
const PICTURE_KEYS = new Set(['base64', 'image', 'image_base64', 'data'])

export const PICTURE_NOTE =
  'A picture was taken and shown to the person. YOU DO NOT SEE IT: do not ' +
  'describe what is in it. Say only what the text fields here state, or ' +
  'call browser_read for the page text.'

function isPicture(key: string, value: unknown): value is string {
  return (
    PICTURE_KEYS.has(key) &&
    typeof value === 'string' &&
    value.length >= PICTURE_MIN_CHARS &&
    /^[A-Za-z0-9+/=\s]+$/.test(value.slice(0, 200))
  )
}

function strip(
  value: unknown,
  depth: number
): { value: unknown; pictures: number } {
  if (depth > 6 || value === null || typeof value !== 'object') {
    return { value, pictures: 0 }
  }
  if (Array.isArray(value)) {
    let pictures = 0
    const out = value.map(item => {
      const r = strip(item, depth + 1)
      pictures += r.pictures
      return r.value
    })
    return { value: out, pictures }
  }
  let pictures = 0
  const out: Record<string, unknown> = {}
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isPicture(key, v)) {
      pictures++
      out[key] =
        `[picture, ${Math.round((v.length * 3) / 4 / 1024)} KB, not shown to you]`
      continue
    }
    const r = strip(v, depth + 1)
    pictures += r.pictures
    out[key] = r.value
  }
  return { value: out, pictures }
}

/** The text of the `tool` message the model receives for this result. */
export function toolContentForModel(value: unknown): string {
  const { value: stripped, pictures } = strip(value, 0)
  if (pictures === 0) return JSON.stringify(value)
  return JSON.stringify({ note: PICTURE_NOTE, ...(stripped as object) })
}
