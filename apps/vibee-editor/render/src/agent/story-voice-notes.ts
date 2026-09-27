/**
 * A STORY REEL IN HER OWN VOICE NOTES -- NO CLONE (crm-story-reel.t27 v4).
 *
 * Owner, 2026-09-27: "our Kie is paid". The clone of a client's voice is
 * MiniMax on Replicate, and when Replicate had no credit the whole second
 * gift stopped, though the lip-sync, the stills and the cut all run on Kie.
 * Kie has no voice cloning -- only preset voices -- so it cannot put NEW words
 * in her voice. It does not need to: she has already spoken. Her own voice
 * notes, the ones she sent the seller, are cut at their pauses into one piece
 * per scene and lip-synced on her face in each new setting.
 *
 * Nothing is put in her mouth: the words are hers, as she said them. Which is
 * also why this is a seller's reel only (NOTES_FROM_SELLER_DM_ONLY): the notes
 * are read with the seller's own session, from the seller's chat with her,
 * and the finished reel goes to the seller first, like every other.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ToolContext } from './tools'
import type { LeadNotes } from './crm-voice-clone-tool'
import * as SPEC from '../spec/crm-story-reel.gen'

/** Which voice a reel speaks (spec: voice_mode). */
export function voiceMode(hasClone: boolean, sellerAsked: boolean): number {
  if (hasClone) return SPEC.VOICE_CLONE
  if (sellerAsked) return SPEC.VOICE_NOTES
  return SPEC.VOICE_NONE
}

/** Where one cut falls: a pause near the even cut, or the even cut (spec: cut_at). */
export function cutAt(evenMs: number, pauseMs: number): number {
  return Math.abs(pauseMs - evenMs) <= SPEC.NOTES_CUT_WINDOW_MS
    ? pauseMs
    : evenMs
}

/** A pause, as ffmpeg's silencedetect reports it, in seconds. */
export interface Pause {
  start: number
  end: number
}

/** The pauses in ffmpeg's silencedetect report (it writes them to stderr). */
export function pausesOf(stderr: string): Pause[] {
  const out: Pause[] = []
  let start: number | null = null
  for (const line of String(stderr ?? '').split('\n')) {
    const s = /silence_start:\s*(-?[\d.]+)/.exec(line)
    if (s) start = Math.max(0, Number(s[1]))
    const e = /silence_end:\s*([\d.]+)/.exec(line)
    if (e && start !== null) {
      out.push({ start, end: Number(e[1]) })
      start = null
    }
  }
  return out
}

/**
 * The cuts that make `parts` pieces of `durationMs`: each even cut moves to
 * the middle of the nearest pause within the window, and a cut that would
 * leave a piece shorter than NOTES_PART_MIN_MS stays even.
 */
export function cutPoints(
  durationMs: number,
  pauses: readonly Pause[],
  parts: number
): number[] {
  const mids = pauses.map(p => Math.round(((p.start + p.end) / 2) * 1000))
  const cuts: number[] = []
  let prev = 0
  for (let k = 1; k < parts; k++) {
    const even = Math.round((k * durationMs) / parts)
    const near = mids.reduce(
      (best, m) => (Math.abs(m - even) < Math.abs(best - even) ? m : best),
      Number.POSITIVE_INFINITY
    )
    let at = Number.isFinite(near) ? cutAt(even, near) : even
    const leaves = durationMs - at
    if (at - prev < SPEC.NOTES_PART_MIN_MS || leaves < SPEC.NOTES_PART_MIN_MS)
      at = even
    cuts.push(at)
    prev = at
  }
  return cuts
}

/** ffmpeg arguments that find the pauses in one file. */
export function pauseArgs(file: string): string[] {
  return [
    '-nostdin',
    '-i',
    file,
    '-af',
    'silencedetect=noise=-30dB:d=0.25',
    '-f',
    'null',
    '-',
  ]
}

/** ffmpeg arguments that cut one piece out, as MP3. */
export function pieceArgs(
  file: string,
  fromMs: number,
  toMs: number,
  out: string
): string[] {
  return [
    '-nostdin',
    '-y',
    '-i',
    file,
    '-ss',
    (fromMs / 1000).toFixed(3),
    '-to',
    (toMs / 1000).toFixed(3),
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    out,
  ]
}

export interface NotesDeps {
  /** Her voice notes, read with the seller's own session (LIVE_NOTES). */
  notes: (ctx: ToolContext, chat: string) => Promise<LeadNotes>
  /** Join into one mono MP3, capped at `maxSeconds`; returns its length. */
  join: (
    inputs: readonly string[],
    output: string,
    maxSeconds: number
  ) => Promise<number>
  /** Run ffmpeg; its stderr carries the measurements. */
  ffmpeg: (args: string[]) => Promise<{ err: string }>
  /** Put a file on our shelf; its public URL. */
  put: (bytes: Buffer, name: string, mime: string) => Promise<{ url: string }>
}

/**
 * Her voice, one piece per scene, on our shelf -- or why not, in words the
 * seller can act on. Nothing here costs a token: the pieces are ffmpeg's,
 * the lip-sync that speaks them is charged by its own tool.
 */
export async function voicesFromNotes(
  deps: NotesDeps,
  ctx: ToolContext,
  lead: string,
  parts: number
): Promise<{ urls: string[]; seconds: number } | { why: string }> {
  const got = await deps.notes(ctx, lead)
  if (!got.lead)
    return { why: 'голосовые читаются только из личного чата с ней' }
  if (!got.files.length)
    return {
      why: 'она не присылала голосовых — попроси голосовое на 15–30 с о её деле',
    }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-notes-'))
  try {
    const inputs = got.files.map((b, i) => {
      const p = path.join(dir, `note-${i}.ogg`)
      fs.writeFileSync(p, b)
      return p
    })
    const joined = path.join(dir, 'voice.mp3')
    const seconds = await deps.join(inputs, joined, SPEC.NOTES_MAX_SEC)
    if (seconds < SPEC.NOTES_MIN_SEC)
      return {
        why:
          `её голосовых всего ${seconds.toFixed(1)} с, нужно от ${SPEC.NOTES_MIN_SEC}. ` +
          'Попроси голосовое на 15–30 с о её деле',
      }
    const durationMs = Math.round(seconds * 1000)
    const { err } = await deps.ffmpeg(pauseArgs(joined))
    const cuts = cutPoints(durationMs, pausesOf(err), parts)
    const bounds = [0, ...cuts, durationMs]
    const urls: string[] = []
    for (let i = 0; i < parts; i++) {
      const out = path.join(dir, `part-${i}.mp3`)
      await deps.ffmpeg(pieceArgs(joined, bounds[i], bounds[i + 1], out))
      const shelf = await deps.put(
        fs.readFileSync(out),
        `story-notes-${lead}-${Date.now()}-${i}.mp3`,
        'audio/mpeg'
      )
      urls.push(shelf.url)
    }
    return { urls, seconds: Math.ceil(seconds) }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
