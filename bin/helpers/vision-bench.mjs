// tri vision-bench -- can the render's own vision read text off a picture,
// and how long does it take? Runs INSIDE the vibee-render container (shipped
// base64 by vision-bench.sh), so VISION_* are read there and never printed.
//
// WHY. #3660: before the agent says "the poster shows 8 October, 11:30, 500
// THB" it should look at the poster. 2026-10-06 the first bench was a one-off
// /tmp script: synthetic posters, 4/4 facts at a 448 px side in ~1.1 s, 768 px
// in ~2.3 s, vision idle. This makes that measurement repeatable, and adds a
// real picture (--image) because clean synthetic type is the easy case.
//
// Input (env, set by vision-bench.sh):
//   VB_SIZES   comma list of heights, default 448
//   VB_FONTS   comma list of synthetic font sizes at 1536 px, default 72,44,26
//   VB_IMAGE   URL of a real picture; replaces the synthetic posters
//   VB_EXPECT  comma list of strings the reading must contain (with VB_IMAGE)
// Output: one TSV row per read, then "rc N". rc 0 = every read found every
// expected string, 1 = a miss or a failed call, 2 = could not run at all.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const base = (
  process.env.VISION_BASE_URL || 'http://vision.railway.internal:8000/v1'
).replace(/\/$/, '')
const key = process.env.VISION_API_KEY || ''
const model = process.env.VISION_MODEL || 'qwen3-vl-2b-instruct'
const list = (v, d) =>
  (v || d)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
const sizes = list(process.env.VB_SIZES, '448').map(Number)
const fonts = list(process.env.VB_FONTS, '72,44,26').map(Number)
const image = process.env.VB_IMAGE || ''
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
const LINES = [
  'WOODY WEEDPECKER',
  '8 October 11:30',
  'Ko Phangan',
  'Entry 500 THB',
]
const expect = image
  ? list(process.env.VB_EXPECT, '')
  : ['8', 'October', '11:30', '500']
const auth = { authorization: `Bearer ${key}` }
// A fresh background every run: the same JPEG bytes twice let llama.cpp reuse
// its cached image prompt, and the second run of the first bench read 768 px
// in ~0.45 s instead of ~2.3 s -- a cache hit, not a faster model.
const seed = 1 + Math.floor(Math.random() * 100000)

// The vision host is llama.cpp with one slot: /slots says whether a request
// (the media sweep, a chat turn) holds it right now. Unknown = '?'.
async function busy() {
  try {
    const r = await fetch(`${base.replace(/\/v1$/, '')}/slots`, {
      headers: auth,
      signal: AbortSignal.timeout(5000),
    })
    const j = await r.json()
    return Array.isArray(j)
      ? j.some(s => s.is_processing)
        ? 'busy'
        : 'idle'
      : '?'
  } catch {
    return '?'
  }
}

async function read(jpg) {
  const b64 = readFileSync(jpg).toString('base64')
  const t0 = Date.now()
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        model,
        max_tokens: 100,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${b64}` },
              },
              {
                type: 'text',
                text: 'Quote all visible text verbatim, nothing else.',
              },
            ],
          },
        ],
      }),
    })
    const j = await r.json()
    const text = j.choices?.[0]?.message?.content
    return {
      ms: Date.now() - t0,
      text: typeof text === 'string' ? text : '',
      err: typeof text === 'string' ? '' : `http ${r.status}`,
    }
  } catch (e) {
    return {
      ms: Date.now() - t0,
      text: '',
      err: String(e?.name || e).slice(0, 40),
    }
  }
}

const sources = []
try {
  if (image) {
    const r = await fetch(image, { signal: AbortSignal.timeout(30000) })
    if (!r.ok) throw new Error(`image http ${r.status}`)
    writeFileSync('/tmp/vb_real', Buffer.from(await r.arrayBuffer()))
    sources.push(['real', '-', '/tmp/vb_real'])
  } else {
    for (const size of fonts) {
      const dt = LINES.map(
        (t, i) =>
          `drawtext=fontfile=${font}:text='${t.replace(/:/g, '\\:')}':fontcolor=white:fontsize=${size}:x=(w-text_w)/2:y=${600 + i * size * 1.6}`
      ).join(',')
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        `gradients=s=1024x1536:c0=0x101010:c1=0x5a2a7a:seed=${seed}`,
        '-vf',
        dt,
        '-frames:v',
        '1',
        `/tmp/vb_${size}.png`,
      ])
      sources.push(['synthetic', String(size), `/tmp/vb_${size}.png`])
    }
  }
} catch (e) {
  console.log(
    `could not prepare the picture: ${String(e?.message || e).slice(0, 80)}`
  )
  console.log('rc 2')
  process.exit(0)
}

let rc = 0
console.log(['kind', 'font', 'height', 'ms', 'hits', 'slot', 'read'].join('\t'))
for (const [kind, f, src] of sources) {
  for (const h of sizes) {
    const jpg = `/tmp/vb_${kind}_${f}_${h}.jpg`
    execFileSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      src,
      '-vf',
      `scale=-2:${h}`,
      '-q:v',
      '4',
      jpg,
    ])
    const slot = await busy()
    const { ms, text, err } = await read(jpg)
    const lower = text.toLowerCase()
    const hits = expect.filter(w => lower.includes(w.toLowerCase())).length
    if (err || hits < expect.length) rc = 1
    const shown = err ? `ERROR ${err}` : text.replace(/\s+/g, ' ').slice(0, 90)
    console.log(
      [kind, f, h, ms, `${hits}/${expect.length}`, slot, shown].join('\t')
    )
  }
}
console.log(`rc ${rc}`)
