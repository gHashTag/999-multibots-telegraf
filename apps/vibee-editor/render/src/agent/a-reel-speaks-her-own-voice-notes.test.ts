/**
 * A REEL IN HER OWN VOICE NOTES, NO CLONE (crm-story-reel.t27 v4).
 *
 * Owner, 2026-09-27: "our Kie is paid". Kie has no voice cloning, so it
 * cannot put new words in her voice -- but she has already spoken. What this
 * pins:
 *
 *   - her notes are joined, capped at NOTES_MAX_SEC, and cut at the pauses
 *     nearest the even cuts (never leaving a piece under NOTES_PART_MIN_MS);
 *   - each piece goes on our shelf, one per scene, and nothing is charged;
 *   - too little of her voice, or none, is a reason in words, not a reel;
 *   - story_reel speaks a recorded piece as it is: no audio_generate for it,
 *     and the lip-sync gets HER audio;
 *   - a piece comes only from the job (ctx), never from a model's arguments.
 */
import { describe, it, expect } from 'vitest'
import {
  cutAt,
  cutPoints,
  pausesOf,
  pieceArgs,
  voiceMode,
  voicesFromNotes,
  type NotesDeps,
} from './story-voice-notes'
import { makeStoryReelTool } from './story-reel-tool'
import * as SPEC from '../spec/crm-story-reel.gen'

const ctx = {
  telegramId: '900000001',
  pool: { query: async () => ({ rows: [] }) },
} as never

describe('which voice, and where her notes are cut', () => {
  it('her clone when she has one; her notes for a seller; nothing for a client alone', () => {
    expect(voiceMode(true, false, true)).toBe(SPEC.VOICE_CLONE)
    expect(voiceMode(true, false, false)).toBe(SPEC.VOICE_CLONE)
    expect(voiceMode(false, false, true)).toBe(SPEC.VOICE_NOTES)
    expect(voiceMode(false, false, false)).toBe(SPEC.VOICE_NONE)
  })

  it('her clone refused by its provider: her notes for the seller, her clone for herself', () => {
    expect(voiceMode(true, true, true)).toBe(SPEC.VOICE_NOTES)
    expect(voiceMode(true, true, false)).toBe(SPEC.VOICE_CLONE)
    expect(voiceMode(false, true, false)).toBe(SPEC.VOICE_NONE)
  })

  it('reads the pauses ffmpeg reports', () => {
    const err = [
      '[silencedetect @ 0x1] silence_start: 3.8',
      '[silencedetect @ 0x1] silence_end: 4.4 | silence_duration: 0.6',
      '[silencedetect @ 0x1] silence_start: 7.9',
      '[silencedetect @ 0x1] silence_end: 8.3 | silence_duration: 0.4',
      'size=N/A time=00:00:12.00',
    ].join('\n')
    expect(pausesOf(err)).toEqual([
      { start: 3.8, end: 4.4 },
      { start: 7.9, end: 8.3 },
    ])
    expect(pausesOf('')).toEqual([])
  })

  it('cuts at the pause nearest each even cut, within the window', () => {
    // 12 s in three: even cuts at 4 s and 8 s; pauses at 4.1 s and 8.1 s.
    const cuts = cutPoints(
      12_000,
      [
        { start: 3.8, end: 4.4 },
        { start: 7.9, end: 8.3 },
      ],
      3
    )
    expect(cuts).toEqual([4100, 8100])
    // No pause near: the even cut stands.
    expect(cutPoints(12_000, [{ start: 0.2, end: 0.4 }], 3)).toEqual([
      4000, 8000,
    ])
    // A pause that would leave a piece shorter than the floor is not taken.
    expect(cutPoints(6_000, [{ start: 0.5, end: 1.1 }], 2)).toEqual([3000])
    expect(cutAt(4000, 4000 + SPEC.NOTES_CUT_WINDOW_MS)).toBe(
      4000 + SPEC.NOTES_CUT_WINDOW_MS
    )
    expect(cutAt(4000, 4000 + SPEC.NOTES_CUT_WINDOW_MS + 1)).toBe(4000)
  })

  it('cuts a piece out as MP3, from and to in seconds', () => {
    expect(pieceArgs('in.mp3', 4100, 8100, 'out.mp3')).toEqual([
      '-nostdin',
      '-y',
      '-i',
      'in.mp3',
      '-ss',
      '4.100',
      '-to',
      '8.100',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      'out.mp3',
    ])
  })
})

describe('her pieces, on our shelf', () => {
  function notesDeps(o: {
    files?: number
    seconds?: number
    lead?: string | null
  }) {
    const cuts: string[][] = []
    const shelf: string[] = []
    let maxAsked = 0
    const deps: NotesDeps = {
      notes: async () => ({
        lead: o.lead === undefined ? '900000077' : o.lead,
        files: Array.from({ length: o.files ?? 2 }, () => Buffer.from('ogg')),
        seconds: o.seconds ?? 11.4,
      }),
      join: async (_in, _out, max) => {
        maxAsked = max
        return o.seconds ?? 11.4
      },
      ffmpeg: async args => {
        if (args.includes('-af')) {
          return {
            err: 'silence_start: 3.6\nsilence_end: 4.0\nsilence_start: 7.4\nsilence_end: 7.8\n',
          }
        }
        cuts.push(args)
        require('node:fs').writeFileSync(args[args.length - 1], 'mp3')
        return { err: '' }
      },
      put: async (_b, name) => {
        shelf.push(name)
        return { url: `https://ours/${name}` }
      },
    }
    return { deps, cuts, shelf, maxAsked: () => maxAsked }
  }

  it('joins her notes, capped, and puts one piece per scene on the shelf', async () => {
    const t = notesDeps({})
    const r: any = await voicesFromNotes(t.deps, ctx, '900000077', 3)
    expect(t.maxAsked()).toBe(SPEC.NOTES_MAX_SEC)
    expect(r.urls).toHaveLength(3)
    expect(r.seconds).toBe(12)
    expect(t.shelf).toHaveLength(3)
    // Pieces meet at the pauses (3.8 s and 7.6 s), end at her length.
    const spans = t.cuts.map(a => [
      a[a.indexOf('-ss') + 1],
      a[a.indexOf('-to') + 1],
    ])
    expect(spans).toEqual([
      ['0.000', '3.800'],
      ['3.800', '7.600'],
      ['7.600', '11.400'],
    ])
  })

  it('too little of her voice is a reason, not a reel', async () => {
    const t = notesDeps({ seconds: SPEC.NOTES_MIN_SEC - 1 })
    const r: any = await voicesFromNotes(t.deps, ctx, '900000077', 3)
    expect(r.why).toMatch(`нужно от ${SPEC.NOTES_MIN_SEC}`)
    expect(t.shelf).toHaveLength(0)
  })

  it('no notes, or not a private chat: said in words', async () => {
    const none: any = await voicesFromNotes(
      notesDeps({ files: 0 }).deps,
      ctx,
      '900000077',
      3
    )
    expect(none.why).toMatch('не присылала голосовых')
    const group: any = await voicesFromNotes(
      notesDeps({ lead: null }).deps,
      ctx,
      '900000077',
      3
    )
    expect(group.why).toMatch('личного чата')
  })
})

describe('story_reel speaks a recorded piece as it is', () => {
  function tools() {
    const calls: Array<{ name: string; args: any }> = []
    const make = (name: string, answer: (a: any, i: number) => any) => {
      let i = 0
      return {
        name,
        description: '',
        parameters: {},
        handler: async (args: any) => {
          calls.push({ name, args })
          return answer(args, i++)
        },
      }
    }
    const t: Record<string, any> = {
      image_edit: make('image_edit', (_a, i) => ({
        done: true,
        url: `https://ours/still-${i}.png`,
      })),
      audio_generate: make('audio_generate', () => ({
        сделано: true, // cyrillic-ok: audio_generate's own answer key
        url: 'https://ours/synth.mp3',
      })),
      lipsync_generate: make('lipsync_generate', (_a, i) => ({
        done: true,
        url: `https://ours/clip-${i}.mp4`,
        seconds: 4,
      })),
      reel_render: make('reel_render', () => ({
        done: true,
        url: 'https://ours/reel.mp4',
      })),
    }
    return { lookup: (n: string) => t[n], calls }
  }
  const SCENES = [1, 2, 3].map(i => ({
    setting: `room ${i}`,
    line: `line ${i}`,
  }))
  const PIECES = [
    'https://ours/v1.mp3',
    'https://ours/v2.mp3',
    'https://ours/v3.mp3',
  ]

  it('no synthesis for a scene with her piece; the lip-sync gets her audio', async () => {
    const { lookup, calls } = tools()
    const r: any = await makeStoryReelTool(lookup).handler(
      { image_url: 'https://ours/face.jpg', scenes: SCENES },
      { ...(ctx as object), storyVoices: PIECES } as never
    )
    expect(r.done).toBe(true)
    expect(calls.filter(c => c.name === 'audio_generate')).toHaveLength(0)
    const lips = calls.filter(c => c.name === 'lipsync_generate')
    expect(lips.map(c => c.args.voice_url).sort()).toEqual([...PIECES].sort())
  })

  it("a piece in a model's arguments is not a voice: only the job brings one", async () => {
    const { lookup, calls } = tools()
    await makeStoryReelTool(lookup).handler(
      {
        image_url: 'https://ours/face.jpg',
        scenes: SCENES,
        voices: PIECES,
        storyVoices: PIECES,
      },
      ctx
    )
    expect(calls.filter(c => c.name === 'audio_generate')).toHaveLength(3)
  })
})
