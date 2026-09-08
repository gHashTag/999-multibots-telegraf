/**
 * Business auto-reply must be single-flight per sender.
 *
 * handleBusinessMessage calls the paid LLM (chatWithAI → Replicate, ~30s) once
 * per incoming business_message with no concurrency guard. A single customer
 * sending K messages in quick succession spawned K concurrent paid predictions
 * (cost amplification on the platform's REPLICATE_API_TOKEN; the sender only has
 * to be inside an active business conversation).
 *
 * Fix: a module-scope `businessReplyInFlight` Set keyed by chatId — checked with
 * an early return before the reply is generated, added before chatWithAI, and
 * released in a `finally` so the set stays bounded to in-flight chats.
 *
 * chatWithAI reaches Replicate and the middleware wires a real bot, so this
 * asserts the guard structurally, mutation-checked: (1) the `.has()` early-return
 * check precedes the `.add()`; (2) the `.add()` precedes the chatWithAI call;
 * (3) the release happens inside a `finally` via `.delete()`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('business auto-reply is single-flight per sender', () => {
  const src = fs.readFileSync('src/services/businessBotService.ts', 'utf8')

  it('declares a module-scope in-flight set', () => {
    expect(
      /const businessReplyInFlight = new Set<string>\(\)/.test(src),
      'businessReplyInFlight set not declared'
    ).toBe(true)
  })

  it('checks .has() before .add(), and .add() before chatWithAI', () => {
    const hasIdx = src.search(/businessReplyInFlight\.has\(flightKey\)/)
    const addIdx = src.search(/businessReplyInFlight\.add\(flightKey\)/)
    // The reply call: the agent first (answerClient), chatWithAI as its fallback.
    const callIdx = src.search(/await (answerClient|chatWithAI)\(/)
    expect(hasIdx, 'no .has() guard').toBeGreaterThan(-1)
    expect(addIdx, 'no .add()').toBeGreaterThan(-1)
    expect(callIdx, 'chatWithAI call not found').toBeGreaterThan(-1)
    expect(hasIdx, '.has() guard must precede .add()').toBeLessThan(addIdx)
    expect(addIdx, '.add() must precede chatWithAI').toBeLessThan(callIdx)
  })

  it('releases the key in a finally block', () => {
    // The delete must live in a finally so the set does not leak on error.
    const finallyIdx = src.search(/\}\s*finally\s*\{/)
    const deleteIdx = src.search(/businessReplyInFlight\.delete\(flightKey\)/)
    expect(finallyIdx, 'no finally block').toBeGreaterThan(-1)
    expect(deleteIdx, 'no .delete() release').toBeGreaterThan(-1)
    expect(deleteIdx, '.delete() must be inside the finally').toBeGreaterThan(
      finallyIdx
    )
  })
})
