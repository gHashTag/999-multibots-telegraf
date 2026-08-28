import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A2A tasks/get must return a task only to its owner.
 *
 * WHAT WAS WRONG. tasks/get did `const t = TASKS.get(params.id); return ok(t)`
 * with no owner check, and the task carried no owner. taskId is client-chosen
 * (message.taskId || randomUUID), so ids are guessable — any authenticated
 * caller could read another user's generation result by its id. Same class as
 * #975 / #983 / #985: identity present (the handler computes `owner`), never
 * compared against the resource. Reported on #901.
 *
 * The owner is now tracked in a parallel TASK_OWNERS map (kept off the wire),
 * and tasks/get folds the owner check into the not-found answer so a caller
 * cannot tell "someone else's task exists" from "no such task".
 *
 * Source-level like the other seam tests here — it pins that the owner is
 * stored and checked, which a refactor could silently drop.
 */

const SRC = path.join(__dirname, 'src', 'agent', 'a2a.ts')

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function code(): string {
  return stripComments(fs.readFileSync(SRC, 'utf8'))
}

function tasksGetBlock(): string {
  const s = code()
  const start = s.indexOf("method === 'tasks/get'")
  if (start === -1) return ''
  const rest = s.slice(start)
  const end = rest.indexOf("method === 'tasks/cancel'")
  return end === -1 ? rest.slice(0, 800) : rest.slice(0, end)
}

describe('A2A tasks/get is owner-scoped (#901)', () => {
  it('the tasks/get block is found', () => {
    expect(tasksGetBlock().length).toBeGreaterThan(0)
  })

  it('remembers each task with its owner', () => {
    const s = code()
    // rememberTask must take an owner and record it
    expect(
      /rememberTask\s*\([^)]*owner/.test(s),
      'rememberTask does not receive an owner'
    ).toBe(true)
    expect(s.includes('TASK_OWNERS'), 'no owner map is kept').toBe(true)
    expect(/TASK_OWNERS\.set\(/.test(s), 'the owner is never stored').toBe(true)
  })

  it('checks the owner before returning the task', () => {
    const block = tasksGetBlock()
    const check = block.search(/TASK_OWNERS\.get\([^)]*\)\s*!==\s*owner/)
    const ret = block.indexOf('return ok(')
    expect(check, 'tasks/get does not compare the owner').toBeGreaterThan(-1)
    expect(ret, 'tasks/get never returns the task').toBeGreaterThan(-1)
    expect(check, 'owner is compared after the task is returned').toBeLessThan(
      ret
    )
  })

  it('evicts the owner alongside the task, keeping the maps in step', () => {
    const s = code()
    // when TASKS shrinks past the cap, TASK_OWNERS must drop the same key
    expect(/TASK_OWNERS\.delete\(/.test(s), 'owner map is never evicted').toBe(
      true
    )
  })
})
