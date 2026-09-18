import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * THE PROMPT MUST NOT SEND THE MODEL TO A SECTION THAT IS NOT THERE.
 *
 * Production, 07.09.2026: `[agent] SOUL.md не найден` on every boot of the
 * render service. Two independent reasons, and the second survives the first:
 *
 *   1. the path counted six `..` where the source tree needs five, so it
 *      resolved one level ABOVE the repository;
 *   2. the render image is built with `apps/vibee-editor` as its context and
 *      copies only `packages/` and `render/`, so the repository-root SOUL.md
 *      never enters the image at all.
 *
 * The damage was not only a missing voice. The system prompt said, without
 * condition, that the 30-day content plan is "в SOUL.md ниже" -- and nothing
 * was below. A model told to consult a section it cannot see has one move
 * left: ask the person. Which is exactly the complaint ("asks instead of
 * doing").
 *
 * So the pointer now travels WITH the voice, and the plan is the agent's own
 * job when there is no voice.
 */

const load = async () => {
  vi.resetModules()
  return await import('./src/agent/chat.ts')
}

describe('the agent is never told about a voice it does not have', () => {
  /*
   * The no-voice branch cannot be reached by pointing SOUL_MD_PATH at nothing:
   * the walk starts inside this repository and finds the real SOUL.md a few
   * levels up -- which is the whole point of the walk, and the first version
   * of this test failed exactly there. To exercise the branch the module has
   * to be unable to read ANY file, which is what production looks like: the
   * file is not in the image.
   */
  const loadWithNoReadableFiles = async () => {
    vi.resetModules()
    vi.doMock('node:fs', () => ({
      readFileSync: () => {
        throw new Error('ENOENT: nothing is readable in this test')
      },
      default: {
        readFileSync: () => {
          throw new Error('ENOENT: nothing is readable in this test')
        },
      },
    }))
    const mod = await import('./src/agent/chat.ts')
    vi.doUnmock('node:fs')
    return mod
  }

  it('does not point at a content plan that is not in the prompt', async () => {
    const { systemPrompt } = await loadWithNoReadableFiles()
    const prompt = systemPrompt()
    expect(prompt).not.toContain('в SOUL.md ниже')
    expect(prompt).not.toContain('ГОЛОС ВЛАДЕЛЬЦА')
    expect(prompt).not.toContain('КОНТЕНТ-ПЛАН НА 30 ДНЕЙ')
  })

  it('tells the agent to produce the plan itself instead of asking', async () => {
    const { systemPrompt } = await loadWithNoReadableFiles()
    const prompt = systemPrompt()
    expect(prompt).toContain('Контент-план на 30 дней')
    expect(prompt).toContain('составь САМ')
    expect(prompt).toContain('не спрашивай разрешения')
  })
})

describe('when the voice is there, the prompt says where it is', () => {
  const kept = process.env.SOUL_MD_PATH
  let file: string

  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'with-soul-'))
    file = path.join(dir, 'SOUL.md')
    fs.writeFileSync(file, 'МЕРА ВМЕСТО ПРИЛАГАТЕЛЬНОГО', 'utf8')
    process.env.SOUL_MD_PATH = file
  })
  afterEach(() => {
    if (kept === undefined) delete process.env.SOUL_MD_PATH
    else process.env.SOUL_MD_PATH = kept
  })

  it('carries the voice and the pointer together, never one without the other', async () => {
    const { systemPrompt } = await load()
    const prompt = systemPrompt()
    expect(prompt).toContain('МЕРА ВМЕСТО ПРИЛАГАТЕЛЬНОГО')
    expect(prompt).toContain('ГОЛОС ВЛАДЕЛЬЦА')
    expect(prompt).toContain('КОНТЕНТ-ПЛАН НА 30 ДНЕЙ')
    // The pointer is worthless above the voice it points at.
    expect(prompt.indexOf('КОНТЕНТ-ПЛАН НА 30 ДНЕЙ')).toBeLessThan(
      prompt.indexOf('МЕРА ВМЕСТО ПРИЛАГАТЕЛЬНОГО')
    )
  })
})

describe('the file is found by walking up, not by counting', () => {
  const kept = process.env.SOUL_MD_PATH
  beforeEach(() => {
    delete process.env.SOUL_MD_PATH
  })
  afterEach(() => {
    if (kept !== undefined) process.env.SOUL_MD_PATH = kept
  })

  /**
   * This is the check the old code fails. From `render/src/agent` the
   * repository root is five levels up; the code asked for six and looked one
   * level above the repository, where there is no SOUL.md and never was.
   */
  /*
   * THE FILE MOVED INTO THE SERVICE, and that is the point of the move.
   *
   * It used to sit at the repository root, one level ABOVE this service's
   * Docker build context, so the image never had it and every answer in
   * production was written without the owner's voice. It now lives beside the
   * code that reads it, where `COPY render/ ./` carries it in.
   */
  it("finds the service's own SOUL.md with no environment variable set", async () => {
    const soul = path.join(__dirname, 'SOUL.md')
    expect(fs.existsSync(soul)).toBe(true)

    const { systemPrompt } = await load()
    const prompt = systemPrompt()
    expect(prompt).toContain('ГОЛОС ВЛАДЕЛЬЦА')

    const head = fs.readFileSync(soul, 'utf8').trim().slice(0, 40)
    expect(prompt).toContain(head)
  })
})
