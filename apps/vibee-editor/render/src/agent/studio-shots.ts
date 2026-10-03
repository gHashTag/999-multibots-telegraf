/**
 * A shot of the source photo (crm-story-reel v19, STUDIO_SHOTS).
 *
 * The owner, 2026-10-03: "we do everything without leaving the studio,
 * working with shots". His reel had put him on a street in the rain, because
 * every scene was a new picture drawn around him. A scene with no setting is
 * now cut from the source itself -- wide, medium or close -- so the studio
 * and the look are his to the pixel, and nothing is drawn or paid for.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { s3PutBytes } from '../lib/s3-put'
import * as SPEC from '../spec/crm-story-reel.gen'

/** Which shot a scene is (spec shot_of_scene). */
export function shotOfScene(scene: number): number {
  if (scene === SPEC.OPEN_SCENE) return SPEC.SHOT_WIDE
  return scene % 2 === 1 ? SPEC.SHOT_CLOSE : SPEC.SHOT_MEDIUM
}

/** How much of the source's side a shot keeps, per mille (spec shot_permille). */
export function shotPermille(shot: number): number {
  if (shot === SPEC.SHOT_CLOSE) return SPEC.SHOT_CLOSE_PERMILLE
  if (shot === SPEC.SHOT_MEDIUM) return SPEC.SHOT_MEDIUM_PERMILLE
  return 1000
}

/**
 * The ffmpeg filter that cuts a shot: the source's own aspect kept, the face
 * placed a third down, the box held inside the picture, then scaled to the
 * lip-sync's frame.
 */
export function shotFilter(shot: number): string {
  const k = shotPermille(shot) / 1000
  const fx = SPEC.FACE_X_PERMILLE / 1000
  const fy = SPEC.FACE_Y_PERMILLE / 1000
  const fin = SPEC.FACE_IN_SHOT_PERMILLE / 1000
  const crop =
    `crop=w='trunc(iw*${k}/2)*2':h='trunc(ih*${k}/2)*2'` +
    `:x='min(max(iw*${fx}-ow/2\\,0)\\,iw-ow)'` +
    `:y='min(max(ih*${fy}-oh*${fin}\\,0)\\,ih-oh)'`
  return `${crop},scale=${SPEC.SHOT_WIDTH}:${SPEC.SHOT_HEIGHT}:flags=lanczos`
}

export type ShotExec = (bin: string, args: string[]) => Promise<void>

const run: ShotExec = (bin, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    p.stderr.on('data', d => (err = (err + d).slice(-400)))
    p.on('error', reject)
    p.on('close', code =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err}`))
    )
  })

export interface ShotDeps {
  fetchBytes: (url: string) => Promise<Buffer>
  exec: ShotExec
  put: (body: Buffer, name: string) => Promise<string>
}

const liveDeps: ShotDeps = {
  fetchBytes: async url => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return Buffer.from(await r.arrayBuffer())
  },
  exec: run,
  put: async (body, name) => (await s3PutBytes(body, name, 'image/jpeg')).url,
}

/** Cuts one shot of the source and returns its URL on our shelf. */
export async function cutShot(
  sourceUrl: string,
  shot: number,
  deps: ShotDeps = liveDeps
): Promise<string> {
  if (shot === SPEC.SHOT_WIDE) return sourceUrl
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-shot-'))
  try {
    const input = path.join(dir, 'in')
    const output = path.join(dir, 'out.jpg')
    await fs.writeFile(input, await deps.fetchBytes(sourceUrl))
    await deps.exec('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-i',
      input,
      '-vf',
      shotFilter(shot),
      '-frames:v',
      '1',
      '-q:v',
      '2',
      output,
    ])
    const name = shot === SPEC.SHOT_CLOSE ? 'shot-close.jpg' : 'shot-medium.jpg'
    return await deps.put(await fs.readFile(output), name)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
