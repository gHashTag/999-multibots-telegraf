/**
 * The bot and the render make a person's topic tabs with one protocol: the
 * render's copy of the engine (its Docker context cannot reach src/) must be
 * the bot's engine byte for byte. Copy src/navigation/topics/engine.ts over
 * apps/vibee-editor/render/src/topic-tabs-engine.ts after any change.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

describe('topic tabs engine: one protocol for the bot and the render', () => {
  it('the render copy is the bot engine, byte for byte', () => {
    expect(read('apps/vibee-editor/render/src/topic-tabs-engine.ts')).toBe(
      read('src/navigation/topics/engine.ts')
    )
  })
})
