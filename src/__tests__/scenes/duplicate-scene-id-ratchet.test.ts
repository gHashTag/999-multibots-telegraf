/**
 * Registered scenes must have UNIQUE ids (#1343).
 *
 * Telegraf's Scenes.Stage keeps scenes in a Map keyed by scene id, so two
 * registered scenes sharing an id means last-writer-wins: the one added later
 * shadows the earlier, which becomes silently dead. That is exactly how
 * neuroPhotoWizardV2 (id literal 'neuro_photo') shadowed neuroPhotoWizard
 * (id ModeEnum.NeuroPhoto === 'neuro_photo') -- the live mainstream path ran V2
 * while V1 sat registered-but-dead (#1343/#1344).
 *
 * A source-text check cannot catch this: an id may be a string literal OR an
 * enum member, and the collision was literal-vs-enum-value. So this ratchet
 * resolves ids at RUNTIME (scene.id is the resolved string) over the SAME list
 * registerCommands registers, and asserts uniqueness. Population size and
 * resolution are asserted too, so a broken parser/import fails rather than
 * passing vacuously.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import * as barrelScenes from '@/scenes'
import { autoFixerConfigScene } from '@/commands/autofixer/autofixer-config.scene'

/*
 * ПУСТО — И ЭТО РЕЗУЛЬТАТ, А НЕ ЗАБЫТЫЙ СПИСОК.
 *
 * Здесь стояла одна запись: neuroPhotoWizard (V1, id ModeEnum.NeuroPhoto) и
 * neuroPhotoWizardV2 (V2, литерал 'neuro_photo') регистрировались под ОДНИМ
 * идентификатором. Stage у Telegraf last-write-wins, поэтому V2 молча затенял
 * V1, и V1 был мёртвым грузом, помеченным к удалению (#1344).
 *
 * 06.09.2026 регистрация V1 снята: поведение не изменилось (побеждал V2 и
 * раньше), исчезла иллюзия, что живы обе версии. Храповик сработал ровно так,
 * как задуман, — сам потребовал убрать запись, переставшую соответствовать
 * действительности, вместо того чтобы тихо разрешать несуществующее.
 *
 * Пустая карта означает: известных коллизий нет. Новая уронит прогон.
 */
const KNOWN_ID_COLLISIONS: Record<string, string[]> = {}

// Registered scenes NOT re-exported by the '@/scenes' barrel, imported
// explicitly so coverage is complete. A new off-barrel registered scene must be
// added here (the resolution test below fails otherwise).
const OFF_BARREL: Record<string, unknown> = {
  autoFixerConfigScene,
}

const resolveScene = (name: string): { id?: unknown } | undefined =>
  ((barrelScenes as Record<string, unknown>)[name] as { id?: unknown }) ??
  (OFF_BARREL[name] as { id?: unknown })

const registeredNames = (): string[] => {
  const src = fs.readFileSync(
    path.join('src', 'navigation', 'registerCommands.ts'),
    'utf8'
  )
  const m = src.match(/const scenesToRegister = \[([\s\S]*?)\n {2}\]/)
  return (m ? m[1] : '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^[a-zA-Z0-9_]+$/.test(s))
}

const idMap = (names: string[]): Record<string, string[]> => {
  const byId: Record<string, string[]> = {}
  for (const n of names) {
    const s = resolveScene(n)
    if (s && typeof s.id === 'string') (byId[s.id] ||= []).push(n)
  }
  return byId
}

const norm = (a: string[]) => a.slice().sort().join(',')

describe('registered scenes have unique ids (no last-writer-wins shadowing) #1343', () => {
  const names = registeredNames()

  it('parses a non-trivial registered-scene list (a broken parser fails, not passes)', () => {
    expect(
      names.length,
      'parsed too few registered scenes — the scenesToRegister parser likely broke'
    ).toBeGreaterThanOrEqual(50)
  })

  it('every registered scene resolves to a scene object with a string id', () => {
    const unresolved = names.filter(n => {
      const s = resolveScene(n)
      return !s || typeof s.id !== 'string'
    })
    expect(
      unresolved,
      'these registered scenes did not resolve to a scene with an id — add them to OFF_BARREL:\n' +
        unresolved.join('\n')
    ).toEqual([])
  })

  it('no two registered scenes share an id (except known, tracked collisions)', () => {
    const dupes = Object.entries(idMap(names)).filter(([, v]) => v.length > 1)
    const unexpected = dupes
      .filter(([id, vars]) => {
        const known = KNOWN_ID_COLLISIONS[id]
        return !known || norm(known) !== norm(vars)
      })
      .map(([id, v]) => `${id}: ${v.join(', ')}`)
    expect(
      unexpected,
      'two registered scenes share a scene id -> Telegraf Stage (last-writer-wins) ' +
        'silently shadows one. Give each a unique id, or add it to ' +
        'KNOWN_ID_COLLISIONS with a tracking issue:\n' +
        unexpected.join('\n')
    ).toEqual([])
  })

  it('no KNOWN_ID_COLLISIONS entry is stale (each still actually collides)', () => {
    const byId = idMap(names)
    const stale = Object.entries(KNOWN_ID_COLLISIONS)
      .filter(([id, vars]) => norm(byId[id] || []) !== norm(vars))
      .map(([id]) => id)
    expect(
      stale,
      'these known-collision entries no longer match reality (fixed / removed?) ' +
        '— update KNOWN_ID_COLLISIONS:\n' +
        stale.join('\n')
    ).toEqual([])
  })
})
