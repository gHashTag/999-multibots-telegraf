/**
 * THE PROMPTS SAY WHAT THE STORY REEL DOES: IT OPENS ON THE FACE AND STAYS IN
 * THE STUDIO.
 *
 * crm-story-reel v21 (owner, 2026-10-03): scene one is the source photo as it
 * is, wide (OPEN_ON_SOURCE); a scene with no setting is a shot of the same
 * photo (STUDIO_SHOTS); a place is drawn only when a caller names it
 * (NEW_SETTING_EACH_SCENE = false). The code obeyed, and the words the agent
 * reads still said "a NEW setting in every scene, the first one too, never
 * the source's background" -- in the system prompt, the CRM gift recipe, the
 * client's reel route, the two story-reel tool descriptions and the duet
 * brief. An agent that writes its own scenes passes them as a script of its
 * own, and a caller's setting IS drawn: the stale line bought a still and a
 * face check per scene and put the client in invented places.
 *
 * Proved on the strings the agent actually reads, plus a scan of the source
 * so a comment that teaches the old rule does not come back either.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as REEL from '../spec/crm-story-reel.gen'
import { STORY_GIFT } from './crm-playbook'
import { reelRouteLine, systemPrompt } from './chat'
import { makeCrmStoryTool, makeMyStoryTool } from './crm-story-tool'

/** "A new setting in every scene", in each word order the prompts used. */
function saysNewPlaceEachScene(text: string): boolean {
  const t = text.toLowerCase()
  return [
    /нов\S* обстановк\S*\s+(в\s+)?кажд/, // cyrillic-ok: the stale phrase
    /кажд\S*\s+—\s+нов\S* обстановк/, // cyrillic-ok: the stale phrase
    /обстановк\S* нов\S* в кажд/, // cyrillic-ok: the stale phrase
    /фон исходника не повторять/, // cyrillic-ok: the stale phrase
    /new setting (in )?(each|every)/,
    /(each|every) (scene )?(a )?new setting/,
  ].some(r => r.test(t))
}

const noDeps = {} as never
const crmTool = makeCrmStoryTool({ deps: () => noDeps } as never)
const myTool = makeMyStoryTool({ deps: () => noDeps } as never)

describe('the story reel the prompts describe is the one the spec makes', () => {
  it('the spec this test reads: the face first, the studio kept', () => {
    expect(REEL.NEW_SETTING_EACH_SCENE).toBe(false)
    expect(REEL.OPEN_ON_SOURCE).toBe(true)
    expect(REEL.STUDIO_SHOTS).toBe(true)
  })

  it('the detector knows every word order the old prompts used', () => {
    for (const old of [
      'каждая — НОВАЯ обстановка его дела', // cyrillic-ok: test fixture
      'его голос, новая обстановка в каждом кадре', // cyrillic-ok: test fixture
      'обстановка новая в КАЖДОЙ, в первой тоже', // cyrillic-ok: test fixture
      'его лицо в новой обстановке каждая', // cyrillic-ok: test fixture
      'твоё лицо в новой обстановке каждой сцены', // cyrillic-ok: test fixture
      'её лицо в новой обстановке в каждом кадре', // cyrillic-ok: test fixture
      'a new setting in every scene',
      'Every scene a new setting',
    ])
      expect(saysNewPlaceEachScene(old), old).toBe(true)
  })

  it('no prompt the agent reads asks for a new place in every scene', () => {
    const read = {
      'system prompt': systemPrompt('miniapp'),
      STORY_GIFT,
      reelRouteLine: reelRouteLine(),
      crm_story_reel: crmTool.description,
      my_story_reel: myTool.description,
    }
    for (const [where, text] of Object.entries(read))
      expect(saysNewPlaceEachScene(text), where).toBe(false)
  })

  it('the CRM recipe and the client route say the face comes first and the studio stays', () => {
    for (const text of [STORY_GIFT, reelRouteLine()]) {
      expect(text).toContain('широко') // cyrillic-ok: the rule's word
      expect(text).toContain('той же студии') // cyrillic-ok: the rule's word
    }
  })

  it('no source file teaches the old rule, in a prompt or a comment', () => {
    const files = [
      'chat.ts',
      'crm-playbook.ts',
      'crm-story-tool.ts',
      'crm-duet-tool.ts',
      'story-reel-tool.ts',
      'story-voice-notes.ts',
    ]
    for (const f of files) {
      const src = readFileSync(join(__dirname, f), 'utf8')
      const stale = src
        .split('\n')
        .filter(line => saysNewPlaceEachScene(line))
        .map(line => line.trim().slice(0, 120))
      expect(stale, f).toEqual([])
    }
  })
})
